import { showToaster } from "../../components/popup-message/popup-message";
import { blobToWav16k } from "../../utils/audio-wav";
import {
  AgentAction,
  askAgent,
  reportVoiceTurn,
  synthesizeSpeech,
  transcribeAudio,
  VoiceTurnStages,
} from "../../utils/server-handler";
import { AssistantMenuState } from "./assistant.model";

/** Monotonic clock for stage timings (immune to wall-clock jumps); ms. */
const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();
const newTurnId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);

export type VoiceState =
  | "idle"
  | "recording"
  | "transcribing"
  | "thinking"
  | "speaking";

/**
 * Hold-to-talk voice request: capture mic audio, transcribe it (Whisper),
 * ask the agent (llm-gateway /route), then show + speak the reply (Fish TTS,
 * played in the browser).
 *
 * Capture state (recorder / stream / chunks) lives here, not on the reactive
 * bind — only the user-visible fields (state, transcript, reply, action) are
 * pushed onto the assistant bind so bindrjs re-renders.
 */
export class VoiceAskServiceClass {
  private state!: AssistantMenuState;
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private chunks: Blob[] = [];
  private audio = new Audio();
  // Per-turn E2E timing: id minted at record start; capture stamps bracket the recording.
  private turnId = "";
  private tRecStart = 0;
  private tRecStop = 0;

  /** Wire the service to the assistant bind so UI updates are reactive. */
  attach(state: AssistantMenuState) {
    this.state = state;
  }

  /** pointer-down on the talk button. */
  async start() {
    if (!this.state || this.state.voiceState !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      return this.fail("Microphone needs a secure (https) connection");
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return this.fail("Microphone access denied");
    }
    this.chunks = [];
    this.turnId = newTurnId();
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => this.process();
    this.recorder.start();
    this.tRecStart = now();
    this.state.voiceTranscript = "";
    this.state.voiceReply = "";
    this.state.voiceAction = "";
    this.state.voiceState = "recording";
  }

  /** pointer-up / leave on the talk button. */
  stop() {
    if (this.recorder?.state === "recording") {
      this.tRecStop = now();
      this.recorder.stop();
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
  }

  /**
   * Typed-request path: send text straight to the agent — no mic, no STT — for
   * when the user can't (or doesn't want to) speak. Mirrors the tail of
   * `process()`: same conversation bubbles, same spoken reply, same turn beacon.
   * Identity rides `askAgent`, so it acts as the signed-in member, exactly like
   * the dashboard's manual controls.
   */
  async ask(text: string) {
    const msg = (text || "").trim();
    if (!this.state || !msg) return;
    if (this.state.voiceState !== "idle") return; // a turn is already in flight

    const turnId = newTurnId();
    const stages: VoiceTurnStages = {};
    const turnStart = now();
    let ok = false;
    let errMsg: string | undefined;
    let reply = "";
    let tool: string | undefined;

    // Echo the typed request into the shared conversation surface.
    this.state.voiceTranscript = msg;
    this.state.voiceReply = "";
    this.state.voiceAction = "";

    try {
      this.state.voiceState = "thinking";
      let t = now();
      const r = await askAgent(msg);
      stages.agent = Math.round(now() - t);
      reply = r.speech;
      tool = r.action && "tool" in r.action ? r.action.tool : undefined;
      this.state.voiceReply = r.speech;
      this.state.voiceAction = actionLabel(r.action);

      if (r.speech) {
        this.state.voiceState = "speaking";
        t = now();
        const audioBlob = await synthesizeSpeech(r.speech);
        stages.tts = Math.round(now() - t);
        t = now();
        await this.play(audioBlob);
        stages.playback = Math.round(now() - t);
      }
      ok = true;
      this.state.voiceState = "idle";
    } catch (err: any) {
      const m: string = err?.message || "Request failed";
      errMsg = m;
      this.fail(m);
    } finally {
      reportVoiceTurn({
        id: turnId,
        path: "dashboard-text",
        transcript: msg,
        reply,
        tool,
        ok,
        error: ok ? undefined : errMsg,
        stages,
        totalMs: Math.round(now() - turnStart),
      });
    }
  }

  /** Full round-trip once recording stops. */
  private async process() {
    const type = this.recorder?.mimeType || "audio/webm";
    const blob = new Blob(this.chunks, { type });
    if (!blob.size) {
      this.state.voiceState = "idle";
      return;
    }

    // E2E latency stitch: time each stage (capture → STT → agent → TTS → playback) and beacon the
    // assembled turn to ops (via the gateway) in `finally`, so even a failed turn reports how far it
    // got and where the time went. See OBSERVABILITY_PLAN.md P0-3.
    const stages: VoiceTurnStages = {};
    if (this.tRecStop > this.tRecStart) {
      stages.capture = Math.round(this.tRecStop - this.tRecStart);
    }
    const turnStart = now();
    let ok = false;
    let errMsg: string | undefined;
    let transcript = "";
    let reply = "";
    let tool: string | undefined;

    try {
      this.state.voiceState = "transcribing";
      // Worker reads via libsndfile (no webm) — re-encode to 16 kHz mono WAV first.
      const wav = await blobToWav16k(blob);
      let t = now();
      const stt = await transcribeAudio(wav);
      stages.stt = Math.round(now() - t);
      if (stt.inferSec != null) stages.sttCompute = Math.round(stt.inferSec * 1000);
      if (!stt.text) {
        errMsg = "empty transcript";
        return this.fail("Didn't catch that — try again");
      }
      transcript = stt.text;
      this.state.voiceTranscript = stt.text;

      this.state.voiceState = "thinking";
      t = now();
      const r = await askAgent(stt.text);
      stages.agent = Math.round(now() - t);
      reply = r.speech;
      tool = r.action && "tool" in r.action ? r.action.tool : undefined;
      this.state.voiceReply = r.speech;
      this.state.voiceAction = actionLabel(r.action);

      if (r.speech) {
        this.state.voiceState = "speaking";
        t = now();
        const audioBlob = await synthesizeSpeech(r.speech);
        stages.tts = Math.round(now() - t);
        t = now();
        await this.play(audioBlob);
        stages.playback = Math.round(now() - t);
      }
      ok = true;
      this.state.voiceState = "idle";
    } catch (err: any) {
      const msg: string = err?.message || "Voice request failed";
      errMsg = msg;
      this.fail(msg);
    } finally {
      reportVoiceTurn({
        id: this.turnId,
        transcript,
        reply,
        tool,
        ok,
        error: ok ? undefined : errMsg,
        stages,
        totalMs: Math.round(now() - turnStart) + (stages.capture ?? 0),
      });
    }
  }

  private play(blob: Blob): Promise<void> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      this.audio.src = url;
      const done = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      this.audio.onended = done;
      this.audio.onerror = done;
      this.audio.play().catch(done);
    });
  }

  private fail(message: string) {
    this.stop();
    if (this.state) this.state.voiceState = "idle";
    showToaster({ from: "bottom", message, timer: 2500 });
  }
}

/** Short human label for what the agent did, or "" when it just replied. */
function actionLabel(action?: AgentAction): string {
  if (!action) return "";
  if ("error" in action) return "";
  if (!action.tool || action.tool === "reply") return "";
  return action.tool.replace(/_/g, " ");
}

export const VoiceAskService = new VoiceAskServiceClass();
