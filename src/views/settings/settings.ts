import { Component } from "../../core/component";
import template from "./settings.html?raw";
import { SettingsState } from "./settings.model";
import { HouseholdService, HouseholdServiceClass } from "../assistant/household.service";
import { currentUser } from "../../utils/auth";
import type { Person } from "../../utils/server-handler";

/**
 * Settings — household + account administration, relocated out of the Assistant
 * tab. Reuses HouseholdService verbatim (it just drives whatever bind it's
 * attached to), so the only new code is the mount + the bind's initial props.
 */
class SettingsContentClass extends Component<SettingsState> {
  householdService: HouseholdServiceClass;

  constructor(householdService: HouseholdServiceClass) {
    super();
    this.householdService = householdService;
  }

  mount() {
    this.createBind({
      id: "settings",
      template,
      bind: {
        signedInName: currentUser()?.displayName || "",
        meId: "",
        households: [],
        householdsLoading: true,
        householdError: "",
        newUsername: "",
        newDisplayName: "",
        newPassword: "",
        newTone: "",
        addHousehold: () => this.householdService.add(),
        saveTone: (id: string, tone: string) => this.householdService.saveTone(id, tone),
        removeHousehold: (id: string) => this.householdService.remove(id),
        signOut: () => this.householdService.signOut(),

        pwCurrent: "",
        pwNew: "",
        pwError: "",
        changeOwnPassword: () => this.householdService.changeOwnPassword(),

        voiceIdEnabled: false,
        voiceSamples: -1, // still checking — resolved by refreshVoiceSamples

        enrollActive: false,
        enrollPhase: "ready",
        enrollStep: 0,
        enrollTotal: 0,
        enrollAsk: "",
        enrollReply: "",
        enrollHint: "",
        enrollMsg: "",
        startVoiceEnroll: () => this.householdService.startVoiceEnroll(),
        recordVoiceLine: () => this.householdService.recordVoiceLine(),
        cancelVoiceEnroll: () => this.householdService.cancelVoiceEnroll(),
        forgetVoice: () => this.householdService.forgetVoice(),

        faceIdEnabled: false,
        faceSamples: -1, // still checking — resolved by refreshFaceSamples

        faceActive: false,
        facePhase: "preview",
        faceStep: 0,
        faceTotal: 0,
        facePose: "",
        facePoseHint: "",
        faceHint: "",
        faceReady: false,
        faceCount: 0,
        faceAuto: false,
        faceMsg: "",
        startFaceEnroll: () => this.householdService.startFaceEnroll(),
        captureFacePose: () => this.householdService.captureFacePose(),
        cancelFaceEnroll: () => this.householdService.cancelFaceEnroll(),
        forgetFace: () => this.householdService.forgetFace(),

        calendarEnabled: false,
        calendarChecking: true,
        calendarAuth: "",
        calendarSaEmail: "",
        calendarFamilyId: "",
        calDiscovered: [],
        calAddId: "",
        calendarHouseLinked: false,
        calendarMineLinked: false,
        calendarBusy: false,
        calendarMsg: "",
        connectHouseCalendar: () => this.householdService.connectHouseCalendar(),
        connectMyCalendar: () => this.householdService.connectMyCalendar(),
        disconnectHouseCalendar: () => this.householdService.disconnectHouseCalendar(),
        disconnectMyCalendar: () => this.householdService.disconnectMyCalendar(),
        setFamilyCal: (id: string) => this.householdService.setFamilyCal(id),
        toggleMine: (id: string) => this.householdService.toggleMine(id),
        addCalendarById: () => this.householdService.addCalendarById(),
        recheckCalendars: () => this.householdService.recheckCalendars(),
        removeCalendar: (id: string) => this.householdService.removeCalendar(id),

        peopleEnabled: false,
        people: [],
        namedGuests: [],
        peopleMsg: "",
        forgetPerson: (id: string) => this.householdService.forgetPerson(id),

        // Recognized-face audit + thresholds (service-driven).
        clustersOpenFor: "",
        clustersBusy: false,
        memberClusters: [],
        toggleClusters: (userId: string) => this.householdService.toggleClusters(userId),
        detachClusterAction: (guestId: string) => this.householdService.detachClusterAction(guestId),
        // Photo archive ("re-do the soup") — delete polluted photos, rebuild the profile.
        photosOpenFor: "",
        photosBusy: false,
        memberCaptures: [],
        capturesTotal: 0,
        rebuildArmed: false,
        rebuildBusy: false,
        togglePhotos: (userId: string) => this.householdService.togglePhotos(userId),
        deleteCaptureAction: (id: number) => this.householdService.deleteCaptureAction(id),
        rebuildProfile: (userId: string) => this.householdService.rebuildProfile(userId),
        openCaptureFace: (cap) => this.householdService.openCaptureFace(cap),

        thresholds: [],
        saveThreshold: (key: string, value: string) => this.householdService.saveThreshold(key, value),
        resetThreshold: (key: string) => this.householdService.resetThreshold(key),
        openClusterFace: (cluster) => this.householdService.openClusterFace(cluster),

        // Face review — the "Is this you?" card stack (service-driven).
        reviewCards: [],
        reviewOthers: 0,
        reviewHealed: 0,
        reviewOpen: false,
        reviewIndex: 0,
        reviewTotal: 0,
        reviewHasCard: false,
        reviewThumbUrl: "",
        reviewLabel: "",
        reviewSightings: 0,
        reviewScore: 0,
        reviewHasFaceBox: false,
        reviewNoFace: false,
        reviewTier: "",
        reviewSuggestKind: "",
        reviewSuggestName: "",
        reviewSuggestIsMe: false,
        reviewBusy: false,
        reviewMsg: "",
        openReview: () => this.householdService.openReview(),
        closeReview: () => this.householdService.closeReview(),
        reviewMe: () => this.householdService.reviewMe(),
        reviewYes: () => this.householdService.reviewYes(),
        reviewNo: () => this.householdService.reviewNo(),
        reviewSkip: () => this.householdService.reviewSkip(),
        reviewDiscard: () => this.householdService.reviewDiscard(),
        reviewAssign: (id: string) => this.householdService.reviewAssign(id),
        reviewNameGuest: (name: string) => this.householdService.reviewNameGuest(name),

        // Face lightbox — pure view state (no service). Tapping a gallery face opens
        // its captured crop full-size; primitives only, reassigned so the :if region
        // re-renders. The backdrop / close button call closeFace; stopZoom keeps a
        // click on the image itself from bubbling up to the backdrop and closing it.
        zoomOpen: false,
        zoomUrl: "",
        zoomLabel: "",
        zoomSub: "",
        zoomFaceBox: null,
        zoomIndex: 0,
        zoomCount: 1,
        zoomHasPrev: false,
        zoomHasNext: false,
        zoomGuestId: "",
        zoomCaptureId: 0,
        zoomPrev: () => this.householdService.zoomPrev(),
        zoomNext: () => this.householdService.zoomNext(),
        zoomDetach: () => this.householdService.zoomDetach(),
        zoomDeleteCapture: () => this.householdService.zoomDeleteCapture(),
        openFace: (person: Person) => {
          if (!person?.thumbUrl) return; // nothing captured yet → no-op
          this.householdService.closeZoom(); // drop any prior collection listeners
          this.bind.zoomUrl = person.thumbUrl;
          this.bind.zoomLabel = person.name || person.label;
          this.bind.zoomSub =
            person.class === "guest"
              ? `Guest · seen ${person.sightings ?? 0}×`
              : "Household member";
          this.bind.zoomFaceBox = null; // roster faces carry no per-face box → no ring
          this.bind.zoomCount = 1; // single image → no nav arrows
          this.bind.zoomHasPrev = false;
          this.bind.zoomHasNext = false;
          this.bind.zoomGuestId = ""; // roster face → no detach CTA
          this.bind.zoomOpen = true;
          document.body.classList.add("face-viewer-open"); // hide nav under the viewer
        },
        closeFace: () => this.householdService.closeZoom(),
        stopZoom: (event: Event) => event.stopPropagation(),
      },
    });

    this.householdService.attach(this.bind);
  }
}

export const SettingsContent = new SettingsContentClass(HouseholdService);
