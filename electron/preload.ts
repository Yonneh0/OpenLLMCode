// Preload script — exposes window.api for React components
import { contextBridge, ipcRenderer } from 'electron';

export interface AppConfig { backend?: string; binarySource?: string; selectedModel?: string; systemAIModel?: string; hfToken?: string; }
type Callback = (msg: unknown) => void;

contextBridge.exposeInMainWorld('api', {
  // Engine Manager
  engine: {
    getConfig: () => ipcRenderer.invoke('engine-get-config') as Promise<AppConfig>,
    setConfig: (cfg: AppConfig) => ipcRenderer.invoke('engine-set-config', cfg),
    detectHardware: () => ipcRenderer.invoke('engine-detect-hardware'),
  },

  // File Operations
  fs: {
    readFile: (filePath: string) => ipcRenderer.invoke('fs-read-file', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs-write-file', filePath, content),
    getProjectRoot: () => ipcRenderer.invoke('fs-get-project-root'),
    setProjectRoot: (rootPath: string) => ipcRenderer.invoke('fs-set-project-root', rootPath),
    readTree: () => ipcRenderer.invoke('fs-read-tree'),
    startWatcher: () => ipcRenderer.invoke('fs-start-watcher'),
    stopWatcher: () => ipcRenderer.invoke('fs-stop-watcher'),
    onFileTreeChanged: (callback: Callback) => {
      const handler = (_e: unknown, data: unknown) => callback(data);
      ipcRenderer.on('file-tree-changed', handler);
      return () => ipcRenderer.removeListener('file-tree-changed', handler);
    },

    // Phase C — File search & glob, deletion
    deleteFile: (filePath: string) => ipcRenderer.invoke('fs-delete-file', filePath),
    searchFiles: (payload: { path: string; regex: string; filePattern?: string }) =>
      ipcRenderer.invoke('fs-search-files', payload),
    glob: (payload: { pattern: string; path?: string }) =>
      ipcRenderer.invoke('fs-glob', payload),

    // Phase C — File tree operations via IPC (for agent tools)
    searchFilesIPC: async (searchPath: string, regex: string, filePattern?: string): Promise<string> => {
      const result = await ipcRenderer.invoke('fs-search-files', { path: searchPath, regex, filePattern });
      return result || '';
    },
    globIPC: async (pattern: string, baseDir?: string): Promise<string> => {
      const result = await ipcRenderer.invoke('fs-glob', { pattern, path: baseDir });
      return result || '';
    },
  },

  // Terminal — PTY-based streaming terminal + legacy execCommand
  terminal: {
    spawn: () => ipcRenderer.invoke('terminal-spawn') as Promise<string>,
    write: (sessionId: string, data: string) => ipcRenderer.invoke('terminal-write', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) => ipcRenderer.invoke('terminal-resize', sessionId, cols, rows),
    kill: (sessionId: string) => ipcRenderer.invoke('terminal-kill', sessionId),
    onData: (callback: Callback) => {
      const handler = (_e: unknown, data: unknown) => callback(data);
      ipcRenderer.on('terminal-data', handler);
      return () => ipcRenderer.removeListener('terminal-data', handler);
    },
  },
  execCommand: (command: string) => ipcRenderer.invoke('exec-command', command), // legacy

  // Git — Phase C extended with checkpoint, squash, stash operations
  git: {
    commit: (message: string) => ipcRenderer.invoke('git-commit', message),
    getHeadHash: () => ipcRenderer.invoke('git-get-head-hash'),
    createCheckpoint: (label: string) => ipcRenderer.invoke('git-create-checkpoint', label),
    restoreToCheckpoint: (checkpointHash: string) => ipcRenderer.invoke('git-restore-to-checkpoint', checkpointHash),
    squashCommits: (commitMessage: string, count?: number) => ipcRenderer.invoke('git-squash-commits', commitMessage, count ?? 5),
    stash: () => ipcRenderer.invoke('git-stash'),
    stashPop: () => ipcRenderer.invoke('git-stash-pop'),
    hasUncommitted: () => ipcRenderer.invoke('git-has-uncommitted'),
  },

  // Chat / Inference
  chat: {
    start: (payload: Record<string, unknown>) => ipcRenderer.invoke('chat-start', payload),
    sendMessage: (message: string) => ipcRenderer.invoke('chat-send-message', message),
    stop: () => ipcRenderer.invoke('chat-stop'),
    onMessage: (callback: Callback) => {
      const handler = (_e: unknown, msg: unknown) => callback(msg);
      ipcRenderer.on('chat-response', handler);
      return () => ipcRenderer.removeListener('chat-response', handler);
    },
  },

  // System AI
  systemAI: {
    start: (modelPath: string) => ipcRenderer.invoke('systemai-start', modelPath),
    sendMessage: (message: string) => ipcRenderer.invoke('systemai-send-message', message),
    stop: () => ipcRenderer.invoke('systemai-stop'),
  },

  // Dialogs
  dialog: {
    selectFolder: (parentWindow?: any) => ipcRenderer.invoke('dialog-select-folder', parentWindow),
  },

  // Store config for Electron to read
  electronStore: {
    getConfig: () => ipcRenderer.invoke('electron-store-get-config'),
    setConfig: (key: string, value: unknown) => ipcRenderer.invoke('electron-store-set-config', key, value),
  },

  // Phase C — Approval events (main → renderer notifications)
  approval: {
    onApprovalRequest: (callback: Callback) => {
      const handler = (_e: unknown, data: unknown) => callback(data);
      ipcRenderer.on('approval-request', handler);
      return () => ipcRenderer.removeListener('approval-request', handler);
    },
  },
});