import { VoiceState } from "./voice-ask.service";

/**
 * The Assistant tab — a chat panel for Aura. Left: your conversation history (dashboard AND the
 * satellite threads you started, scoped server-side to the signed-in member). Right: the open
 * transcript + the composer (hold-to-talk / type). Account/household administration lives in
 * Settings (settings.model.ts).
 */

/** One row in the conversation list. */
export type ChatListRow = {
  id: string;
  title: string;
  /** Compact relative time ("now", "12m", "3h", "Tue"). */
  when: string;
  /** Started on a satellite (voice) — shows the mic badge + room chip. */
  voice: boolean;
  zone: string;
  /** The one conversation the composer currently appends to. */
  live: boolean;
  active: boolean;
};

/** One rendered transcript bubble. */
export type ChatViewTurn = {
  role: "user" | "assistant";
  content: string;
  time: string;
  speakerName: string;
};

export type AssistantMenuState = {
  // ── Conversation history ────────────────────────────────────────────────
  chatRows: ChatListRow[];
  chatsLoaded: boolean;
  chatsError: string;
  /** Id of the newest OPEN chat (composer target); "" when none exists yet. */
  liveChatId: string;
  /** The chat whose transcript is open; "" = a fresh, not-yet-persisted conversation. */
  activeChatId: string;
  activeTurns: ChatViewTurn[];
  activeMeta: { id: string; surface: "dashboard" | "voice"; zone?: string; closed: boolean } | null;
  /** Narrow screens show ONE pane at a time. */
  mobilePane: "list" | "chat";
  chatSelect: (id: string) => void;
  chatDelete: (id: string, event: Event) => void;
  chatNew: () => void;
  showList: () => void;

  // ── Composer: typed requests (same agent path as voice) ────────────────
  promptText: string;
  promptSend: () => void;
  promptKey: (event: KeyboardEvent) => void;
  promptGrow: (el: HTMLTextAreaElement) => void;

  // ── Composer: push-to-talk, driven by VoiceAskService ───────────────────
  voiceState: VoiceState;
  voiceTranscript: string;
  voiceReply: string;
  voiceAction: string;
  voiceStart: () => void;
  voiceStop: () => void;
};
