import { Component } from "../../core/component";
import template from "./settings.html?raw";
import { SettingsState } from "./settings.model";
import { HouseholdService, HouseholdServiceClass } from "../assistant/household.service";
import { currentUser } from "../../utils/auth";

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

        peopleEnabled: false,
        people: [],
        peopleMsg: "",
        namePerson: (id: string, name: string) => this.householdService.namePerson(id, name),
        promotePerson: (id: string, userId: string) => this.householdService.promotePerson(id, userId),
      },
    });

    this.householdService.attach(this.bind);
  }
}

export const SettingsContent = new SettingsContentClass(HouseholdService);
