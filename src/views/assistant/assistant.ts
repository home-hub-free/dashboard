import { Component } from "../../core/component";
import { requestCalendarData, requestWeatherData, updateHouseData } from "../../utils/server-handler";
import template from './assistant.html?raw';
import { AssistantMenuState } from "./assistant.model";
import { AssistantMenuService, AssistantMenuServiceClass } from "./assistant.service";

class VAssistantContentClass extends Component<AssistantMenuState> {
  assistantMenuService: AssistantMenuServiceClass;

  constructor(assistantMenuService: AssistantMenuServiceClass) {
    super();
    this.assistantMenuService = assistantMenuService;
  }

  mount() {
    this.createBind({
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
  }
}

export const VAssistantContent = new VAssistantContentClass(AssistantMenuService);
