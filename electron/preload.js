"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Preload script — exposes window.api for React components
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('api', {
    // Engine Manager
    engine: {
        getConfig: () => electron_1.ipcRenderer.invoke('engine-get-config'),
        setConfig: (cfg) => electron_1.ipcRenderer.invoke('engine-set-config', cfg),
        detectHardware: () => electron_1.ipcRenderer.invoke('engine-detect-hardware'),
    },
    // File Operations
    fs: {
        readFile: (filePath) => electron_1.ipcRenderer.invoke('fs-read-file', filePath),
        writeFile: (filePath, content) => electron_1.ipcRenderer.invoke('fs-write-file', filePath, content),
    },
    // Terminal
    execCommand: (command) => electron_1.ipcRenderer.invoke('exec-command', command),
    // Git
    gitCommit: (message) => electron_1.ipcRenderer.invoke('git-commit', message),
    // Chat / Inference
    chat: {
        start: (payload) => electron_1.ipcRenderer.invoke('chat-start', payload),
        sendMessage: (message) => electron_1.ipcRenderer.invoke('chat-send-message', message),
        stop: () => electron_1.ipcRenderer.invoke('chat-stop'),
        onMessage: (callback) => {
            const handler = (_e, msg) => callback(msg);
            electron_1.ipcRenderer.on('chat-response', handler);
            return () => electron_1.ipcRenderer.removeListener('chat-response', handler);
        },
    },
    // System AI
    systemAI: {
        start: (modelPath) => electron_1.ipcRenderer.invoke('systemai-start', modelPath),
        sendMessage: (message) => electron_1.ipcRenderer.invoke('systemai-send-message', message),
    },
    // Dialogs
    dialog: {
        selectFolder: () => electron_1.ipcRenderer.invoke('dialog-select-folder'),
    },
    // Store config for Electron to read
    electronStore: {
        getConfig: () => electron_1.ipcRenderer.invoke('electron-store-get-config'),
        setConfig: (key, value) => electron_1.ipcRenderer.invoke('electron-store-set-config', key, value),
    },
});
