import { AutoEffect } from "../../automations-menu.model"

export type AutomationsListTabState = {
  effects: AutoEffect[],
  newAutomation: (event: MouseEvent) => void,
}