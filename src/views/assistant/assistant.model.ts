export type AssistantMenuState = {
  customSpeech: string
  readCalendar: () => void
  readForecast: () => void
  updateHouseData: (property: string, value: any) => Promise<any>
  assistantSay: (text: string) => void
}