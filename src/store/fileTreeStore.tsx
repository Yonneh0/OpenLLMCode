// File tree state (Phase A)
import { create } from 'zustand';

interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileItem[];
}

interface FileTreeState {
  rootPath: string;
  files: FileItem[];
  loading: boolean;
  selectedFile: string | null;
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

  setRootPath: (rootPath: string) => set({ rootPath }),
}));

export function useFileTree() {
  const state = useFileTreeStore.getState();
  return { ...state };
}