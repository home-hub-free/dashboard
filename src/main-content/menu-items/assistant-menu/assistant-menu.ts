import { Bind } from "bindrjs";
import { requestCalendarData, requestWeatherData, updateHouseData } from "../../../utils/server-handler";
import template from './assistant-menu.html?raw';

export const AssistantService = {
  readCalendar,
  readForecast,
  updateHouseData: updateHouseData,
};

function readCalendar() {
  requestCalendarData();
}

function readForecast() {
  requestWeatherData();
}

class VAssistantContentClass {
  bind!: any;

  constructor() {}

  initView() {
    const { bind } = new Bind({
      id: 'assistant',
      template,
      bind: {
        test: 'test',
      }
    });
    this.bind = bind;
  }
}

export const VAssistantContent = new VAssistantContentClass();
