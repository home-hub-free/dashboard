import { Effect } from "../automations.model"

export type AutomationsListTabState = {
  effects: Effect[],
  groups: EffectsGroup[],
  newAutomation: (event: MouseEvent) => void,
  newMultiArmAutomation: (event: MouseEvent) => void,
}

export type EffectsGroup = {
  effects: Effect[],
  name: string;
}
