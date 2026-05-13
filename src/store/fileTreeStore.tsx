// File tree store — reads from disk via IPC, watches for changes with chokidar
import { create } from 'zustand';

export interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileItem[];
  sizeMB?: number;
}

interface FileTreeState {
  rootPath: string;
  files: FileItem[];
  loading: boolean;
  selectedFile: string | null;
  expandedDirs: Set<string>;

  // Actions
  setRootPath: (rootPath: string) => void;
  loadTree: () => Promise<void>;
  selectFile: (filePath: string | null) => void;
  toggleDir: (dirPath: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  updateFromEvent: (event: string, path: string) => Promise<void>;
}

const defaultFiles: FileItem[] = [
  { name: 'src', path: '/src', type: 'directory', children: [
    { name: 'main.tsx', path: '/src/main.tsx', type: 'file' },
    { name: 'types.ts', path: '/src/types.ts', type: 'file' },
  ]},
];

export const useFileTreeStore = create<FileTreeState>((set, get) => ({
  rootPath: '',
  files: defaultFiles,
  loading: false,
  selectedFile: null,
  expandedDirs: new Set(),

  setRootPath: async (rootPath: string) => {
    set({ rootPath, loading: true });
    try {
      const tree: Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }> = await window.api.fs.setProjectRoot(rootPath);
      // Expand all directories by default on initial load
      const expanded = new Set<string>();
      const collectExpanded = (items: FileItem[]) => {
        for (const item of items) {
          if (item.type === 'directory') {
            expanded.add(item.path);
            if (item.children) collectExpanded(item.children);
          }
        }
      };
      const fileItems: FileItem[] = tree.map((item) => ({ name: item.name, path: item.path, type: item.type, children: item.children?.map((c: unknown) => c as FileItem) }));
      collectExpanded(fileItems);
      set({ files: fileItems, loading: false, expandedDirs: expanded });
    } catch {
      // Fallback to default mock data if IPC fails (dev mode without Electron)
      set({ rootPath, loading: false });
    }
  },

  loadTree: async () => {
    set({ loading: true });
    try {
      const tree: Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }> = await window.api.fs.readTree();
      // Preserve expanded state
      const expanded = new Set(get().expandedDirs);
      const collectExpanded = (items: FileItem[]) => {
        for (const item of items) {
          if (item.type === 'directory') {
            expanded.add(item.path);
            if (item.children) collectExpanded(item.children);
          }
        }
      };
      const fileItems: FileItem[] = tree.map((item) => ({ name: item.name, path: item.path, type: item.type, children: item.children?.map((c: unknown) => c as FileItem) }));
      collectExpanded(fileItems);
      set({ files: fileItems, loading: false, expandedDirs: expanded });
    } catch {
      // Fallback to default mock data if IPC fails (dev mode without Electron)
      set({ loading: false });
    }
  },

  selectFile: (filePath: string | null) => set({ selectedFile: filePath }),

  toggleDir: (dirPath: string) => {
    const expanded = new Set(get().expandedDirs);
    if (expanded.has(dirPath)) {
      expanded.delete(dirPath);
    } else {
      expanded.add(dirPath);
    }
    set({ expandedDirs: expanded });
  },

  expandAll: () => {
    const expanded = new Set<string>();
    const collectExpanded = (items: FileItem[]) => {
      for (const item of items) {
        if (item.type === 'directory') {
          expanded.add(item.path);
          if (item.children) collectExpanded(item.children);
        }
      }
    };
    collectExpanded(get().files);
    set({ expandedDirs: expanded });
  },

  collapseAll: () => set({ expandedDirs: new Set() }),

  updateFromEvent: async (event: string, path: string) => {
    // On file changes, reload the tree to reflect updates
    if (event === 'add' || event === 'change' || event === 'unlink') {
      await get().loadTree();
    }
  },
}));

// Hook for easy access in components
export function useFileTree() {
  const state = useFileTreeStore.getState();
  return { ...state };
}

// Initialize file watcher on mount (call from App component)
export async function initFileWatcher() {
  try {
    await window.api.fs.startWatcher();
    // Listen for chokidar events
    window.api.fs.onFileTreeChanged((data: any) => {
      useFileTreeStore.getState().updateFromEvent(data.event, data.path);
    });
  } catch {
    // IPC not available in dev mode without Electron — that's fine
  }
}

// Note: Window.api type is centralized in src/vite-env.d.ts — no duplicate declaration needed here.
