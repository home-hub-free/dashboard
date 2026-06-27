import { Component } from "../../core/component";
import template from './assistant.html?raw';
import { AssistantMenuState } from "./assistant.model";
import { AssistantMenuService, AssistantMenuServiceClass } from "./assistant.service";
import { VoiceAskService, VoiceAskServiceClass } from "./voice-ask.service";

class VAssistantContentClass extends Component<AssistantMenuState> {
  assistantMenuService: AssistantMenuServiceClass;
  voiceAskService: VoiceAskServiceClass;

  constructor(
    assistantMenuService: AssistantMenuServiceClass,
    voiceAskService: VoiceAskServiceClass,
  ) {
    super();
    this.assistantMenuService = assistantMenuService;
    this.voiceAskService = voiceAskService;
  }

  mount() {
    this.createBind({
      id: 'assistant',
      template,
      bind: {
        announceText: '',
        assistantSay: this.assistantMenuService.assistantSay.bind(this.assistantMenuService),

        voiceState: 'idle',
        voiceTranscript: '',
        voiceReply: '',
        voiceAction: '',
        voiceStart: () => this.voiceAskService.start(),
        voiceStop: () => this.voiceAskService.stop(),
      }
    });

    // Push voice state onto the (now reactive) bind so capture progress re-renders.
    this.voiceAskService.attach(this.bind);
  }
}

export const VAssistantContent = new VAssistantContentClass(AssistantMenuService, VoiceAskService);
