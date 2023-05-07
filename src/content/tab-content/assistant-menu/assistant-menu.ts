import { requestCalendarData, requestWeatherData, updateHouseData, updateInsideSensorTemperature } from "../../../utils/server-handler";

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
