import { Component } from "../../core/component";
import { requestCalendarData, requestWeatherData, updateHouseData } from "../../utils/server-handler";
import template from './assistant.html?raw';
import { AssistantMenuState } from "./assistant.model";
import { AssistantMenuService, AssistantMenuServiceClass } from "./assistant.service";
import { VoiceAskService, VoiceAskServiceClass } from "./voice-ask.service";
import { HouseholdService, HouseholdServiceClass } from "./household.service";
import { currentUser } from "../../utils/auth";

class VAssistantContentClass extends Component<AssistantMenuState> {
  assistantMenuService: AssistantMenuServiceClass;
  voiceAskService: VoiceAskServiceClass;
  householdService: HouseholdServiceClass;

  constructor(
    assistantMenuService: AssistantMenuServiceClass,
    voiceAskService: VoiceAskServiceClass,
    householdService: HouseholdServiceClass,
  ) {
    super();
    this.assistantMenuService = assistantMenuService;
    this.voiceAskService = voiceAskService;
    this.householdService = householdService;
  }

  mount() {
    this.createBind({
      id: 'assistant',
      template,
      bind: {
        customSpeech: 'Custom VAssistant Speech',
        readCalendar: requestCalendarData,
        readForecast: requestWeatherData,
        updateHouseData: updateHouseData,
        assistantSay: this.assistantMenuService.assistantSay.bind(this.assistantMenuService),

        voiceState: 'idle',
        voiceTranscript: '',
        voiceReply: '',
        voiceAction: '',
        voiceStart: () => this.voiceAskService.start(),
        voiceStop: () => this.voiceAskService.stop(),

        // Household roster + sign-out.
        signedInName: currentUser()?.displayName || '',
        meId: '',
        households: [],
        householdError: '',
        newUsername: '',
        newDisplayName: '',
        newPassword: '',
        newTone: '',
        addHousehold: () => this.householdService.add(),
        saveTone: (id: string, tone: string) => this.householdService.saveTone(id, tone),
        removeHousehold: (id: string) => this.householdService.remove(id),
        signOut: () => this.householdService.signOut(),

        pwCurrent: '',
        pwNew: '',
        pwError: '',
        changeOwnPassword: () => this.householdService.changeOwnPassword(),

        voiceSamples: 0,
        enrollState: 'idle',
        enrollMsg: '',
        enrollVoice: () => this.householdService.enrollVoice(),
        forgetVoice: () => this.householdService.forgetVoice(),
      }
    });

    // Push voice state onto the (now reactive) bind so capture progress re-renders.
    this.voiceAskService.attach(this.bind);
    // Load + manage the household roster against the same reactive bind.
    this.householdService.attach(this.bind);
  }
}

export const VAssistantContent = new VAssistantContentClass(AssistantMenuService, VoiceAskService, HouseholdService);
