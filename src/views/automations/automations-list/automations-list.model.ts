import { Effect } from "../automations.model"

export type AutomationsListTabState = {
  effects: Effect[],
  groups: EffectsGroup[],
  /** Row id armed for delete-confirm (null = none). */
  pendingDeleteId: number | null,
  newAutomation: (event: MouseEvent) => void,
  newMultiArmAutomation: (event: MouseEvent) => void,
  toggleEffect: (effect: Effect) => void,
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
