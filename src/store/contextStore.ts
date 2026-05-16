// Context Store — manages conversation compression state globally
// Persisted in localStorage so compressed context survives between sessions
import { create } from 'zustand';
import type { CompressedEntry } from '../types';

interface ContextState {
  // Compressed history entries (AI-generated summaries of older conversation parts)
  compressedHistory: CompressedEntry[];
  
  // Whether compression is currently in progress
  isCompressing: boolean;
  
  // Actions
  setCompressedHistory: (history: CompressedEntry[]) => void;
  appendCompressedEntry: (entry: CompressedEntry) => void;
  setIsCompressing: (compressing: boolean) => void;
  
  // Persistence
  saveToDisk: () => Promise<void>;
  loadFromDisk: () => Promise<void>;
}

const CONTEXT_STORAGE_KEY = 'openllmcode-compressed-context';

export const useContextStore = create<ContextState>((set, get) => ({
  compressedHistory: [],
  isCompressing: false,
  
  setCompressedHistory: (history) => {
    set({ compressedHistory: history });
    // Auto-save after compression
    void get().saveToDisk();
  },
  
  appendCompressedEntry: (entry) => {
    set((s) => ({ 
      compressedHistory: [...s.compressedHistory, entry] 
    }));
    // Auto-save after adding a new entry
    void get().saveToDisk();
  },
  
  setIsCompressing: (compressing) => {
    set({ isCompressing: compressing });
  },
  
  saveToDisk: async () => {
    try {
      const state = get();
      if (state.compressedHistory.length === 0) return;
      
      localStorage.setItem(
        CONTEXT_STORAGE_KEY, 
        JSON.stringify(state.compressedHistory)
      );
    } catch (err) {
      console.warn('Failed to save compressed context:', err);
    }
  },
  
  loadFromDisk: async () => {
    try {
      const raw = localStorage.getItem(CONTEXT_STORAGE_KEY);
      if (!raw) return;
      
      const history = JSON.parse(raw) as CompressedEntry[];
      // Validate — ensure each entry has required fields
      const validEntries = history.filter(
        e => typeof e.summary === 'string' && Array.isArray(e.keyDecisions) && Array.isArray(e.filesModified)
      );
      
      set({ compressedHistory: validEntries });
    } catch (err) {
      console.warn('Failed to load compressed context:', err);
    }
  },
}));

// ─── IPC Event Handler for when main process loads context ──────────────
export function handleCompressedContextLoaded(history: CompressedEntry[]): void {
  useContextStore.getState().setCompressedHistory(history);
}