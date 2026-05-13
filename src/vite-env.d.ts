// Vite + Tailwind CSS type declarations
/// <reference types="vite/client" />

// CSS module/type declaration for global stylesheets
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

// Global Window.api interface — used by Electron IPC bridge across the codebase
interface Window {
  api: {
    fs: {
      readFile: (filePath: string) => Promise<string | null>;
      writeFile: (filePath: string, content: string) => Promise<boolean>;
      getProjectRoot: () => Promise<string>;
      setProjectRoot: (rootPath: string) => Promise<Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }>>;
      readTree: () => Promise<Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }>>;
      startWatcher: () => Promise<boolean>;
      stopWatcher: () => Promise<boolean>;
      onFileTreeChanged: (callback: (data: { event: string; path: string }) => void) => () => void;
    };
    engine: {
      getConfig: () => Promise<Record<string, unknown>>;
      setConfig: (cfg: Record<string, unknown>) => Promise<void>;
      detectHardware: () => Promise<unknown>;
    };
    execCommand: (command: string) => Promise<string>;
    gitCommit: (message: string) => Promise<string>;
    git: {
      commit: (message: string) => Promise<string>;
      getHeadHash: () => Promise<string>;
      createCheckpoint: (label: string) => Promise<string>;
      restoreToCheckpoint: (checkpointHash: string) => Promise<boolean>;
      squashCommits: (commitMessage: string, count?: number) => Promise<boolean>;
      stash: () => Promise<boolean>;
      stashPop: () => Promise<boolean>;
      hasUncommitted: () => Promise<boolean>;
    };
    chat: {
      start: (payload: Record<string, unknown>) => Promise<string>;
      sendMessage: (message: string) => Promise<string>;
      stop: () => Promise<boolean>;
      onMessage: (callback: (msg: unknown) => void) => () => void;
    };
    systemAI: {
      start: (modelPath: string) => Promise<boolean>;
      sendMessage: (message: string) => Promise<string>;
      stop: () => Promise<boolean>;
    };
    dialog: {
      selectFolder: (parentWindow?: unknown) => Promise<string | null>;
    };
    electronStore: {
      getConfig: () => Promise<Record<string, unknown>>;
      setConfig: (key: string, value: unknown) => Promise<boolean>;
    };
  };
}
