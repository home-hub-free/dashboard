import { VoiceState } from "./voice-ask.service";

/**
 * The Assistant tab is just that — talking to the house, by voice or by text.
 * Account/household administration moved to the Settings view (settings.model.ts).
 */
export type AssistantMenuState = {
  // "Type a request" — send typed text to the agent as the signed-in member
  // (same path as voice, for when the user can't speak). Handled by VoiceAskService.
  promptText: string
  promptSend: () => void
  promptKey: (event: KeyboardEvent) => void

  // Voice-request (push-to-talk) state, driven by VoiceAskService.
  voiceState: VoiceState
  voiceTranscript: string
  voiceReply: string
  voiceAction: string
  voiceStart: () => void
  voiceStop: () => void
}
