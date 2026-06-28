import type { SessionUser } from "../assistant/household.service";
import type { Person } from "../../utils/server-handler";

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

  // Face ID (face enrollment) for the signed-in member — mirrors Voice ID, but the
  // sample is a webcam snapshot sent to the vision-service (CAMERA_VISION_PLAN §6).
  faceIdEnabled: boolean
  faceSamples: number
  faceEnrollState: "idle" | "capturing" | "saving"
  faceEnrollMsg: string
  enrollFace: () => void
  forgetFace: () => void

  // People the cameras have seen — every person gets a default label + a captured
  // face; the admin puts names to faces here (CAMERA_VISION_PLAN §6). Visible only
  // when the vision-service is up (same gate as Face ID).
  peopleEnabled: boolean
  people: Person[]
  peopleMsg: string
  namePerson: (id: string, name: string) => void
  promotePerson: (id: string, userId: string) => void
}
