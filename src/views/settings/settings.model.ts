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

  // Voice ID (voiceprint enrollment) for the signed-in member. Enrollment is a guided
  // mini-conversation: the user reads a request to Aura, a live waveform shows the mic
  // is hearing them, the sample is enrolled, and Aura answers back in her real voice.
  voiceIdEnabled: boolean
  voiceSamples: number
  enrollActive: boolean // a guided session is open (gates the waveform/conversation card)
  enrollPhase: "ready" | "recording" | "saving" | "aura" | "done"
  enrollStep: number // 1-based index of the current line
  enrollTotal: number // number of lines in the script
  enrollAsk: string // the sentence to say to Aura right now
  enrollReply: string // Aura's spoken reply to the last line (shown after recording)
  enrollHint: string // live coaching ("Te escucho…", "Habla un poco más fuerte")
  enrollMsg: string // status / errors
  startVoiceEnroll: () => void
  recordVoiceLine: () => void
  cancelVoiceEnroll: () => void
  forgetVoice: () => void

  // Face ID (face enrollment) for the signed-in member — mirrors Voice ID, but guided
  // by a live camera preview: the user sees themselves in an oval guide, gets pose
  // directions, and each pose is captured as one sample to the vision-service
  // (CAMERA_VISION_PLAN §6). Auto-captures when a face is detected; manual otherwise.
  faceIdEnabled: boolean
  faceSamples: number
  faceActive: boolean // a guided session is open (gates the live preview)
  facePhase: "preview" | "counting" | "saving" | "done"
  faceStep: number // 1-based index of the current pose
  faceTotal: number // number of poses
  facePose: string // the current pose instruction ("Mira al frente")
  facePoseHint: string // the pose's helper line
  faceHint: string // live coaching (brightness / face-in-frame)
  faceReady: boolean // face detected + framed → the guide ring goes green
  faceCount: number // countdown before capture (3,2,1; 0 = none)
  faceAuto: boolean // browser can detect faces → hands-free auto-capture
  faceMsg: string // status / errors
  startFaceEnroll: () => void
  captureFacePose: () => void
  cancelFaceEnroll: () => void
  forgetFace: () => void

  // Google Calendar linking (CALENDAR_PLAN §2/§6). Only shown once calendar-service runs a REAL
  // backend. Two auth modes: "service_account" (members share a calendar with the SA email, then
  // link it by id) and "oauth" (per-account consent). The null simulation backend has nothing to
  // connect.
  calendarEnabled: boolean
  calendarAuth: "" | "oauth" | "service_account"
  calendarSaEmail: string // the service-account address members share their calendars with (SA mode)
  calendarFamilyId: string // the configured family calendar id (SA mode)
  calendarMyCalId: string // input: the signed-in member's calendar id to link (SA mode)
  calendarFamilyMsg: string // result of the family "Test access" check (SA mode)
  calendarHouseLinked: boolean // OAuth mode: the shared family/house account is linked
  calendarMineLinked: boolean // the signed-in member's personal calendar is linked
  calendarBusy: boolean // a link/consent action is in flight
  calendarMsg: string // status / errors
  connectHouseCalendar: () => void // OAuth mode
  connectMyCalendar: () => void // OAuth mode
  disconnectHouseCalendar: () => void
  disconnectMyCalendar: () => void
  linkMyCalendar: () => void // SA mode
  testFamilyCalendar: () => void // SA mode

  // People the cameras have seen — every person gets a default label + a captured
  // face; the admin puts names to faces here (CAMERA_VISION_PLAN §6). Visible only
  // when the vision-service is up (same gate as Face ID).
  peopleEnabled: boolean
  people: Person[]
  peopleMsg: string
  namePerson: (id: string, name: string) => void
  promotePerson: (id: string, userId: string) => void

  // Face lightbox — tapping a gallery photo opens the captured crop full-size so the
  // admin can tell which face a row is about even when the crop holds more than one
  // person. Primitive fields (never a possibly-null object) keep the gated branch
  // safe to evaluate; `openFace` reassigns them so the lightbox region re-renders.
  zoomOpen: boolean
  zoomUrl: string
  zoomLabel: string
  zoomSub: string
  openFace: (person: Person) => void
  closeFace: () => void
  stopZoom: (event: Event) => void
}
