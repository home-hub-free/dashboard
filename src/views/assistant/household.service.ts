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
} from "../../utils/server-handler";
import { blobToWav16k } from "../../utils/audio-wav";
import { AssistantMenuState } from "./assistant.model";

// How long a single enrollment sample records before auto-stopping.
const ENROLL_MS = 4000;

/**
 * Household roster management for the assistant settings view: list members,
 * add a new one, tweak a member's display name / tone (the prefs the agent
 * reads), remove a member, and sign out. State lives on the assistant bind so
 * bindrjs re-renders; arrays are reassigned (not mutated) so the proxy notices.
 */
export class HouseholdServiceClass {
  private state!: AssistantMenuState;

  attach(state: AssistantMenuState) {
    this.state = state;
    this.state.meId = currentUser()?.id || "";
    this.refresh();
    this.refreshVoiceSamples();
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

  // ── Voice ID (voiceprint enrollment) ──────────────────────────────────────
  // Records a short sample and enrolls it for the signed-in member. Repeat to add
  // samples (the service keeps a running-mean profile) — more samples = better
  // recognition. Identity comes from the voice, so a shared satellite still tells
  // household members apart.
  async enrollVoice() {
    if (this.state.enrollState !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.state.enrollMsg = "Microphone needs a secure (https) connection";
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.state.enrollMsg = "Microphone access denied";
      return;
    }
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      this.state.enrollState = "saving";
      this.state.enrollMsg = "Saving…";
      try {
        const wav = await blobToWav16k(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        const { samples } = await enrollVoiceprint(wav);
        this.state.voiceSamples = samples;
        this.state.enrollMsg = `Enrolled — ${samples} sample${samples === 1 ? "" : "s"}`;
      } catch (err: any) {
        this.state.enrollMsg = err?.message || "Enrollment failed";
      }
      this.state.enrollState = "idle";
    };
    this.state.enrollState = "recording";
    this.state.enrollMsg = "Listening… speak naturally";
    recorder.start();
    setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, ENROLL_MS);
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

  async signOut() {
    await logout();
    window.location.reload();
  }
}

export const HouseholdService = new HouseholdServiceClass();
export type { SessionUser };
