// Vite + Tailwind CSS type declarations
/// <reference types="vite/client" />

// Monaco Editor — the @monaco-editor/react package exposes a global `monaco` at runtime.
// Declare explicit types since 'import()' resolution fails in strict mode (Issue #15).
interface MonacoEditorAPI {
  editor: {
    IStandaloneThemeData: any;
    defineTheme(name: string, theme: any): void;
    createModel(value: string, language?: string, uri?: any): any;
    getModel(): any | null;
  };
  Uri: { parse(path: string): any };
}
declare var monaco: MonacoEditorAPI;

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
      deleteFile: (filePath: string) => Promise<boolean>;
      onFileTreeChanged: (callback: (data: { event: string; path: string }) => void) => () => void;
    };
    engine: {
      getConfig: () => Promise<Record<string, unknown>>;
      setConfig: (cfg: Record<string, unknown>) => Promise<void>;
      detectHardware: () => Promise<unknown>;
    };
    // Terminal — PTY-based streaming terminal
    terminal: {
      spawn: () => Promise<string>;
      write: (sessionId: string, data: string) => Promise<boolean>;
      resize: (sessionId: string, cols: number, rows: number) => Promise<boolean>;
      kill: (sessionId: string) => Promise<boolean>;
      onData: (callback: (data: { sessionId: string; data: string }) => void) => () => void;
    };
    execCommand: (command: string) => Promise<string>; // legacy
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
    // Approval events (main → renderer notifications)
    approval: {
      onApprovalRequest: (callback: (data: unknown) => void) => () => void;
    },

    // Phase E — Engine logging (real-time monitoring of both engines during reasoning blocks)
    engineLogging: {
      start: (engineId: 'primary' | 'systemAI') => Promise<{ started: boolean; sessionId?: string }>;
      stop: (engineId: 'primary' | 'systemAI') => Promise<{ stopped: boolean }>;
      getLogEntries: (engineId: 'primary' | 'systemAI', includeDisk?: boolean) => Promise<Array<{ id: string; timestamp: number; level: string; message: string; source: 'primary' | 'systemAI' }>>;
      clearLogEntries: (engineId: 'primary' | 'systemAI') => Promise<void>;
      getConfig: () => Promise<{ enableDiskLogging: boolean; maxMemoryEntriesPerEngine: number }>;
      setConfig: (config: { enableDiskLogging?: boolean; maxMemoryEntriesPerEngine?: number }) => Promise<{ saved: boolean }>;
      onEngineData: (callback: (data: unknown) => void) => () => void;
      onLogEntry: (callback: (entry: unknown) => void) => () => void;
    },

    // Phase E — MCP server events (main → renderer notifications)
    mcpServer: {
      onChange: (callback: (data: unknown) => void) => () => void;
    },
  };
}
