import { Component } from "../../core/component";
import template from './assistant.html?raw';
import { AssistantMenuState } from "./assistant.model";
import { VoiceAskService, VoiceAskServiceClass } from "./voice-ask.service";

class VAssistantContentClass extends Component<AssistantMenuState> {
  voiceAskService: VoiceAskServiceClass;

  constructor(voiceAskService: VoiceAskServiceClass) {
    super();
    this.voiceAskService = voiceAskService;
  }

  mount() {
    this.createBind({
      id: 'assistant',
      template,
      bind: {
        // "Type a request" — a typed alternative to push-to-talk for when the
        // user can't speak. Routes through the SAME agent path as the voice
        // request (VoiceAskService.ask), so the reply lands in the shared
        // conversation bubbles and the action runs as the signed-in member.
        promptText: '',
        promptSend: () => {
          if (this.bind.voiceState !== 'idle') return; // a turn is already in flight
          const text = (this.bind.promptText || '').trim();
          if (!text) return;
          // Reset the box. bindrjs's content interpolation does NOT reflect into a
          // textarea's live `.value` once the user has typed, so clear it directly.
          this.bind.promptText = '';
          const el = document.getElementById('prompt') as HTMLTextAreaElement | null;
          if (el) el.value = '';
          void this.voiceAskService.ask(text);
        },
        promptKey: (event: KeyboardEvent) => {
          // Enter sends; Shift+Enter inserts a newline.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.bind.promptSend();
          }
        },

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

export const VAssistantContent = new VAssistantContentClass(VoiceAskService);
