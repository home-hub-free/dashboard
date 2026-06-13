import { AutoEffect } from "../automations.model"

export type AutomationsListTabState = {
  effects: AutoEffect[],
  groups: EffectsGroup[],
  newAutomation: (event: MouseEvent) => void,
}

export type EffectsGroup = {
  effects: AutoEffect[],
  name: string;
}