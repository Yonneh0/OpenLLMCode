// Session state management (Phase B)
import { create } from 'zustand';
import type { ChatMessage, Session } from '../types';

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;

  createSession: (title?: string) => string;
  setActiveSession: (id: string) => void;
  addMessageToSession: (sessionId: string, message: ChatMessage) => void;
  deleteSession: (id: string) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,

  createSession: (title: string = `Session ${Date.now()}`) => {
    const session: Session = {
      id: String(Date.now()),
      title,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((s) => ({ sessions: [...s.sessions, session], activeSessionId: session.id }));
    return session.id;
  },

  setActiveSession: (id: string) => {
    set({ activeSessionId: id });
  },

  addMessageToSession: (sessionId: string, message: ChatMessage) => {
    const sessions = get().sessions.map((s) =>
      s.id === sessionId ? { ...s, messages: [...s.messages, message], updatedAt: Date.now() } : s
    );
    set({ sessions });
  },

  deleteSession: (id: string) => {
    set((s) => ({
      sessions: s.sessions.filter((x) => x.id !== id),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
    }));
  },
}));