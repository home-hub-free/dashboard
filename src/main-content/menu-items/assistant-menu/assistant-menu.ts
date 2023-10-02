import { Bind } from "bindrjs";
import { requestCalendarData, requestWeatherData, updateHouseData } from "../../../utils/server-handler";
import template from './assistant-menu.html?raw';
import { AssistantMenuState } from "./assistant-menu.model";
import { AssistantMenuService, AssistantMenuServiceClass } from "./assistant-menu.service";

class VAssistantContentClass {
  bind!: AssistantMenuState;
  assistantMenuService: AssistantMenuServiceClass;

  constructor(assistantMenuService: AssistantMenuServiceClass) {
    this.assistantMenuService = assistantMenuService;
  }

  initView() {
    const { bind } = new Bind<AssistantMenuState>({
      id: 'assistant',
      template,
      bind: {
        customSpeech: 'Custom VAssistant Speech',
        readCalendar: requestCalendarData,
        readForecast: requestWeatherData,
        updateHouseData: updateHouseData,
        assistantSay: this.assistantMenuService.assistantSay.bind(this.assistantMenuService)
      }
    });
    this.bind = bind;
  }
}

export const VAssistantContent = new VAssistantContentClass(AssistantMenuService);
