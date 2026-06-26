import { showToaster } from "../../components/popup-message/popup-message";
import { blobToWav16k } from "../../utils/audio-wav";
import {
  AgentAction,
  askAgent,
  synthesizeSpeech,
  transcribeAudio,
} from "../../utils/server-handler";
import { AssistantMenuState } from "./assistant.model";

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
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => this.process();
    this.recorder.start();
    this.state.voiceTranscript = "";
    this.state.voiceReply = "";
    this.state.voiceAction = "";
    this.state.voiceState = "recording";
  }

  /** pointer-up / leave on the talk button. */
  stop() {
    if (this.recorder?.state === "recording") this.recorder.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
  }

  /** Full round-trip once recording stops. */
  private async process() {
    const type = this.recorder?.mimeType || "audio/webm";
    const blob = new Blob(this.chunks, { type });
    if (!blob.size) {
      this.state.voiceState = "idle";
      return;
    }
    try {
      this.state.voiceState = "transcribing";
      // Worker reads via libsndfile (no webm) — re-encode to 16 kHz mono WAV first.
      const wav = await blobToWav16k(blob);
      const text = await transcribeAudio(wav);
      if (!text) return this.fail("Didn't catch that — try again");
      this.state.voiceTranscript = text;

      this.state.voiceState = "thinking";
      const reply = await askAgent(text);
      this.state.voiceReply = reply.speech;
      this.state.voiceAction = actionLabel(reply.action);

      if (reply.speech) {
        this.state.voiceState = "speaking";
        const audioBlob = await synthesizeSpeech(reply.speech);
        await this.play(audioBlob);
      }
      this.state.voiceState = "idle";
    } catch (err: any) {
      this.fail(err?.message || "Voice request failed");
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
