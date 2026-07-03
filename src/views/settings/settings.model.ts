import type { SessionUser } from "../assistant/household.service";
import type { Person, ReviewCard } from "../../utils/server-handler";

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
  calendarFamilyId: string // the currently-designated family calendar id (SA mode)
  // Calendars added to the SA. `reachable` false = added but not shared with the SA yet (pending —
  // share it in Google, then Recheck). `mine` = assigned to the signed-in member; `writable` false =
  // shared read-only (read but never written).
  calDiscovered: { id: string; summary: string; writable: boolean; reachable: boolean; mine: boolean }[]
  calAddId: string // input: a calendar address to register (add first, share in Google, then recheck)
  calendarHouseLinked: boolean // OAuth mode: the shared family/house account is linked
  calendarMineLinked: boolean // the signed-in member has at least one calendar linked
  calendarBusy: boolean // a link/consent/assignment action is in flight
  calendarMsg: string // status / errors
  connectHouseCalendar: () => void // OAuth mode
  connectMyCalendar: () => void // OAuth mode
  disconnectHouseCalendar: () => void
  disconnectMyCalendar: () => void
  setFamilyCal: (id: string) => void // SA mode: designate the family calendar
  toggleMine: (id: string) => void // SA mode: add/remove a calendar from my set
  addCalendarById: () => void // SA mode: register a calendar by its address (add first)
  recheckCalendars: () => void // SA mode: re-probe pending calendars after sharing them
  removeCalendar: (id: string) => void // SA mode: forget a calendar

  // People the cameras have seen — every person gets a default label + a captured
  // face (CAMERA_VISION_PLAN §6). Labeling/linking lives in the REVIEW flow now;
  // this list just shows the roster, with a forget affordance as the
  // mistake-eraser (deleted guests re-enter review on their next sighting).
  // Visible only when the vision-service is up (same gate as Face ID).
  peopleEnabled: boolean
  people: Person[]
  namedGuests: Person[] // labeled guests — review targets ("It's Abuela")
  peopleMsg: string
  forgetPerson: (id: string) => void

  // Face review — the "Is this you?" card stack over the confidence-tiered queue
  // (vision /people/review). The definitely-them tier auto-merges server-side and
  // never reaches here; `suggest` cards are addressed to ONE member (shown only on
  // that member's login), `unknown` cards go to everyone. The current card is
  // flattened into primitives so the gated overlay is always safe to evaluate
  // (same posture as the lightbox below).
  reviewCards: ReviewCard[] // the WHOLE queue, self-identification cards first —
  // any member answers everything (guests never log in; persisting them is our job)
  reviewOthers: number // cards that look like other members (queued last, answerable)
  reviewHealed: number // clusters auto-merged server-side on the last refresh
  reviewOpen: boolean
  reviewIndex: number // 1-based position within this run
  reviewTotal: number
  reviewHasCard: boolean // false once the run is exhausted → "all caught up"
  reviewThumbUrl: string
  reviewLabel: string
  reviewSightings: number
  reviewScore: number // suggest tier: similarity as 0–100 (0 = hidden)
  reviewHasFaceBox: boolean // the face's position in the photo is known → ring + caption
  reviewNoFace: boolean // detector found NO face in this capture → honest hint, skip/discard
  reviewTier: "" | "suggest" | "unknown"
  reviewSuggestKind: "" | "member" | "guest" // what the suggested identity is
  reviewSuggestName: string // the suggested identity's name ("Is this Ana/Abuela?")
  reviewSuggestIsMe: boolean // suggestion is the signed-in member → "Is this you?"
  reviewBusy: boolean
  reviewMsg: string
  openReview: () => void
  closeReview: () => void
  reviewMe: () => void // "It's me" → merge the cluster into my face profile
  reviewYes: () => void // confirm the suggestion (member = me; guest = merge into them)
  reviewNo: () => void // "Not them" → never suggest this identity for the cluster again
  reviewSkip: () => void // defer, client-side only
  reviewDiscard: () => void // stranger / not-a-face crop → delete the cluster
  reviewAssign: (id: string) => void // "It's <member|named guest>" → promote / merge
  reviewNameGuest: (name: string) => void // label a NEW guest; they persist across visits

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
