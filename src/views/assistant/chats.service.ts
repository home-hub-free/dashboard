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

/** Whether the user is already following the tail of the transcript. The 30s
 *  auto-refresh must NOT yank someone who scrolled up to read history (audit D5);
 *  it only re-pins when they were near the bottom anyway. */
function isNearTranscriptBottom(): boolean {
  const el = document.getElementById("chat-transcript");
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
}

/**
 * Chat-history state for the assistant tab. The hub scopes every call to the signed-in member
 * (you only ever see conversations YOU started — dashboard or satellite), so this service is pure
 * presentation: load the list, open a transcript, start a fresh thread, delete one.
 *
 * The LIVE chat is the newest one without `closedAt`: its transcript is the conversation the
 * composer appends to. Older chats open read-only.
 *
 * Every async path re-checks `this.state === s` after awaiting: `detach()` (view unmount)
 * clears the ref, so an in-flight refresh can never write into a dead bind — which would
 * also retain the whole detached view (audit D7).
 */
export class ChatsServiceClass {
  private state?: AssistantMenuState;
  private timer: ReturnType<typeof setInterval> | null = null;

  attach(state: AssistantMenuState) {
    this.state = state;
  }

  /** View unmounted: stop the poll and drop the bind ref so the detached
   *  assistant DOM can actually be collected. */
  detach() {
    this.stopAutoRefresh();
    this.state = undefined;
  }

  startAutoRefresh() {
    this.stopAutoRefresh();
    this.timer = setInterval(() => void this.refresh(false), REFRESH_MS);
  }

  stopAutoRefresh() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Load the list; keep the current selection when it still exists, else select the live chat.
   *  Diff-before-assign throughout: the 30s tick used to reassign every row and every turn
   *  (all-new objects + keyless :foreach = full DOM teardown of the transcript, audit D5/D6). */
  async refresh(selectDefault = true) {
    const s = this.state;
    if (!s) return;
    let metas: AssistantChatMeta[];
    try {
      metas = await listAssistantChats();
    } catch {
      if (this.state === s) {
        s.chatsError = "Couldn't load conversations — the assistant service may be down.";
      }
      return;
    }
    if (this.state !== s) return;
    if (s.chatsError !== "") s.chatsError = "";
    const liveId = metas.find((m) => !m.closedAt)?.id ?? "";
    if (s.liveChatId !== liveId) s.liveChatId = liveId;
    const rows = metas.map((m) => toRow(m, liveId, s.activeChatId));
    if (JSON.stringify(rows) !== JSON.stringify(s.chatRows)) s.chatRows = rows;

    const activeStillExists = metas.some((m) => m.id === s.activeChatId);
    if (selectDefault && (!s.activeChatId || !activeStillExists)) {
      // Default focus: the live conversation, else the most recent, else an empty composer view.
      await this.select(liveId || metas[0]?.id || "");
    } else if (activeStillExists && s.activeChatId) {
      // Background tick: never force-scroll someone who is reading history.
      await this.loadTranscript(s.activeChatId, "if-follow");
    }
    if (this.state !== s) return;
    // Only now — with the default transcript in — is the first load settled; the
    // panel's skeletons key off this, and DESIGN.md says never flash an empty
    // state ("Nothing yet" / the hello) before the backend has answered once.
    if (!s.chatsLoaded) s.chatsLoaded = true;
  }

  /** Open one chat's transcript. Empty id = a fresh, not-yet-persisted conversation view. */
  async select(id: string) {
    const s = this.state;
    if (!s) return;
    s.activeChatId = id;
    const rows = s.chatRows.map((r) => ({ ...r, active: r.id === id }));
    if (JSON.stringify(rows) !== JSON.stringify(s.chatRows)) s.chatRows = rows;
    s.mobilePane = "chat";
    if (!id) {
      s.activeTurns = [];
      s.activeMeta = null;
      return;
    }
    await this.loadTranscript(id, "always");
  }

  private async loadTranscript(id: string, autoscroll: "always" | "if-follow" = "always") {
    const s = this.state;
    if (!s) return;
    let chat: AssistantChat | null;
    try {
      chat = await getAssistantChat(id);
    } catch {
      chat = null;
    }
    if (!chat || this.state !== s || s.activeChatId !== id) return; // selection moved on while loading
    const meta = {
      id: chat.id,
      surface: chat.surface,
      zone: chat.zone,
      closed: !!chat.closedAt,
    };
    if (JSON.stringify(meta) !== JSON.stringify(s.activeMeta)) s.activeMeta = meta;
    const turns = chat.turns.map((t) => ({
      role: t.role,
      content: t.content,
      time: shortTime(t.ts),
      speakerName: t.speakerName ?? "",
    }));
    // Reassign (never mutate) so the gated transcript region re-renders (DESIGN.md §7) —
    // but only when something actually changed (the :key'd rows then skip untouched DOM).
    const changed = JSON.stringify(turns) !== JSON.stringify(s.activeTurns);
    if (changed) s.activeTurns = turns;
    if (autoscroll === "always") scrollTranscriptToBottom();
    else if (changed && isNearTranscriptBottom()) scrollTranscriptToBottom();
  }

  /** "New chat": close the live thread (it stays in history) and focus a fresh conversation. */
  async startNew() {
    const s = this.state;
    if (!s) return;
    try {
      await closeAssistantChat();
    } catch {
      showToaster({ from: "bottom", message: "Couldn't start a new chat", timer: 2500 });
      return;
    }
    if (this.state !== s) return;
    s.activeChatId = "";
    s.activeTurns = [];
    s.activeMeta = null;
    s.mobilePane = "chat";
    await this.refresh(false);
  }

  async remove(id: string) {
    const s = this.state;
    if (!s) return;
    try {
      await deleteAssistantChat(id);
    } catch {
      showToaster({ from: "bottom", message: "Couldn't delete the conversation", timer: 2500 });
      return;
    }
    if (this.state !== s) return;
    if (s.activeChatId === id) {
      s.activeChatId = "";
      s.activeTurns = [];
      s.activeMeta = null;
    }
    await this.refresh();
  }

  /** A composer turn just completed — reflect it. The turn was appended to the LIVE thread by the
   *  gateway; if the user was viewing an old chat we jump focus to where their words actually went. */
  async onTurnComplete() {
    const s = this.state;
    if (!s) return;
    await this.refresh(false);
    if (this.state !== s) return;
    const live = s.liveChatId;
    if (live && s.activeChatId !== live) await this.select(live);
    else if (s.activeChatId) await this.loadTranscript(s.activeChatId, "always");
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
