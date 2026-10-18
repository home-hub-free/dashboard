import { Component } from "../../core/component";
import { bus } from "../../core/bus";
import { store } from "../../store/store";
import { plainData } from "../../core/plain-data";
import template from "./agenda.html?raw";
import AgendaItemOverlay from "./overlay-views/agenda-item-overlay.html?raw";
import { closeOverlay, getOverlayData, openOverlay } from "../../components/overlay-modal/overlay-modal";
import { showToaster } from "../../components/popup-message/popup-message";
import { getGlobalPosition } from "../../utils/utils.service";
import { currentUser, listUsers } from "../../utils/auth";
import type { AgendaForm, AgendaItem, AgendaItemView, AgendaKind, AgendaState, Person } from "./agenda.model";
import {
  DOW_LABELS, buildCells, createAgendaItem, dateKey, dayLabel, decorate, deleteAgendaItem, emptyForm, fetchAgenda,
  formFromItem, formHint, formToBody, gridRange, itemsOn, monthLabel, updateAgendaItem, upcomingGroups, zoneChoices,
} from "./agenda.service";

/**
 * Agenda view (LOCAL_AGENDA) — the household calendar: a month grid, the selected day's list, the
 * next seven days, and one create/edit overlay for events + reminders. Everything is read from and
 * written to the hub (`/agenda`); the hub scheduler speaks the reminders through the satellites.
 *
 * Non-reactive working state (the visible month, the fetched occurrences, the roster) lives on the
 * class, not the bind — only derived, plain view data is bound (the audit D14 pattern the
 * automations list uses). A refetch happens on month change and on every `agenda:changed` bus event
 * (the hub's `agenda-update` socket mirror), so a reminder set by voice shows up without a reload.
 */
class AgendaContentClass extends Component<AgendaState> {
  private year = new Date().getFullYear();
  private month = new Date().getMonth();
  private selectedKey = dateKey(new Date());
  private items: AgendaItemView[] = [];
  private people: Person[] = [];
  private unsubscribeChanged?: () => void;
  private loadSeq = 0;

  mount() {
    const today = new Date();
    this.year = today.getFullYear();
    this.month = today.getMonth();
    this.selectedKey = dateKey(today);
    this.items = [];
    this.createBind({
      id: "agenda",
      template,
      bind: {
        monthLabel: monthLabel(this.year, this.month),
        dows: DOW_LABELS,
        cells: buildCells(this.year, this.month, [], this.selectedKey, today),
        selectedKey: this.selectedKey,
        selectedLabel: dayLabel(this.selectedKey, today),
        selectedItems: [],
        upcoming: [],
        loaded: false,
        error: "",
        pendingDeleteId: null,
        prevMonth: () => this.shiftMonth(-1),
        nextMonth: () => this.shiftMonth(1),
        goToday: () => this.goToday(),
        selectDay: (key: string) => this.selectDay(key),
        newItem: (event: MouseEvent, kind: AgendaKind) => this.openForm(event, kind, null),
        editItem: (event: MouseEvent, id: string, start: string) => this.openEdit(event, id, start),
        requestDelete: (id: string) => { this.bind.pendingDeleteId = id; },
        cancelDelete: () => { this.bind.pendingDeleteId = null; },
        confirmDelete: (id: string) => this.confirmDelete(id),
      },
    });

    this.unsubscribeChanged = bus.on("agenda:changed", () => { if (this.mounted) this.load(); });

    this.loadPeople().then(() => this.load());
  }

  unmount() {
    this.unsubscribeChanged?.();
    super.unmount();
  }

  // ── data ────────────────────────────────────────────────────────────────────────────────────

  private async loadPeople() {
    const me = currentUser();
    const fallback: Person[] = me ? [{ id: me.id, name: me.displayName }] : [];
    try {
      const users = await listUsers();
      this.people = users.map((u) => ({ id: u.id, name: u.displayName }));
    } catch {
      this.people = fallback;
    }
    if (!this.people.length) this.people = fallback;
  }

  private async load() {
    const seq = ++this.loadSeq;
    const { from, to } = gridRange(this.year, this.month);
    try {
      const raw: AgendaItem[] = await fetchAgenda(from, to);
      if (!this.mounted || seq !== this.loadSeq) return; // a newer load (month flip) superseded this one
      this.items = decorate(raw, this.people);
      this.bind.error = "";
    } catch (e: any) {
      if (!this.mounted || seq !== this.loadSeq) return;
      this.items = [];
      this.bind.error = "Couldn't reach the hub's agenda.";
    }
    this.bind.loaded = true;
    this.render();
  }

  private render() {
    const today = new Date();
    this.bind.monthLabel = monthLabel(this.year, this.month);
    this.bind.cells = buildCells(this.year, this.month, this.items, this.selectedKey, today);
    this.bind.selectedKey = this.selectedKey;
    this.bind.selectedLabel = dayLabel(this.selectedKey, today);
    this.bind.selectedItems = itemsOn(this.items, this.selectedKey);
    this.bind.upcoming = upcomingGroups(this.items, today, 7, this.selectedKey);
  }

  // ── navigation ─────────────────────────────────────────────────────────────────────────────

  private shiftMonth(delta: number) {
    const d = new Date(this.year, this.month + delta, 1);
    this.year = d.getFullYear();
    this.month = d.getMonth();
    this.bind.pendingDeleteId = null;
    this.render(); // repaint the grid immediately (counts refill when the fetch lands)
    this.load();
  }

  private goToday() {
    const today = new Date();
    const sameMonth = today.getFullYear() === this.year && today.getMonth() === this.month;
    this.year = today.getFullYear();
    this.month = today.getMonth();
    this.selectedKey = dateKey(today);
    this.bind.pendingDeleteId = null;
    this.render();
    if (!sameMonth) this.load();
  }

  private selectDay(key: string) {
    this.selectedKey = key;
    this.bind.pendingDeleteId = null;
    // A day from the leading/trailing week belongs to the neighbouring month — follow it.
    const d = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1);
    if (d.getFullYear() !== this.year || d.getMonth() !== this.month) {
      this.year = d.getFullYear();
      this.month = d.getMonth();
      this.render();
      this.load();
      return;
    }
    this.render();
  }

  // ── create / edit / delete ─────────────────────────────────────────────────────────────────

  private openForm(event: MouseEvent, kind: AgendaKind, form: AgendaForm | null) {
    const zones: string[] = store.get("zones") || [];
    const data = form ?? emptyForm(kind, this.selectedKey, this.people, zones, new Date());
    const rect = getGlobalPosition(event.target as HTMLElement);
    openOverlay({
      template: AgendaItemOverlay,
      data,
      actions: {
        hint: (f: AgendaForm) => formHint(f),
        setKind: (k: AgendaKind, f: AgendaForm) => { f.kind = k; if (k === "reminder") f.allDay = false; },
        toggleAllDay: (f: AgendaForm) => { f.allDay = !f.allDay; },
        setRepeat: (r: string, f: AgendaForm) => { f.repeat = r; },
        toggleDay: (day: number, f: AgendaForm) => {
          // Reassign (never mutate in place) so the chips' :class re-evaluates (DESIGN.md §7).
          f.weeklyDays = f.weeklyDays.includes(day) ? f.weeklyDays.filter((d) => d !== day) : [...f.weeklyDays, day];
        },
        setRemind: (r: string, f: AgendaForm) => { f.remind = r; },
        setPerson: (id: string, f: AgendaForm) => { f.forPerson = id; },
        save: () => this.save(),
        cancel: () => closeOverlay(),
      },
      startRect: rect,
      padding: { x: 10, y: 60 },
    });
  }

  private openEdit(event: MouseEvent, id: string, start: string) {
    const item = this.items.find((it) => it.id === id && it.start === start) ?? this.items.find((it) => it.id === id);
    if (!item) return;
    const zones: string[] = store.get("zones") || [];
    this.openForm(event, item.kind, formFromItem(plainData(item), this.people, zones));
  }

  private async save() {
    // Always act on the LIVE overlay data (getOverlayData), never a captured reference (overlay-modal D11/D16).
    const live: AgendaForm = getOverlayData();
    if (live.saving || formHint(live)) return;
    live.saving = true;
    live.error = "";
    const body = formToBody(live);
    try {
      if (live.id) await updateAgendaItem(live.id, body);
      else await createAgendaItem(body);
      closeOverlay();
      showToaster({ from: "bottom", message: live.id ? "Saved" : live.kind === "reminder" ? "Reminder set" : "Event added", timer: 2000 });
      // The hub also mirrors the change over the socket; load now so the grid never lags a tap.
      this.selectedKey = live.kind && body.start ? String(body.start).slice(0, 10) : this.selectedKey;
      const d = new Date(Number(this.selectedKey.slice(0, 4)), Number(this.selectedKey.slice(5, 7)) - 1, 1);
      this.year = d.getFullYear();
      this.month = d.getMonth();
      await this.load();
    } catch (e: any) {
      const still: AgendaForm = getOverlayData();
      if (still) {
        still.saving = false;
        still.error = e?.message || "Couldn't save";
      }
    }
  }

  private async confirmDelete(id: string) {
    this.bind.pendingDeleteId = null;
    try {
      await deleteAgendaItem(id);
      showToaster({ from: "bottom", message: "Deleted", timer: 1800 });
      await this.load();
    } catch (e: any) {
      showToaster({ from: "bottom", message: e?.message || "Couldn't delete", timer: 2500 });
    }
  }
}

export const AgendaContent = new AgendaContentClass();

// Keep the zone-choice helper reachable for the overlay's future "room" refresh without a re-import cycle.
export { zoneChoices };
