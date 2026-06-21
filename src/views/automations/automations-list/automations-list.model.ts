import { NormalizedEffect } from "../automations.model"

export type AutomationsListTabState = {
  effects: NormalizedEffect[],
  groups: EffectsGroup[],
  newAutomation: (event: MouseEvent) => void,
}

export type EffectsGroup = {
  effects: NormalizedEffect[],
  name: string;
}