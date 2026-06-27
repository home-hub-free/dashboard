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
        enrollState: "idle",
        enrollMsg: "",
        enrollVoice: () => this.householdService.enrollVoice(),
        forgetVoice: () => this.householdService.forgetVoice(),
      },
    });

    this.householdService.attach(this.bind);
  }
}

export const SettingsContent = new SettingsContentClass(HouseholdService);
