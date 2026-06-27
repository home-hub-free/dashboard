import { VoiceState } from "./voice-ask.service";

/**
 * The Assistant tab is now just that — talking to the house. Account/household
 * administration moved to the Settings view (see settings.model.ts).
 */
export type AssistantMenuState = {
  // "Make an announcement" — speak arbitrary text through the house (emma-say).
  announceText: string
  assistantSay: (text: string) => void

  // Voice-request (push-to-talk) state, driven by VoiceAskService.
  voiceState: VoiceState
  voiceTranscript: string
  voiceReply: string
  voiceAction: string
  voiceStart: () => void
  voiceStop: () => void
}
