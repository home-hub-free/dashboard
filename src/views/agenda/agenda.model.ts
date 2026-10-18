/**
 * Agenda view types (LOCAL_AGENDA). The hub's `timers` table is the household's one calendar:
 * events + reminders (one-shot or recurring), announced by the hub through the satellites.
 * The dashboard reads dated OCCURRENCES (`GET /agenda?from&to`) and writes entries
 * (`POST/PATCH/DELETE /agenda`). Shapes mirror server/src/timers/agenda.ts.
 */
export type AgendaKind = "event" | "reminder";

/** One dated occurrence as the hub serves it (a recurring entry repeats its `id`). */
export interface AgendaItem {
  id: string;
  kind: AgendaKind;
  title: string;
  /** Local-naive "YYYY-MM-DDTHH:MM", or "YYYY-MM-DD" for an all-day event. */
  start: string;
  end?: string;
  all_day: boolean;
  calendar: string;
  for_person: string | null;
  zone: string | null;
  recurrence: string | null;
  recurrence_label: string;
  remind_min: number | null;
  message: string | null;
  notes: string | null;
  status: "pending" | "fired" | "cancelled" | "running" | "stopped";
  day: string;
  past: boolean;
}

/** An occurrence decorated for the day list / upcoming list. */
export interface AgendaItemView extends AgendaItem {
  /** Stable per-occurrence key (id + start). */
  key: string;
  dateKey: string;
  timeLabel: string;
  endLabel: string;
  whoLabel: string;
  remindLabel: string;
}

export interface DayCell {
  key: string;
  day: number;
  inMonth: boolean;
  today: boolean;
  selected: boolean;
  count: number;
  events: number;
  reminders: number;
}

export interface UpcomingGroup {
  key: string;
  label: string;
  items: AgendaItemView[];
}

export interface Person {
  id: string;
  name: string;
}

export interface AgendaState {
  monthLabel: string;
  dows: string[];
  cells: DayCell[];
  selectedKey: string;
  selectedLabel: string;
  selectedItems: AgendaItemView[];
  upcoming: UpcomingGroup[];
  loaded: boolean;
  error: string;
  pendingDeleteId: string | null;
  prevMonth: () => void;
  nextMonth: () => void;
  goToday: () => void;
  selectDay: (key: string) => void;
  newItem: (event: MouseEvent, kind: AgendaKind) => void;
  editItem: (event: MouseEvent, id: string, start: string) => void;
  requestDelete: (id: string) => void;
  cancelDelete: () => void;
  confirmDelete: (id: string) => void;
}

/** The create/edit overlay's working copy. Strings throughout — they bind to native inputs. */
export interface AgendaForm {
  id: string | null;
  kind: AgendaKind;
  title: string;
  date: string;
  time: string;
  endTime: string;
  allDay: boolean;
  /** "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly" */
  repeat: string;
  weeklyDays: number[];
  /** "none" | "0" | "15" | "30" | "60" | "1440" (events only). */
  remind: string;
  /** "" = everyone (house-wide), else a household user id. */
  forPerson: string;
  zone: string;
  notes: string;
  people: Person[];
  zoneOptions: Array<{ value: string; label: string }>;
  saving: boolean;
  error: string;
}
