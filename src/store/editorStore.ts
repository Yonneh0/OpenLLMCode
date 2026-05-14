import { create } from 'zustand';

export interface EditorTab {
  uri: string;        // file path relative to project root
  label: string;      // display name (basename)
  content: string;    // current buffer content
  dirty: boolean;     // unsaved changes
  language: string;   // monaco language id
}

interface EditorState {
  tabs: EditorTab[];
  activeUri: string | null;
  getActiveTab: () => EditorTab | undefined;
  openFile: (uri: string, content: string, language?: string) => void;
  closeTab: (uri: string) => boolean; // returns false if dirty and not saved
  setActiveTab: (uri: string) => void;
  updateContent: (uri: string, content: string) => void;
  markClean: (uri: string) => void;
  markDirty: (uri: string) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeUri: null,

  getActiveTab: () => {
    const state = get();
    return state.tabs.find((t) => t.uri === state.activeUri);
  },

  openFile: (uri: string, content: string, language = 'plaintext') => {
    set((state) => {
      const existing = state.tabs.find((t) => t.uri === uri);
      if (existing) {
        // Already open — just activate
        return { activeUri: uri };
      }
      const tab: EditorTab = {
        uri,
        label: uri.split('/').pop() ?? uri,
        content,
        dirty: false,
        language,
      };
      return {
        tabs: [...state.tabs, tab],
        activeUri: uri,
      };
    });
  },

  closeTab: (uri: string) => {
    let allowed = true;
    set((state) => {
      const tab = state.tabs.find((t) => t.uri === uri);
      if (tab?.dirty) {
        allowed = false;
        return state; // Don't close dirty tabs without saving first
      }
      const newTabs = state.tabs.filter((t) => t.uri !== uri);
      let newActive = state.activeUri;
      if (state.activeUri === uri) {
        // Activate the tab to the left, or null
        const idx = state.tabs.findIndex((t) => t.uri === uri);
        newActive =
          idx > 0 ? state.tabs[idx - 1].uri : newTabs.length > 0 ? newTabs[0].uri : null;
      }
      return { tabs: newTabs, activeUri: newActive };
    });
    return allowed;
  },

  setActiveTab: (uri: string) => set({ activeUri: uri }),

  updateContent: (uri: string, content: string) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.uri === uri ? { ...t, content } : t)),
    })),

  markClean: (uri: string) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.uri === uri ? { ...t, dirty: false } : t)),
    })),

  markDirty: (uri: string) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.uri === uri ? { ...t, dirty: true } : t)),
    })),
}));