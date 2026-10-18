import { Component } from "../../core/component";
import template from "./settings.html?raw";
import { SettingsState } from "./settings.model";
import { HouseholdService, HouseholdServiceClass } from "../assistant/household.service";
import { GuestsService } from "./guests.service";
import type { Treatment } from "../../utils/guests";
import { currentUser } from "../../utils/auth";
import type { Person } from "../../utils/server-handler";
import { store } from "../../store/store";
import { addZone, removeZone } from "../../utils/zones.service";
import { setZones } from "../../utils/server-handler";
import { showToaster } from "../../components/popup-message/popup-message";
import type { RoomRow } from "./settings.model";

/** Build the Rooms card rows from the registry + what's assigned to each zone.
 * Registry order is the Home board's room order, so the arrows here reorder Home. */
function buildRooms(): RoomRow[] {
  const zones: string[] = store.get("zones") || [];
  const devices = store.get("devices") || [];
  const sensors = store.get("sensors") || [];
  return zones.map((name, i) => {
    const d = devices.filter((x: any) => (x.zone || "").trim() === name).length;
    const s = sensors.filter((x: any) => (x.zone || "").trim() === name).length;
    const parts: string[] = [];
    if (d) parts.push(`${d} device${d === 1 ? "" : "s"}`);
    if (s) parts.push(`${s} sensor${s === 1 ? "" : "s"}`);
    return { name, summary: parts.join(" · ") || "empty", first: i === 0, last: i === zones.length - 1 };
  });
}

/**
 * Settings — household + account administration, relocated out of the Assistant
 * tab. Reuses HouseholdService verbatim (it just drives whatever bind it's
 * attached to), so the only new code is the mount + the bind's initial props.
 */
class SettingsContentClass extends Component<SettingsState> {
  householdService: HouseholdServiceClass;
  private unsubscribeRooms: (() => void)[] = [];

  constructor(householdService: HouseholdServiceClass) {
    super();
    this.householdService = householdService;
  }

  mount() {
    this.createBind({
      id: "settings",
      template,
      bind: {
        rooms: buildRooms(),
        newRoomName: "",
        addRoom: () => this.addRoom(),
        removeRoom: (name: string) => this.removeRoom(name),
        moveRoom: (name: string, dir: number) => this.moveRoom(name, dir),

        signedInName: currentUser()?.displayName || "",
        meId: "",
        households: [],
        householdsLoading: true,
        householdError: "",
        newUsername: "",
        newDisplayName: "",
        newPassword: "",
        addHousehold: () => this.householdService.add(),
        removeHousehold: (id: string) => this.householdService.remove(id),
        signOut: () => this.householdService.signOut(),

        guests: [],
        guestsLoading: true,
        guestsError: "",
        guestNewName: "",
        guestNewMember: "", // "" = the first member in the select (the browser's default)
        guestNewRelation: "",
        guestNewTreatment: "" as Treatment,
        guestEditId: "",
        guestRelMember: "",
        guestRelOptions: [],
        guestRelText: "",
        addGuest: () => GuestsService.add(),
        removeGuest: (id: string) => GuestsService.remove(id),
        setGuestTreatment: (id: string, t: Treatment) => GuestsService.setTreatment(id, t),
        toggleGuestEdit: (id: string) => GuestsService.toggleEdit(id),
        saveGuestRelation: (id: string) => GuestsService.saveRelation(id),
        dropGuestRelation: (id: string, memberId: string) => GuestsService.dropRelation(id, memberId),

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
        reviewCount: 0,
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
        reviewMeShown: false,
        reviewM2Id: "",
        reviewM2Label: "",
        reviewM3Id: "",
        reviewM3Label: "",
        reviewGuestId: "",
        reviewGuestLabel: "",
        reviewLikelyId: "",
        reviewLikelyScore: 0,
        reviewLast: "",
        reviewLastUndoable: false,
        reviewUndo: () => this.householdService.reviewUndo(),
        reviewBusy: false,
        reviewMsg: "",
        cleanPhase: "",
        cleanScanned: 0,
        cleanTotal: 0,
        cleanDiscard: 0,
        cleanKept: 0,
        cleanMsg: "",
        reviewCleanup: () => this.householdService.reviewCleanup(),
        reviewCleanupApply: () => this.householdService.reviewCleanupApply(),
        reviewCleanupCancel: () => this.householdService.reviewCleanupCancel(),
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
    GuestsService.attach(this.bind);

    const refresh = () => {
      if (this.mounted) this.bind.rooms = buildRooms();
    };
    this.unsubscribeRooms = [
      store.subscribe("zones", refresh),
      store.subscribe("devices", refresh),
      store.subscribe("sensors", refresh),
    ];
  }

  // ── Rooms (zone registry) ────────────────────────────────────────────────────

  private async addRoom() {
    const name = (this.bind.newRoomName || "").trim();
    if (!name) return;
    try {
      await addZone(name);
      this.bind.newRoomName = "";
      const input = document.getElementById("set-room-new") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch {
      showToaster({ from: "bottom", message: "Couldn't add the room", timer: 2500 });
    }
  }

  /** Removes the room from the registry. Devices/sensors keep their stored zone
   * string (they show under that name until re-assigned) — nothing is deleted. */
  private async removeRoom(name: string) {
    try {
      await removeZone(name);
    } catch {
      showToaster({ from: "bottom", message: "Couldn't remove the room", timer: 2500 });
    }
  }

  private async moveRoom(name: string, dir: number) {
    const zones: string[] = [...(store.get("zones") || [])];
    const i = zones.indexOf(name);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= zones.length) return;
    [zones[i], zones[j]] = [zones[j], zones[i]];
    try {
      const next = await setZones(zones);
      store.set("zones", next);
    } catch {
      showToaster({ from: "bottom", message: "Couldn't reorder the rooms", timer: 2500 });
    }
  }

  // Tab switches swap the container's id out from under us without any close
  // handler running, so anything the service put OUTSIDE its bind (document-level
  // gesture listeners, the nav-hiding body class, live mic/camera sessions) must
  // be released here or it outlives the view — the leaked keydown handler even
  // kept answering arrow keys with real promote/reject POSTs.
  unmount() {
    this.unsubscribeRooms.forEach((u) => u());
    this.unsubscribeRooms = [];
    this.householdService.detach();
    super.unmount();
  }
}

export const SettingsContent = new SettingsContentClass(HouseholdService);
