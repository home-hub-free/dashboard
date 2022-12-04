import { requestCalendarData, requestWeatherData } from "../../../utils/server-handler";

export const AssistantService = {
  readCalendar,
  readForecast
};

function readCalendar() {
  requestCalendarData().then(log => {
    console.log(log);
  });
}

function readForecast() {
  requestWeatherData().then((log) => {
    console.log(log);
  })
}