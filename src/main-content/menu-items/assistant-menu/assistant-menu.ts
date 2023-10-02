import { Bind } from "bindrjs";
import { requestCalendarData, requestWeatherData, updateHouseData } from "../../../utils/server-handler";
import template from './assistant-menu.html?raw';
import { AssistantMenuState } from "./assistant-menu.model";

class VAssistantContentClass {
  bind!: any;

  constructor() {}

  initView() {
    const { bind } = new Bind<AssistantMenuState>({
      id: 'assistant',
      template,
      bind: {
        readCalendar: requestCalendarData,
        readForecast: requestWeatherData,
        updateHouseData: updateHouseData,
      }
    });
    this.bind = bind;
  }
}

export const VAssistantContent = new VAssistantContentClass();
