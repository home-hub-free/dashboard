import { VoiceState } from "./voice-ask.service";

export type AssistantMenuState = {
  customSpeech: string
  readCalendar: () => void
  readForecast: () => void
  updateHouseData: (property: string, value: any) => Promise<any>
  assistantSay: (text: string) => void

  // Voice-request (push-to-talk) state, driven by VoiceAskService.
  voiceState: VoiceState
  voiceTranscript: string
  voiceReply: string
  voiceAction: string
  voiceStart: () => void
  voiceStop: () => void
}