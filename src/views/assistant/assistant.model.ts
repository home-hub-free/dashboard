import { VoiceState } from "./voice-ask.service";
import type { SessionUser } from "./household.service";

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

  // Household roster, driven by HouseholdService. The agent reads each member's
  // prefs (tone) and is told who is asking via askAgent → data.user.
  signedInName: string
  meId: string
  households: SessionUser[]
  householdError: string
  newUsername: string
  newDisplayName: string
  newPassword: string
  newTone: string
  addHousehold: () => void
  saveTone: (id: string, tone: string) => void
  removeHousehold: (id: string) => void
  signOut: () => void

  // Self-service password change (signed-in member).
  pwCurrent: string
  pwNew: string
  pwError: string
  changeOwnPassword: () => void

  // Voice ID (voiceprint enrollment) for the signed-in member.
  voiceSamples: number
  enrollState: "idle" | "recording" | "saving"
  enrollMsg: string
  enrollVoice: () => void
  forgetVoice: () => void
}