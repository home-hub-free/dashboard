import type { SessionUser } from "../assistant/household.service";

/**
 * Settings owns everything account/household — relocated out of the Assistant
 * tab (which is for *talking to* the house, not administering it). The shape is
 * exactly what HouseholdService.attach() drives, so the service is unchanged.
 */
export type SettingsState = {
  // Signed-in member + roster, driven by HouseholdService.
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
  voiceIdEnabled: boolean
  voiceSamples: number
  enrollState: "idle" | "recording" | "saving"
  enrollMsg: string
  enrollVoice: () => void
  forgetVoice: () => void
}
