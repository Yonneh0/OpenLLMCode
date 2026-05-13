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
  },

  // Terminal
  execCommand: (command: string) => ipcRenderer.invoke('exec-command', command),

  // Git
  gitCommit: (message: string) => ipcRenderer.invoke('git-commit', message),

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
  },

  // Dialogs
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog-select-folder'),
  },

  // Store config for Electron to read
  electronStore: {
    getConfig: () => ipcRenderer.invoke('electron-store-get-config'),
    setConfig: (key: string, value: unknown) => ipcRenderer.invoke('electron-store-set-config', key, value),
  },
});