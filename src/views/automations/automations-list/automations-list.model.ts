import { Effect } from "../automations.model"

export type AutomationsListTabState = {
  groups: EffectsGroup[],
  /** Rules in total (gates the search box — shown once the list is long). */
  total: number,
  onFilter: (event: Event) => void,
  /** Row id armed for delete-confirm (null = none). */
  pendingDeleteId: number | null,
  toggleEffect: (effect: Effect) => void,
  /** Open the focused edit overlay for a simple single-arm rule. (event first — bindrjs loop-var quirk.) */
  editEffect: (event: MouseEvent, effect: Effect) => void,
  requestDelete: (effect: Effect) => void,
  cancelDelete: () => void,
  confirmDelete: (effect: Effect) => void,
}

export type EffectsGroup = {
  effects: Effect[],
  name: string;
  /** iconoir class for the target device — mirrors the home tile icons. */
  icon: string;
}
