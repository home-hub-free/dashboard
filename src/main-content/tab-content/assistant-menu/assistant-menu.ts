import { requestCalendarData, requestWeatherData, updateHouseData } from "../../../utils/server-handler";

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
