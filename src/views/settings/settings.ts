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
        voiceSamples: 0,
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
        faceSamples: 0,
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
        calendarHouseLinked: false,
        calendarMineLinked: false,
        calendarBusy: false,
        calendarMsg: "",
        connectHouseCalendar: () => this.householdService.connectHouseCalendar(),
        connectMyCalendar: () => this.householdService.connectMyCalendar(),
        disconnectHouseCalendar: () => this.householdService.disconnectHouseCalendar(),
        disconnectMyCalendar: () => this.householdService.disconnectMyCalendar(),

        peopleEnabled: false,
        people: [],
        peopleMsg: "",
        namePerson: (id: string, name: string) => this.householdService.namePerson(id, name),
        promotePerson: (id: string, userId: string) => this.householdService.promotePerson(id, userId),

        // Face lightbox — pure view state (no service). Tapping a gallery face opens
        // its captured crop full-size; primitives only, reassigned so the :if region
        // re-renders. The backdrop / close button call closeFace; stopZoom keeps a
        // click on the image itself from bubbling up to the backdrop and closing it.
        zoomOpen: false,
        zoomUrl: "",
        zoomLabel: "",
        zoomSub: "",
        openFace: (person: Person) => {
          if (!person?.thumbUrl) return; // nothing captured yet → no-op
          this.bind.zoomUrl = person.thumbUrl;
          this.bind.zoomLabel = person.name || person.label;
          this.bind.zoomSub =
            person.class === "guest"
              ? `Guest · seen ${person.sightings ?? 0}×`
              : "Household member";
          this.bind.zoomOpen = true;
        },
        closeFace: () => {
          this.bind.zoomOpen = false;
        },
        stopZoom: (event: Event) => event.stopPropagation(),
      },
    });

    this.householdService.attach(this.bind);
  }
}

export const SettingsContent = new SettingsContentClass(HouseholdService);
