import { server, authedFetch, headers } from "../../utils/server-handler";
import type { AgendaForm, AgendaItem, AgendaItemView, AgendaKind, DayCell, Person, UpcomingGroup } from "./agenda.model";

/**
 * Agenda API client + the pure helpers the view renders from (month grid, day/upcoming lists,
 * form ⇄ request body). Pure functions take `today` so tests can pin the clock.
 */

// ── API ────────────────────────────────────────────────────────────────────────────────────────

export async function fetchAgenda(from: string, to: string): Promise<AgendaItem[]> {
  const res = await fetch(`${server}agenda?from=${from}&to=${to}`, { headers });
  if (!res.ok) throw new Error(`agenda failed (${res.status})`);
  const body = await res.json();
  return Array.isArray(body?.items) ? body.items : [];
}

async function mutate(method: string, path: string, body?: any): Promise<any> {
  const res = await authedFetch(server + path, { method, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `${method} ${path} failed (${res.status})`);
  return data;
}

export const createAgendaItem = (body: Record<string, any>) => mutate("POST", "agenda", body);
export const updateAgendaItem = (id: string, body: Record<string, any>) => mutate("PATCH", `agenda/${encodeURIComponent(id)}`, body);
export const deleteAgendaItem = (id: string) => mutate("DELETE", `agenda/${encodeURIComponent(id)}`);

// ── dates ──────────────────────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOWS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DOW_LABELS = DOWS;

export function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`;
}

/** The fetch window that covers a month grid (6 rows): first grid Monday → last grid Sunday. */
export function gridRange(year: number, month: number): { from: string; to: string } {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const start = new Date(year, month, 1 - lead);
  const end = new Date(start);
  end.setDate(start.getDate() + 41);
  return { from: dateKey(start), to: dateKey(end) };
}

/** "Today", "Tomorrow", or "Tuesday 20 Oct". */
export function dayLabel(key: string, today: Date): string {
  const d = parseKey(key);
  const diff = Math.round((d.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return `${DOWS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/** 12h clock with minutes only when needed ("9:30", "17:05"): local time read off the ISO. */
export function timeLabel(start: string): string {
  if (!start.includes("T")) return "";
  const [h, m] = start.split("T")[1].split(":");
  return `${Number(h)}:${m}`;
}

export function remindLabel(min: number | null | undefined, kind: AgendaKind): string {
  if (kind !== "event" || min == null) return "";
  if (min === 0) return "at start";
  if (min < 60) return `${min} min before`;
  if (min === 60) return "1 h before";
  if (min < 1440) return `${Math.round(min / 60)} h before`;
  return min === 1440 ? "1 day before" : `${Math.round(min / 1440)} days before`;
}

// ── view decoration ───────────────────────────────────────────────────────────────────────────

export function whoLabel(forPerson: string | null, people: Person[]): string {
  if (!forPerson) return "Everyone";
  const hit = people.find((p) => p.id === forPerson || p.name.toLowerCase() === forPerson.toLowerCase());
  return hit ? hit.name : forPerson;
}

export function decorate(items: AgendaItem[], people: Person[]): AgendaItemView[] {
  // Chronological, all-day first within a day (the hub sorts too; don't depend on it).
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  return sorted.map((it) => ({
    ...it,
    key: `${it.id}@${it.start}`,
    dateKey: it.start.slice(0, 10),
    timeLabel: it.all_day ? "All day" : timeLabel(it.start),
    endLabel: it.end && !it.all_day ? timeLabel(it.end) : "",
    whoLabel: whoLabel(it.for_person, people),
    remindLabel: remindLabel(it.remind_min, it.kind),
  }));
}

/** 42 Monday-first cells for the month, with per-day counts. */
export function buildCells(year: number, month: number, items: AgendaItemView[], selectedKey: string, today: Date): DayCell[] {
  const { from } = gridRange(year, month);
  const start = parseKey(from);
  const todayKey = dateKey(today);
  const byDay = new Map<string, AgendaItemView[]>();
  for (const it of items) {
    const list = byDay.get(it.dateKey) ?? [];
    list.push(it);
    byDay.set(it.dateKey, list);
  }
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dateKey(d);
    const list = byDay.get(key) ?? [];
    cells.push({
      key,
      day: d.getDate(),
      inMonth: d.getMonth() === month,
      today: key === todayKey,
      selected: key === selectedKey,
      count: list.length,
      events: list.filter((x) => x.kind === "event").length,
      reminders: list.filter((x) => x.kind === "reminder").length,
    });
  }
  return cells;
}

export function itemsOn(items: AgendaItemView[], key: string): AgendaItemView[] {
  return items.filter((it) => it.dateKey === key);
}

/** The next `days` days from today (exclusive of the selected day when it's today), grouped. */
export function upcomingGroups(items: AgendaItemView[], today: Date, days = 7, skipKey = ""): UpcomingGroup[] {
  const todayKey = dateKey(today);
  const end = new Date(today);
  end.setDate(end.getDate() + days);
  const endKey = dateKey(end);
  const groups = new Map<string, AgendaItemView[]>();
  for (const it of items) {
    if (it.dateKey < todayKey || it.dateKey > endKey || it.dateKey === skipKey) continue;
    if (it.dateKey === todayKey && it.past) continue;
    const list = groups.get(it.dateKey) ?? [];
    list.push(it);
    groups.set(it.dateKey, list);
  }
  return Array.from(groups.keys()).sort().map((key) => ({ key, label: dayLabel(key, today), items: groups.get(key)! }));
}

// ── form ⇄ body ───────────────────────────────────────────────────────────────────────────────

export function emptyForm(kind: AgendaKind, dateKeyStr: string, people: Person[], zones: string[], today: Date): AgendaForm {
  // Default time: the next full hour (or 9:00 for a day other than today).
  const isToday = dateKeyStr === dateKey(today);
  const hour = isToday ? Math.min(23, today.getHours() + 1) : 9;
  return {
    id: null,
    kind,
    title: "",
    date: dateKeyStr,
    time: `${pad(hour)}:00`,
    endTime: "",
    allDay: false,
    repeat: "none",
    weeklyDays: [parseKey(dateKeyStr).getDay()],
    remind: "15",
    forPerson: "",
    zone: "",
    notes: "",
    people,
    zoneOptions: zoneChoices("", zones),
    saving: false,
    error: "",
  };
}

export function formFromItem(it: AgendaItem, people: Person[], zones: string[]): AgendaForm {
  const [date, time = ""] = it.start.split("T");
  let repeat = "none";
  let weeklyDays: number[] = [parseKey(date).getDay()];
  if (it.recurrence) {
    const [freq, rest] = it.recurrence.split(":");
    repeat = freq;
    if (freq === "weekly" && rest) weeklyDays = rest.split(",").map(Number);
  }
  const person = it.for_person ? people.find((p) => p.id === it.for_person || p.name.toLowerCase() === it.for_person!.toLowerCase()) : undefined;
  return {
    id: it.id,
    kind: it.kind,
    title: it.title,
    date,
    time: it.all_day ? "09:00" : time.slice(0, 5),
    endTime: it.end && !it.all_day ? it.end.split("T")[1].slice(0, 5) : "",
    allDay: it.all_day,
    repeat,
    weeklyDays,
    remind: it.kind === "event" ? (it.remind_min == null ? "none" : String(it.remind_min)) : "none",
    forPerson: person ? person.id : it.for_person ?? "",
    zone: it.zone ?? "",
    notes: it.notes ?? "",
    people,
    zoneOptions: zoneChoices(it.zone ?? "", zones),
    saving: false,
    error: "",
  };
}

/** <select> options with the current value FIRST (bindrjs can't drive :selected — UI-LIBRARY §14). */
export function zoneChoices(current: string, zones: string[]): Array<{ value: string; label: string }> {
  const all = [{ value: "", label: "Wherever they are" }, ...zones.map((z) => ({ value: z, label: z }))];
  const i = all.findIndex((o) => o.value === current);
  if (i > 0) all.unshift(...all.splice(i, 1));
  return all;
}

/** The ONE sentence stopping a save, or "" when the form is complete. Reads every field it may need
 *  before branching (DESIGN.md §7 — bindrjs records dependencies per evaluation). */
export function formHint(f: AgendaForm): string {
  const title = f.title.trim();
  const { date, time, endTime, allDay, kind, repeat, weeklyDays } = f;
  if (!title) return kind === "reminder" ? "Say what the house should remind you of." : "Give the event a title.";
  if (!date) return "Pick a date.";
  if (!allDay && !time) return "Pick a time.";
  if (kind === "event" && !allDay && endTime && endTime <= time) return "The end has to come after the start.";
  if (repeat === "weekly" && !weeklyDays.length) return "Pick at least one weekday.";
  return "";
}

export function formToBody(f: AgendaForm): Record<string, any> {
  const title = f.title.trim();
  const allDay = f.kind === "event" && f.allDay;
  const recurrence =
    f.repeat === "none" ? null : f.repeat === "weekly" ? `weekly:${[...f.weeklyDays].sort().join(",")}` : f.repeat;
  return {
    kind: f.kind,
    title,
    message: title,
    start: allDay ? f.date : `${f.date}T${f.time}`,
    end: f.kind === "event" && !allDay && f.endTime ? `${f.date}T${f.endTime}` : null,
    all_day: allDay,
    recurrence,
    remind_min: f.kind === "event" ? (f.remind === "none" ? null : Number(f.remind)) : 0,
    for_person: f.forPerson || null,
    zone: f.zone || null,
    notes: f.notes.trim() || null,
  };
}
