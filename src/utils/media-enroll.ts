// Media plumbing for the guided Voice ID / Face ID enrollment in Settings.
//
// The settings view only orchestrates *what* to capture and *when*; the low-level
// mechanics — holding a single mic/camera stream open for a whole session, drawing
// a live waveform, voice-activity auto-stop, brightness/face checks, snapshotting a
// frame, and giving Aura a real voice — all live here so the service stays readable.
//
// bindrjs renders fine-grained: a <canvas>/<video> inside a stable `:if` region is
// NOT recreated when sibling `${}` text or `:class` toggles change. So we open ONE
// stream per session, hand the live element to a session object once, and let it draw
// directly to the DOM while the service flips interpolated copy around it.

import { synthesizeSpeech } from "./server-handler";

// ── Spanish enrollment script ────────────────────────────────────────────────
// Each line is framed as a natural request to Aura, so enrollment feels like a short
// chat instead of reading a card aloud. The set is chosen for phonetic spread — every
// vowel, the tap/trill r ("regar"/"recuérdame"), ñ ("mañana"), ll ("pasillo"/"llover"),
// ch ("chimenea"), soft/hard g, and b/v — which is what gives a speaker-embedding the
// most to work with. `reply` is what Aura actually says back (real TTS), so the user
// hears the house respond to each request.
export type VoiceLine = { ask: string; reply: string };
export const VOICE_SCRIPT: VoiceLine[] = [
  {
    ask: "Aura, enciende la luz del pasillo y sube las persianas.",
    reply: "Listo, encendí la luz del pasillo y subí las persianas.",
  },
  {
    ask: "¿Qué temperatura hace en la cocina ahora mismo?",
    reply: "En la cocina hay veintitrés grados, un ambiente muy agradable.",
  },
  {
    ask: "Por favor, baja el volumen y apaga la chimenea.",
    reply: "Claro, bajé el volumen y apagué la chimenea.",
  },
  {
    ask: "Recuérdame regar las plantas mañana temprano.",
    reply: "Hecho, te recordaré regar las plantas mañana temprano.",
  },
  {
    ask: "¿Va a llover hoy? Cierra las ventanas si empieza a llover.",
    reply: "Según el pronóstico puede llover; cerraré las ventanas si hace falta.",
  },
];

// ── Face poses ───────────────────────────────────────────────────────────────
// A short multi-angle sweep so the gallery captures the face beyond a single flat
// front shot — the difference between "recognises you head-on under this light" and
// "recognises you walking through a doorway". Each pose is one captured sample.
export type FacePose = { key: string; label: string; hint: string; icon: string };
export const FACE_POSES: FacePose[] = [
  { key: "front", label: "Look straight ahead", hint: "Center your face inside the oval.", icon: "iconoir-user" },
  { key: "left", label: "Turn your head slightly left", hint: "Slowly, keep your face in the oval.", icon: "iconoir-arrow-left" },
  { key: "right", label: "Now slightly to the right", hint: "Keep your chin level.", icon: "iconoir-arrow-right" },
  { key: "up", label: "Lift your chin a little", hint: "As if looking at the horizon.", icon: "iconoir-arrow-up" },
  { key: "closer", label: "Lean in a little closer", hint: "Let your face fill the oval.", icon: "iconoir-frame-alt-empty" },
];

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Read a design token off :root so canvas drawing honours the theme (DESIGN §1). */
function token(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Play Aura's reply in her real (Fish TTS) voice; fall back to the browser's own
 *  speech synth if the box TTS is down so the conversation never goes silent. Resolves
 *  when playback finishes (or immediately if nothing can speak). */
export async function speakAura(text: string): Promise<void> {
  try {
    const blob = await synthesizeSpeech(text);
    if (blob && blob.size > 0) {
      await playBlob(blob);
      return;
    }
  } catch {
    /* fall through to the browser voice */
  }
  await browserSpeak(text);
}

function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    const done = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(() => done()); // autoplay blocked → don't hang the flow
  });
}

function browserSpeak(text: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      const es = synth.getVoices().find((v) => /^es(-|_|$)/i.test(v.lang));
      if (es) u.voice = es;
      u.lang = es?.lang || "es-ES";
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.cancel();
      synth.speak(u);
    } catch {
      resolve();
    }
  });
}

// ── Voice session ────────────────────────────────────────────────────────────

export type RecordResult = { blob: Blob; mimeType: string; peak: number };

/**
 * One open microphone for a whole voice-enrollment session: a live analyser feeds
 * both the on-canvas waveform and the voice-activity auto-stop, and each line is
 * recorded off the *same* stream so we never re-prompt for mic permission mid-chat.
 */
export class VoiceSession {
  private stream!: MediaStream;
  private ctx!: AudioContext;
  private analyser!: Analyser;
  private buf!: Uint8Array;
  private raf = 0;
  private canvas: HTMLCanvasElement | null = null;
  private recording = false;

  async open(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const AC: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => {});
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;
    this.buf = new Uint8Array(this.analyser.fftSize);
    src.connect(this.analyser);
  }

  /** Attach the live <canvas> and begin the draw loop (runs for the whole session). */
  bindCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    cancelAnimationFrame(this.raf);
    const draw = () => {
      this.raf = requestAnimationFrame(draw);
      this.render();
    };
    draw();
  }

  /** Instantaneous mic level, 0..1 (RMS of the time-domain signal). */
  level(): number {
    this.analyser.getByteTimeDomainData(this.buf as any);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const v = (this.buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / this.buf.length);
  }

  private render() {
    const canvas = this.canvas;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 280;
    const h = canvas.clientHeight || 56;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const g = canvas.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    this.analyser.getByteTimeDomainData(this.buf as any);
    const bars = 40;
    const gap = 3;
    const bw = (w - gap * (bars - 1)) / bars;
    const accent = this.recording ? token("--color-primary", "#9caf88") : token("--color-text-tertiary", "#b0a89c");
    g.fillStyle = accent;
    const step = Math.floor(this.buf.length / bars);
    for (let i = 0; i < bars; i++) {
      // peak amplitude of this bucket → a centered, mirrored bar
      let peak = 0;
      for (let j = 0; j < step; j++) {
        const v = Math.abs((this.buf[i * step + j] - 128) / 128);
        if (v > peak) peak = v;
      }
      const idle = this.recording ? 0.04 : 0.02;
      const amp = Math.max(idle, Math.min(1, peak * 1.6));
      const bh = amp * (h - 4);
      const x = i * (bw + gap);
      const y = (h - bh) / 2;
      const r = Math.min(bw / 2, 3);
      roundRect(g, x, y, bw, bh, r);
      g.fill();
    }
  }

  setRecording(on: boolean) {
    this.recording = on;
  }

  /**
   * Record one line off the open stream. Stops automatically once the speaker goes
   * quiet (after they've actually said something), so it feels like a conversation —
   * not "talk for exactly N seconds". Capped/floored so a clip is always usable.
   */
  recordLine(opts: { maxMs?: number; minMs?: number; silenceMs?: number } = {}): Promise<RecordResult> {
    const maxMs = opts.maxMs ?? 7000;
    const minMs = opts.minMs ?? 1400;
    const silenceMs = opts.silenceMs ?? 900;
    const VOICE = 0.06; // RMS above this counts as speech

    return new Promise((resolve, reject) => {
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(this.stream);
      } catch (e) {
        return reject(e);
      }
      const chunks: Blob[] = [];
      let peak = 0;
      let spoke = false;
      let quietSince = 0;
      const t0 = performance.now();
      this.setRecording(true);

      const tick = window.setInterval(() => {
        const lvl = this.level();
        if (lvl > peak) peak = lvl;
        const now = performance.now();
        const elapsed = now - t0;
        if (lvl > VOICE) {
          spoke = true;
          quietSince = 0;
        } else if (spoke) {
          if (!quietSince) quietSince = now;
        }
        const silentLongEnough = spoke && quietSince && now - quietSince > silenceMs;
        if (elapsed > maxMs || (silentLongEnough && elapsed > minMs)) stop();
      }, 60);

      const stop = () => {
        window.clearInterval(tick);
        if (recorder.state === "recording") recorder.stop();
      };
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        this.setRecording(false);
        resolve({ blob: new Blob(chunks, { type: recorder.mimeType || "audio/webm" }), mimeType: recorder.mimeType, peak });
      };
      recorder.onerror = (e: any) => {
        window.clearInterval(tick);
        this.setRecording(false);
        reject(e?.error || new Error("recorder error"));
      };
      recorder.start();
    });
  }

  close() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.canvas = null;
    try {
      this.stream?.getTracks().forEach((t) => t.stop());
    } catch {}
    try {
      this.ctx?.close();
    } catch {}
  }
}

type Analyser = AnalyserNode;

// ── Face session ─────────────────────────────────────────────────────────────

export type FaceAssessment = {
  faceOk: boolean; // a face is present + reasonably framed (only meaningful when hasDetector)
  brightnessOk: boolean;
  hint: string; // live coaching for the user, "" when all good
};

/**
 * One open camera for a whole face-enrollment session. Drives a live <video> preview
 * (so the user actually sees themselves in the oval guide instead of trusting a blind
 * snapshot) and, where the browser supports it, uses the Shape-Detection FaceDetector
 * to confirm a face is in frame before we capture — degrading to a brightness check +
 * manual capture when it isn't available.
 */
export class FaceSession {
  private stream!: MediaStream;
  private video!: HTMLVideoElement;
  private detector: any = null;
  readonly hasDetector: boolean = typeof (window as any).FaceDetector === "function";

  async open(video: HTMLVideoElement): Promise<void> {
    this.video = video;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    video.srcObject = this.stream;
    video.muted = true;
    (video as any).playsInline = true;
    await video.play().catch(() => {});
    if (this.hasDetector) {
      try {
        this.detector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      } catch {
        this.detector = null;
      }
    }
  }

  /** Coaching read on the current frame: is a face present, is there enough light. */
  async assess(): Promise<FaceAssessment> {
    const brightness = this.brightness();
    const brightnessOk = brightness > 0.18;
    // Without a detector we can't honestly assert the face is framed, so `faceOk`
    // stays false (the oval is a passive guide + manual capture); the brightness
    // coaching below still applies in that mode.
    let faceOk = false;
    let coverageHint = "";
    if (this.detector) {
      try {
        const faces = await this.detector.detect(this.video);
        if (!faces.length) {
          faceOk = false;
        } else {
          const box = faces[0].boundingBox;
          const frac = box.width / (this.video.videoWidth || 1);
          if (frac < 0.22) {
            faceOk = false;
            coverageHint = "Move a little closer.";
          } else if (frac > 0.85) {
            faceOk = false;
            coverageHint = "Move back a little.";
          } else {
            faceOk = true;
          }
        }
      } catch {
        faceOk = true; // detector hiccup → don't block the user
      }
    }
    let hint = "";
    if (!brightnessOk) hint = "Find more light on your face.";
    else if (this.detector && !faceOk) hint = coverageHint || "I can't see your face clearly — center it in the oval.";
    return { faceOk: faceOk && brightnessOk, brightnessOk, hint };
  }

  /** Average luminance of a downscaled frame, 0..1 — a cheap "is it too dark" gauge. */
  private brightness(): number {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 24;
    const g = c.getContext("2d")!;
    try {
      g.drawImage(this.video, 0, 0, c.width, c.height);
    } catch {
      return 1;
    }
    const { data } = g.getImageData(0, 0, c.width, c.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    }
    return sum / (data.length / 4);
  }

  /** Snapshot the current preview frame as a JPEG to enroll. */
  capture(): Promise<Blob> {
    const w = this.video.videoWidth || 640;
    const h = this.video.videoHeight || 480;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(this.video, 0, 0, w, h);
    return new Promise<Blob>((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("capture failed"))), "image/jpeg", 0.92),
    );
  }

  close() {
    try {
      this.stream?.getTracks().forEach((t) => t.stop());
    } catch {}
    if (this.video) this.video.srcObject = null;
  }
}

// Small canvas helper — rounded rect path (older Safari lacks roundRect()).
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}
