export type AssistantMenuState = {
  readCalendar: () => void,
  readForecast: () => void,
  updateHouseData: (property: string, value: any) => Promise<any>,
}