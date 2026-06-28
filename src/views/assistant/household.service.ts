import { showToaster } from "../../components/popup-message/popup-message";
import {
  SessionUser,
  changePassword,
  createUser,
  currentUser,
  deleteUser,
  listUsers,
  logout,
  updateUser,
} from "../../utils/auth";
import {
  enrollVoiceprint,
  forgetVoiceprint,
  getVoiceprintSamples,
  speakerAvailable,
  enrollFace,
  forgetFace,
  getFaceSamples,
  visionAvailable,
  listPeople,
  nameGuest,
  promoteGuest,
} from "../../utils/server-handler";
import { blobToWav16k } from "../../utils/audio-wav";
import {
  VoiceSession,
  FaceSession,
  VOICE_SCRIPT,
  FACE_POSES,
  speakAura,
} from "../../utils/media-enroll";
import type { SettingsState } from "../settings/settings.model";

// Min mic peak (0..1) for a voice line to count — below this we ask the user to retry
// the same line instead of enrolling near-silence.
const MIN_VOICE_PEAK = 0.05;
// How long a face pose must stay framed before the auto-capture countdown fires (ms).
const FACE_STEADY_MS = 500;

/**
 * Household roster management for the assistant settings view: list members,
 * add a new one, tweak a member's display name / tone (the prefs the agent
 * reads), remove a member, and sign out. State lives on the assistant bind so
 * bindrjs re-renders; arrays are reassigned (not mutated) so the proxy notices.
 */
export class HouseholdServiceClass {
  private state!: SettingsState;

  attach(state: SettingsState) {
    this.state = state;
    this.state.meId = currentUser()?.id || "";
    this.refresh();
    this.refreshVoiceSamples();
    this.refreshFaceSamples();
  }

  private async refreshVoiceSamples() {
    // The Voice ID control only appears when the speaker-id service is up (the
    // feature's on/off switch); skip the sample lookup entirely when it's off.
    this.state.voiceIdEnabled = await speakerAvailable();
    const id = currentUser()?.id;
    if (this.state.voiceIdEnabled && id) {
      this.state.voiceSamples = await getVoiceprintSamples(id);
    }
  }

  private async refreshFaceSamples() {
    // The Face ID control + the People roster only appear when the vision-service is
    // up + routed — same on/off pattern as Voice ID.
    this.state.faceIdEnabled = await visionAvailable();
    this.state.peopleEnabled = this.state.faceIdEnabled;
    const id = currentUser()?.id;
    if (this.state.faceIdEnabled && id) {
      this.state.faceSamples = await getFaceSamples(id);
    }
    if (this.state.peopleEnabled) this.refreshPeople();
  }

  // ── People roster (label everyone by default id; admin puts names to faces) ──
  async refreshPeople() {
    this.state.people = await listPeople();
  }

  /** Name a default-labelled person (a `guest:N` cluster) — keeps them a recurring
   * guest, just with a real name. Admin-gated server-side (auth token). */
  async namePerson(id: string, name: string) {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    try {
      await nameGuest(id, trimmed);
      this.state.peopleMsg = `Named ${trimmed}`;
      await this.refreshPeople();
    } catch (err: any) {
      this.state.peopleMsg = err?.message || "Could not name person";
    }
  }

  /** Promote a default-labelled person into an existing household member's face
   * gallery (merges their face into that member). Admin-gated server-side. */
  async promotePerson(id: string, userId: string) {
    if (!userId) return;
    const member = this.state.households.find((u) => u.id === userId);
    try {
      await promoteGuest(id, userId, member?.displayName);
      this.state.peopleMsg = `Linked to ${member?.displayName || userId}`;
      await this.refreshPeople();
    } catch (err: any) {
      this.state.peopleMsg = err?.message || "Could not promote person";
    }
  }

  async refresh() {
    try {
      this.state.households = await listUsers();
    } catch (err: any) {
      this.state.householdError = err?.message || "Could not load household";
    }
  }

  async add() {
    const username = (this.state.newUsername || "").trim();
    const password = this.state.newPassword || "";
    if (!username || !password) {
      this.state.householdError = "Username and password are required";
      return;
    }
    try {
      await createUser({
        username,
        displayName: (this.state.newDisplayName || "").trim() || undefined,
        password,
        prefs: { tone: (this.state.newTone || "").trim() || undefined },
      });
      this.state.newUsername = "";
      this.state.newDisplayName = "";
      this.state.newPassword = "";
      this.state.newTone = "";
      this.state.householdError = "";
      await this.refresh();
      showToaster({ from: "bottom", message: "Member added", timer: 1800 });
    } catch (err: any) {
      this.state.householdError = err?.message || "Could not add member";
    }
  }

  /** Persist a tone edit for a member (the agent reads prefs.tone). */
  async saveTone(id: string, tone: string) {
    try {
      await updateUser(id, { prefs: { tone: tone.trim() || undefined } });
      await this.refresh();
      showToaster({ from: "bottom", message: "Saved", timer: 1400 });
    } catch (err: any) {
      this.state.householdError = err?.message || "Could not save";
    }
  }

  async remove(id: string) {
    try {
      await deleteUser(id);
      await this.refresh();
    } catch (err: any) {
      this.state.householdError = err?.message || "Could not remove member";
    }
  }

  /** Self-service password change for the signed-in member. */
  async changeOwnPassword() {
    const current = this.state.pwCurrent || "";
    const next = this.state.pwNew || "";
    if (!current || !next) {
      this.state.pwError = "Enter your current and new password";
      return;
    }
    try {
      await changePassword(current, next);
      this.state.pwCurrent = "";
      this.state.pwNew = "";
      this.state.pwError = "";
      showToaster({ from: "bottom", message: "Password changed", timer: 1800 });
    } catch (err: any) {
      this.state.pwError = err?.message || "Could not change password";
    }
  }

  // ── Voice ID (guided conversational enrollment) ───────────────────────────
  // Instead of a single blind recording, enrollment is a short chat: the member reads
  // a request to Aura, a live waveform shows the mic is hearing them, the sample is
  // enrolled, and Aura answers back in her real voice. Each line adds one sample to
  // the running-mean profile; the script is phonetically varied for a richer print.
  private voice?: VoiceSession;

  async startVoiceEnroll() {
    if (this.state.enrollActive) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.state.enrollMsg = "Microphone needs a secure (https) connection";
      return;
    }
    const session = new VoiceSession();
    try {
      await session.open();
    } catch {
      this.state.enrollMsg = "Microphone access denied";
      return;
    }
    this.voice = session;
    this.state.enrollTotal = VOICE_SCRIPT.length;
    this.state.enrollStep = 1;
    this.state.enrollAsk = VOICE_SCRIPT[0].ask;
    this.state.enrollReply = "";
    this.state.enrollHint = "";
    this.state.enrollMsg = "";
    this.state.enrollPhase = "ready";
    this.state.enrollActive = true; // renders the conversation card + canvas
    // The canvas only exists once bindrjs has rendered the gated region — grab it on
    // the next frame and start the (session-long) waveform draw loop.
    requestAnimationFrame(() => {
      const canvas = document.getElementById("voice-wave") as HTMLCanvasElement | null;
      if (canvas) session.bindCanvas(canvas);
    });
  }

  /** Record + enroll the current line, then let Aura reply and advance the script. */
  async recordVoiceLine() {
    const session = this.voice;
    if (!session || this.state.enrollPhase !== "ready") return;
    const line = VOICE_SCRIPT[this.state.enrollStep - 1];

    this.state.enrollReply = "";
    this.state.enrollPhase = "recording";
    this.state.enrollHint = "I'm listening — say it naturally.";
    let result;
    try {
      result = await session.recordLine();
    } catch {
      this.state.enrollHint = "";
      this.state.enrollMsg = "Couldn't record — try again";
      this.state.enrollPhase = "ready";
      return;
    }
    // Near-silence → retry the same line rather than enrolling a dud sample.
    if (result.peak < MIN_VOICE_PEAK) {
      this.state.enrollHint = "I barely heard you — speak up and try this line again.";
      this.state.enrollPhase = "ready";
      return;
    }

    this.state.enrollPhase = "saving";
    this.state.enrollHint = "";
    try {
      const wav = await blobToWav16k(result.blob);
      const { samples } = await enrollVoiceprint(wav);
      this.state.voiceSamples = samples;
    } catch (err: any) {
      this.state.enrollMsg = err?.message || "Enrollment failed";
      this.state.enrollPhase = "ready";
      return;
    }

    // Aura answers the request out loud — the payoff that makes this feel like talking
    // to the house, not filling a form.
    this.state.enrollPhase = "aura";
    this.state.enrollReply = line.reply;
    await speakAura(line.reply);

    if (this.state.enrollStep >= this.state.enrollTotal) {
      this.state.enrollPhase = "done";
      this.state.enrollMsg = `All set — your voice is enrolled (${this.state.voiceSamples} sample${this.state.voiceSamples === 1 ? "" : "s"}).`;
    } else {
      this.state.enrollStep += 1;
      this.state.enrollAsk = VOICE_SCRIPT[this.state.enrollStep - 1].ask;
      this.state.enrollPhase = "ready";
    }
  }

  /** Close a voice session — used by both "Cancel" mid-flow and "Done" at the end. */
  cancelVoiceEnroll() {
    this.voice?.close();
    this.voice = undefined;
    this.state.enrollActive = false;
    this.state.enrollPhase = "ready";
    this.state.enrollStep = 0;
    this.state.enrollAsk = "";
    this.state.enrollReply = "";
    this.state.enrollHint = "";
  }

  async forgetVoice() {
    try {
      await forgetVoiceprint();
      this.state.voiceSamples = 0;
      this.state.enrollMsg = "Voiceprint removed";
    } catch (err: any) {
      this.state.enrollMsg = err?.message || "Could not remove voiceprint";
    }
  }

  // ── Face ID (guided multi-angle enrollment) ───────────────────────────────
  // A live preview the member can actually see themselves in (centred in an oval
  // guide) replaces the old blind one-frame grab. We walk through a few poses, give
  // live coaching (lighting / face-in-frame), and capture one sample per pose. Where
  // the browser can detect faces we auto-capture once framed + steady; otherwise the
  // member taps Capture. The vision-service keeps the embeddings keyed to their id.
  private face?: FaceSession;
  private faceLoop = 0;
  private faceSteadySince = 0;
  private faceCountTimer = 0;
  private faceBusy = false; // a capture/countdown is in flight (don't double-fire)

  async startFaceEnroll() {
    if (this.state.faceActive) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.state.faceMsg = "Camera needs a secure (https) connection";
      return;
    }
    // The <video> only exists once the gated region renders — flip active, then attach
    // the stream to it on the next frame.
    this.state.faceTotal = FACE_POSES.length;
    this.state.faceStep = 1;
    this.state.facePose = FACE_POSES[0].label;
    this.state.facePoseHint = FACE_POSES[0].hint;
    this.state.faceHint = "";
    this.state.faceMsg = "";
    this.state.faceReady = false;
    this.state.faceCount = 0;
    this.state.facePhase = "preview";
    this.state.faceActive = true;

    const session = new FaceSession();
    const video = await new Promise<HTMLVideoElement | null>((resolve) =>
      requestAnimationFrame(() => resolve(document.getElementById("face-cam") as HTMLVideoElement | null)),
    );
    if (!video) {
      this.state.faceMsg = "Could not open the camera preview";
      this.state.faceActive = false;
      return;
    }
    try {
      await session.open(video);
    } catch {
      this.state.faceMsg = "Camera access denied";
      this.state.faceActive = false;
      return;
    }
    this.face = session;
    this.state.faceAuto = session.hasDetector;
    this.runFaceLoop();
  }

  /** Coaching/auto-capture loop: assess the frame ~5×/s, drive the ready ring, and —
   *  when a face stays framed and steady — count down and capture hands-free. */
  private runFaceLoop() {
    window.clearInterval(this.faceLoop);
    this.faceLoop = window.setInterval(async () => {
      const session = this.face;
      if (!session || this.state.facePhase === "saving" || this.faceBusy) return;
      const a = await session.assess();
      this.state.faceReady = a.faceOk;
      this.state.faceHint = a.hint;
      if (!session.hasDetector) return; // manual capture mode — no auto countdown
      if (a.faceOk) {
        if (!this.faceSteadySince) this.faceSteadySince = performance.now();
        if (performance.now() - this.faceSteadySince > FACE_STEADY_MS && this.state.faceCount === 0) {
          this.beginFaceCountdown();
        }
      } else {
        this.faceSteadySince = 0;
        this.cancelFaceCountdown();
      }
    }, 200);
  }

  private beginFaceCountdown() {
    window.clearInterval(this.faceCountTimer);
    this.state.faceCount = 3;
    this.faceCountTimer = window.setInterval(() => {
      // Abort if the face left the frame mid-count.
      if (!this.state.faceReady) {
        this.cancelFaceCountdown();
        return;
      }
      this.state.faceCount -= 1;
      if (this.state.faceCount <= 0) {
        window.clearInterval(this.faceCountTimer);
        this.faceCountTimer = 0;
        void this.captureFacePose();
      }
    }, 700);
  }

  private cancelFaceCountdown() {
    if (this.faceCountTimer) {
      window.clearInterval(this.faceCountTimer);
      this.faceCountTimer = 0;
    }
    if (this.state.faceCount !== 0) this.state.faceCount = 0;
  }

  /** Capture the current pose (auto at end of countdown, or the manual Capture tap). */
  async captureFacePose() {
    const session = this.face;
    if (!session || this.faceBusy || this.state.facePhase !== "preview") return;
    this.faceBusy = true;
    this.cancelFaceCountdown();
    this.faceSteadySince = 0;
    this.state.facePhase = "saving";
    this.state.faceHint = "";
    try {
      const jpeg = await session.capture();
      const { samples } = await enrollFace(jpeg);
      this.state.faceSamples = samples;
    } catch (err: any) {
      this.state.faceMsg = err?.message || "Face capture failed";
      this.state.facePhase = "preview";
      this.faceBusy = false;
      return;
    }

    if (this.state.faceStep >= this.state.faceTotal) {
      window.clearInterval(this.faceLoop);
      this.faceLoop = 0;
      this.state.facePhase = "done";
      this.state.faceMsg = `All set — your face is enrolled (${this.state.faceSamples} sample${this.state.faceSamples === 1 ? "" : "s"}).`;
      if (this.state.peopleEnabled) this.refreshPeople();
    } else {
      this.state.faceStep += 1;
      const pose = FACE_POSES[this.state.faceStep - 1];
      this.state.facePose = pose.label;
      this.state.facePoseHint = pose.hint;
      this.state.faceReady = false;
      this.state.facePhase = "preview";
    }
    this.faceBusy = false;
  }

  /** Close a face session — used by both "Cancel" mid-flow and "Done" at the end. */
  cancelFaceEnroll() {
    window.clearInterval(this.faceLoop);
    this.faceLoop = 0;
    this.cancelFaceCountdown();
    this.faceSteadySince = 0;
    this.faceBusy = false;
    this.face?.close();
    this.face = undefined;
    this.state.faceActive = false;
    this.state.facePhase = "preview";
    this.state.faceStep = 0;
    this.state.facePose = "";
    this.state.facePoseHint = "";
    this.state.faceHint = "";
    this.state.faceReady = false;
    this.state.faceCount = 0;
  }

  async forgetFace() {
    try {
      await forgetFace();
      this.state.faceSamples = 0;
      this.state.faceMsg = "Face profile removed";
    } catch (err: any) {
      this.state.faceMsg = err?.message || "Could not remove face profile";
    }
  }

  async signOut() {
    await logout();
    window.location.reload();
  }
}

export const HouseholdService = new HouseholdServiceClass();
export type { SessionUser };
