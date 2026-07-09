import {
  AssistantChat,
  AssistantChatMeta,
  closeAssistantChat,
  deleteAssistantChat,
  getAssistantChat,
  listAssistantChats,
} from "../../utils/server-handler";
import { showToaster } from "../../components/popup-message/popup-message";
import { AssistantMenuState, ChatListRow } from "./assistant.model";

/** How often the open tab re-syncs the list — picks up satellite conversations happening in
 *  parallel (you talk to a room, the chat appears here) without a manual refresh. */
const REFRESH_MS = 30_000;

/** Pin the transcript to its newest turn. A chat reads bottom-up: on open, after a turn, and when
 *  an in-flight bubble appears, the latest exchange must be on screen — critical on a phone where
 *  a long thread is many screens tall. Double-rAF so bindrjs has painted the new nodes first. */
export function scrollTranscriptToBottom(): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const el = document.getElementById("chat-transcript");
      if (el) el.scrollTop = el.scrollHeight;
    }),
  );
}

/**
 * Chat-history state for the assistant tab. The hub scopes every call to the signed-in member
 * (you only ever see conversations YOU started — dashboard or satellite), so this service is pure
 * presentation: load the list, open a transcript, start a fresh thread, delete one.
 *
 * The LIVE chat is the newest one without `closedAt`: its transcript is the conversation the
 * composer appends to. Older chats open read-only.
 */
export class ChatsServiceClass {
  private state!: AssistantMenuState;
  private timer: ReturnType<typeof setInterval> | null = null;

  attach(state: AssistantMenuState) {
    this.state = state;
  }

  startAutoRefresh() {
    this.stopAutoRefresh();
    this.timer = setInterval(() => void this.refresh(false), REFRESH_MS);
  }

  stopAutoRefresh() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Load the list; keep the current selection when it still exists, else select the live chat. */
  async refresh(selectDefault = true) {
    if (!this.state) return;
    let metas: AssistantChatMeta[];
    try {
      metas = await listAssistantChats();
    } catch {
      this.state.chatsError = "Couldn't load conversations — the assistant service may be down.";
      return;
    }
    this.state.chatsError = "";
    const liveId = metas.find((m) => !m.closedAt)?.id ?? "";
    this.state.liveChatId = liveId;
    this.state.chatRows = metas.map((m) => toRow(m, liveId, this.state.activeChatId));

    const activeStillExists = metas.some((m) => m.id === this.state.activeChatId);
    if (selectDefault && (!this.state.activeChatId || !activeStillExists)) {
      // Default focus: the live conversation, else the most recent, else an empty composer view.
      await this.select(liveId || metas[0]?.id || "");
    } else if (activeStillExists && this.state.activeChatId) {
      await this.loadTranscript(this.state.activeChatId);
    }
    // Only now — with the default transcript in — is the first load settled; the
    // panel's skeletons key off this, and DESIGN.md says never flash an empty
    // state ("Nothing yet" / the hello) before the backend has answered once.
    this.state.chatsLoaded = true;
  }

  /** Open one chat's transcript. Empty id = a fresh, not-yet-persisted conversation view. */
  async select(id: string) {
    if (!this.state) return;
    this.state.activeChatId = id;
    this.state.chatRows = this.state.chatRows.map((r) => ({ ...r, active: r.id === id }));
    this.state.mobilePane = "chat";
    if (!id) {
      this.state.activeTurns = [];
      this.state.activeMeta = null;
      return;
    }
    await this.loadTranscript(id);
  }

  private async loadTranscript(id: string) {
    let chat: AssistantChat | null;
    try {
      chat = await getAssistantChat(id);
    } catch {
      chat = null;
    }
    if (!chat || this.state.activeChatId !== id) return; // selection moved on while loading
    this.state.activeMeta = {
      id: chat.id,
      surface: chat.surface,
      zone: chat.zone,
      closed: !!chat.closedAt,
    };
    // Reassign (never mutate) so the gated transcript region re-renders (DESIGN.md §7).
    this.state.activeTurns = chat.turns.map((t) => ({
      role: t.role,
      content: t.content,
      time: shortTime(t.ts),
      speakerName: t.speakerName ?? "",
    }));
    scrollTranscriptToBottom();
  }

  /** "New chat": close the live thread (it stays in history) and focus a fresh conversation. */
  async startNew() {
    try {
      await closeAssistantChat();
    } catch {
      showToaster({ from: "bottom", message: "Couldn't start a new chat", timer: 2500 });
      return;
    }
    this.state.activeChatId = "";
    this.state.activeTurns = [];
    this.state.activeMeta = null;
    this.state.mobilePane = "chat";
    await this.refresh(false);
  }

  async remove(id: string) {
    try {
      await deleteAssistantChat(id);
    } catch {
      showToaster({ from: "bottom", message: "Couldn't delete the conversation", timer: 2500 });
      return;
    }
    if (this.state.activeChatId === id) {
      this.state.activeChatId = "";
      this.state.activeTurns = [];
      this.state.activeMeta = null;
    }
    await this.refresh();
  }

  /** A composer turn just completed — reflect it. The turn was appended to the LIVE thread by the
   *  gateway; if the user was viewing an old chat we jump focus to where their words actually went. */
  async onTurnComplete() {
    await this.refresh(false);
    const live = this.state.liveChatId;
    if (live && this.state.activeChatId !== live) await this.select(live);
    else if (this.state.activeChatId) await this.loadTranscript(this.state.activeChatId);
    else if (live) await this.select(live);
  }
}

function toRow(m: AssistantChatMeta, liveId: string, activeId: string): ChatListRow {
  return {
    id: m.id,
    title: m.title || "(sin título)",
    when: relativeTime(m.updatedAt),
    voice: m.surface === "voice",
    zone: m.surface === "voice" ? m.zone ?? "" : "",
    live: m.id === liveId,
    active: m.id === activeId,
  };
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Compact relative label for the list: "now", "12m", "3h", "Tue", "Jun 12". */
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const d = new Date(t);
  const days = Math.floor(hours / 24);
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export const ChatsService = new ChatsServiceClass();
