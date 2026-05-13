// Preload script — exposes window.api for React components
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // Engine Manager
  engine: {
    getConfig: () => ipcRenderer.invoke('engine-get-config'),
    setConfig: (cfg) => ipcRenderer.invoke('engine-set-config', cfg),
    detectHardware: () => ipcRenderer.invoke('engine-detect-hardware'),
  },

  // File Operations
  fs: {
    readFile: (filePath) => ipcRenderer.invoke('fs-read-file', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('fs-write-file', filePath, content),
  },

  // Terminal
  execCommand: (command) => ipcRenderer.invoke('exec-command', command),

  // Git
  gitCommit: (message) => ipcRenderer.invoke('git-commit', message),

  // Chat / Inference
  chat: {
    start: (payload) => ipcRenderer.invoke('chat-start', payload),
    sendMessage: (message) => ipcRenderer.invoke('chat-send-message', message),
    stop: () => ipcRenderer.invoke('chat-stop'),
    onMessage: (callback) => {
      const handler = (_e, msg) => callback(msg);
      ipcRenderer.on('chat-response', handler);
      return () => ipcRenderer.removeListener('chat-response', handler);
    },
  },

  // System AI
  systemAI: {
    start: (modelPath) => ipcRenderer.invoke('systemai-start', modelPath),
    sendMessage: (message) => ipcRenderer.invoke('systemai-send-message', message),
  },

  // Dialogs
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog-select-folder'),
  },

  // Store config for Electron to read
  electronStore: {
    getConfig: () => ipcRenderer.invoke('electron-store-get-config'),
    setConfig: (key, value) => ipcRenderer.invoke('electron-store-set-config', key, value),
  },
});