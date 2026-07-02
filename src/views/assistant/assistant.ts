import { Component } from "../../core/component";
import template from './assistant.html?raw';
import { AssistantMenuState } from "./assistant.model";
import { VoiceAskService, VoiceAskServiceClass } from "./voice-ask.service";
import { ChatsService, ChatsServiceClass } from "./chats.service";

class VAssistantContentClass extends Component<AssistantMenuState> {
  voiceAskService: VoiceAskServiceClass;
  chatsService: ChatsServiceClass;

  constructor(voiceAskService: VoiceAskServiceClass, chatsService: ChatsServiceClass) {
    super();
    this.voiceAskService = voiceAskService;
    this.chatsService = chatsService;
  }

  mount() {
    this.createBind({
      id: 'assistant',
      template,
      bind: {
        // ── Conversation history (chats.service.ts) ─────────────────────
        chatRows: [],
        chatsLoaded: false,
        chatsError: '',
        liveChatId: '',
        activeChatId: '',
        activeTurns: [],
        activeMeta: null,
        mobilePane: 'chat',
        chatSelect: (id: string) => void this.chatsService.select(id),
        chatDelete: (id: string, event: Event) => {
          event.stopPropagation(); // don't also select the row being deleted
          void this.chatsService.remove(id);
        },
        chatNew: () => void this.chatsService.startNew(),
        showList: () => { this.bind.mobilePane = 'list'; },

        // ── Composer: typed requests (same agent path as voice) ─────────
        promptText: '',
        promptSend: () => {
          if (this.bind.voiceState !== 'idle') return; // a turn is already in flight
          const text = (this.bind.promptText || '').trim();
          if (!text) return;
          // Reset the box. bindrjs's content interpolation does NOT reflect into a
          // textarea's live `.value` once the user has typed, so clear it directly.
          this.bind.promptText = '';
          const el = document.getElementById('prompt') as HTMLTextAreaElement | null;
          if (el) {
            el.value = '';
            el.style.height = ''; // collapse the autogrown box back to one line
          }
          void this.voiceAskService.ask(text);
        },
        promptKey: (event: KeyboardEvent) => {
          // Enter sends; Shift+Enter inserts a newline.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.bind.promptSend();
          }
        },
        // Grow the box with its content (up to the CSS max-height) so multi-line requests stay
        // readable on a phone instead of scrolling inside a one-line strip.
        promptGrow: (el: HTMLTextAreaElement) => {
          el.style.height = 'auto';
          el.style.height = `${el.scrollHeight}px`;
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
    this.chatsService.attach(this.bind);
    // A finished composer turn was appended to the LIVE thread by the gateway — sync the panel
    // (list order, the transcript, and focus if the user was reading an old chat).
    this.voiceAskService.onTurnComplete = () => void this.chatsService.onTurnComplete();

    void this.chatsService.refresh();
    this.chatsService.startAutoRefresh();
  }

  unmount() {
    this.chatsService.stopAutoRefresh();
    super.unmount();
  }
}

export const VAssistantContent = new VAssistantContentClass(VoiceAskService, ChatsService);
