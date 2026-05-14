import { create } from 'zustand';
import type { ChatMessage } from '../types';

interface ChatState {
  messages: ChatMessage[];
  isSending: boolean;
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setLoading: (loading: boolean) => void;
  appendToLastAssistant: (chunk: string) => void;
  clearSession: () => void;
  stopStreaming: () => void;
}

let messageIdCounter = Date.now();

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isSending: false,

  addMessage: (role, content) => {
    set({ isSending: true });
    const msg: ChatMessage = { id: String(messageIdCounter++), role, content, timestamp: Date.now() };
    set((s) => ({ messages: [...s.messages, msg], isSending: false }));

    // If user message, simulate assistant response after a delay
    if (role === 'user') {
      setTimeout(() => {
        const reply: ChatMessage = { id: String(messageIdCounter++), role: 'assistant', content: `Response to: "${content}"`, timestamp: Date.now(), streaming: true };
        set((s) => ({ messages: [...s.messages, reply] }));
      }, 500);
    }
  },

   setMessages: (msgs: ChatMessage[]) => set({ messages: msgs }),

  setLoading: (loading) => set({ isSending: loading }),

  appendToLastAssistant: (chunk) => {
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        last.content += chunk;
        return { messages: msgs };
      }
      return s;
    });
  },

  clearSession: () => set({ messages: [] }),

  stopStreaming: () => {
    // Cancel any ongoing streaming animation and mark all assistant messages as non-streaming
    set({ 
      isSending: false,
      messages: get().messages.map((m) => (m.role === 'assistant' ? { ...m, streaming: false } : m))
    });
  },
}));