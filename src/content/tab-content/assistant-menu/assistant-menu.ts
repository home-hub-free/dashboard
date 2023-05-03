import { requestCalendarData, requestWeatherData, updateInsideSensorTemperature } from "../../../utils/server-handler";

export const AssistantService = {
  readCalendar,
  readForecast,
  setInsideSensorTemperature,
};

function readCalendar() {
  requestCalendarData();
}

function readForecast() {
  requestWeatherData();
}

function setInsideSensorTemperature(sensorId: string) {
  updateInsideSensorTemperature(sensorId);
}