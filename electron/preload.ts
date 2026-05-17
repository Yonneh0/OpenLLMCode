import { ipcRenderer, contextBridge } from 'electron';

export interface AppConfig { backend?: string; binarySource?: string; selectedModel?: string; systemAIModel?: string; hfToken?: string; }

type Callback = (data: unknown) => void;

interface Api {
  engine: {
    getConfig: () => Promise<AppConfig>;
    setConfig: (cfg: AppConfig) => Promise<void>;
    detectHardware: () => Promise<{ os: string }>;
  };
  fs: {
    readFile: (filePath: string) => Promise<string | null>;
    writeFile: (filePath: string, content: string) => Promise<boolean>;
    getProjectRoot: () => Promise<string>;
    setProjectRoot: (rootPath: string) => Promise<void>;
    readTree: () => Promise<unknown[]>;
    startWatcher: () => Promise<boolean>;
    stopWatcher: () => Promise<boolean>;
    onFileTreeChanged: (callback: Callback) => () => void;
    deleteFile: (filePath: string) => Promise<boolean>;
    searchFiles: (payload: { path: string; regex: string; filePattern?: string }) => Promise<string>;
    glob: (payload: { pattern: string; path?: string }) => Promise<string>;
  };
  terminal: {
    spawn: () => Promise<string>;
    write: (sessionId: string, data: string) => Promise<boolean>;
    resize: (sessionId: string, cols: number, rows: number) => Promise<boolean>;
    kill: (sessionId: string) => Promise<boolean>;
    onData: (callback: Callback) => () => void;
  };
  execCommand: (command: string) => Promise<string | null>;
  git: {
    commit: (message: string) => Promise<unknown>;
    getHeadHash: () => Promise<string>;
    createCheckpoint: (label: string) => Promise<string>;
    restoreToCheckpoint: (checkpointHash: string) => Promise<boolean>;
    squashCommits: (commitMessage: string, count?: number) => Promise<boolean>;
    stash: () => Promise<boolean>;
    stashPop: () => Promise<boolean>;
    hasUncommitted: () => Promise<boolean>;
  };
  chat: {
    start: (payload: Record<string, unknown>) => Promise<unknown>;
    sendMessage: (message: string) => Promise<unknown>;
    stop: () => Promise<void>;
    onMessage: (callback: Callback) => () => void;
  };
  systemAI: {
    start: (modelPath: string) => Promise<boolean>;
    sendMessage: (message: string) => Promise<unknown>;
    stop: () => Promise<void>;
  };
  dialog: {
    selectFolder: (parentWindow?: any) => Promise<string | null>;
    selectFile: (parentWindow?: any) => Promise<string | null>;
  };
  electronStore: {
    getConfig: () => Promise<Record<string, unknown>>;
    setConfig: (key: string, value: unknown) => Promise<boolean>;
  };
  approval: {
    onApprovalRequest: (callback: Callback) => () => void;
  };
  engineLogging: {
    start: (engineId: 'primary' | 'systemAI') => Promise<unknown>;
    stop: (engineId: 'primary' | 'systemAI') => Promise<unknown>;
    getLogEntries: (engineId: 'primary' | 'systemAI', includeDisk?: boolean) => Promise<unknown[]>;
    clearLogEntries: (engineId: 'primary' | 'systemAI') => Promise<void>;
    getConfig: () => Promise<Record<string, unknown>>;
    setConfig: (config: { enableDiskLogging?: boolean; maxMemoryEntriesPerEngine?: number }) => Promise<boolean>;
    onEngineData: (callback: Callback) => () => void;
    onLogEntry: (callback: Callback) => () => void;
  };
  appShutdown: () => Promise<boolean>;
  mcp: {
    getToolNames: () => Promise<string[]>;
    callTool: (toolName: string, params?: Record<string, unknown>) => Promise<unknown>;
  };
  pingu: {
    downloadGguf: (opts: { url: string; quantization: string; onProgress?: (pct: number) => void }) => 
      Promise<{ success: boolean; error?: string }>;
    loadGgufFromFile: (filePath: string, quantMode?: string) => 
      Promise<{ success: boolean; destPath?: string; error?: string }>;
    selectGgufFile: () => Promise<string | null>;
    downloadLlamaCpp: () => 
      Promise<{ success: boolean; extracted?: string; error?: string }>;
    installLlamaCppFromZip: (filePath: string) => 
      Promise<{ success: boolean; extracted?: string; error?: string }>;
    selectLlamaCppZip: () => Promise<string | null>;
    getHardwareInfo: () => Promise<{ platform: string; gpu?: string; ramGB: number; hasLlamaCpp: boolean }>;
  };
  onGgufProgress: (callback: (data: { percent: number; downloaded: number; total?: number }) => void) => () => void;
  reloadModel: (opts: { backend: string; gpuLayers?: number; threads?: number; contextWindow?: number }) => 
    Promise<{ success: boolean; error?: string }>;
}

export interface QemuAPI {
  create: (config: Record<string, unknown>) => Promise<unknown>;
  start: (vmId: string) => Promise<void>;
  pause: (vmId: string) => Promise<void>;
  resume: (vmId: string) => Promise<void>;
  stop: (vmId: string) => Promise<void>;
  delete: (vmId: string) => Promise<void>;
  monitorSend: (vmId: string, command: string, args?: Record<string, unknown>) => Promise<unknown>;
  listInstances: () => Promise<{ count: number; running: unknown[] }>;
  createDiskImage: (format: string, sizeMB: number, path: string) => Promise<void>;
  convertDiskImage: (srcFormat: string, dstFormat: string, srcPath: string, dstPath: string) => Promise<void>;
  getDiskInfo: (path: string) => Promise<unknown>;
  getAvailableMachines: (arch: string) => Promise<unknown[]>;
  getAvailableCPUs: (arch: string) => Promise<string[]>;
  hotplugCPU: (vmId: string, socketId: number) => Promise<void>;
  addMemory: (vmId: string, sizeBytes: number) => Promise<void>;
  queryBlocks: (vmId: string) => Promise<unknown>;
  createSnapshot: (vmId: string, driveId: string) => Promise<string>;
  checkKVM: () => Promise<boolean>;
  getNetBackends: () => Promise<string[]>;
  onQemuOutput: (callback: (data: unknown) => void) => () => void;
  listToolchains: () => Promise<unknown[]>;
  ensureToolchain: (arch: string) => Promise<unknown>;
  getProjectToolchains: (projectDir: string) => Promise<Record<string, unknown>>;
}

declare global {
  interface Window {
    api: Api & { qemu?: QemuAPI };
  }
}

// Use contextBridge to expose the API in a contextIsolated world (contextIsolation: true)
const api: Api & { qemu: QemuAPI } = {
  engine: {
    getConfig: () => ipcRenderer.invoke('engine-get-config') as Promise<AppConfig>,
    setConfig: (cfg: AppConfig) => ipcRenderer.invoke('engine-set-config', cfg),
    detectHardware: () => ipcRenderer.invoke('engine-detect-hardware'),
  },

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

    deleteFile: (filePath: string) => ipcRenderer.invoke('fs-delete-file', filePath),
    searchFiles: (payload: { path: string; regex: string; filePattern?: string }) =>
      ipcRenderer.invoke('fs-search-files', payload),
    glob: (payload: { pattern: string; path?: string }) =>
      ipcRenderer.invoke('fs-glob', payload),

  },

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
  execCommand: (command: string) => ipcRenderer.invoke('exec-command', command),
  git: {
    commit: (message: string) => ipcRenderer.invoke('git-commit', message),
    getHeadHash: () => ipcRenderer.invoke('git-get-head-hash'),
    createCheckpoint: (label: string) => ipcRenderer.invoke('git-create-checkpoint', label),
    restoreToCheckpoint: (checkpointHash: string) => ipcRenderer.invoke('git-restore-to-checkpoint', checkpointHash),
    squashCommits: (commitMessage: string, count = 5) => ipcRenderer.invoke('git-squash-commits', commitMessage, count),
    stash: () => ipcRenderer.invoke('git-stash'),
    stashPop: () => ipcRenderer.invoke('git-stash-pop'),
    hasUncommitted: () => ipcRenderer.invoke('git-has-uncommitted'),
  },

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

  systemAI: {
    start: (modelPath: string) => ipcRenderer.invoke('systemai-start', modelPath),
    sendMessage: (message: string) => ipcRenderer.invoke('systemai-send-message', message),
    stop: () => ipcRenderer.invoke('systemai-stop'),
  },

  dialog: {
    selectFolder: (parentWindow?: any) => ipcRenderer.invoke('dialog-select-folder', parentWindow),
    selectFile: (parentWindow?: any) => ipcRenderer.invoke('dialog-select-file', parentWindow),
  },

  electronStore: {
    getConfig: () => ipcRenderer.invoke('electron-store-get-config'),
    setConfig: (key: string, value: unknown) => ipcRenderer.invoke('electron-store-set-config', key, value),
  },

  approval: {
    onApprovalRequest: (callback: Callback) => {
      const handler = (_e: unknown, data: unknown) => callback(data);
      ipcRenderer.on('approval-request', handler);
      return () => ipcRenderer.removeListener('approval-request', handler);
    },
  },

  engineLogging: {
    start: (engineId: 'primary' | 'systemAI') => ipcRenderer.invoke('engine-logging-start', engineId),
    stop: (engineId: 'primary' | 'systemAI') => ipcRenderer.invoke('engine-logging-stop', engineId),
    getLogEntries: (engineId: 'primary' | 'systemAI', includeDisk = false) => ipcRenderer.invoke('engine-logging-get-log-entries', engineId, includeDisk),
    clearLogEntries: (engineId: 'primary' | 'systemAI') => ipcRenderer.invoke('engine-logging-clear-log-entries', engineId),
    getConfig: () => ipcRenderer.invoke('engine-logging-get-config'),
    setConfig: (config: { enableDiskLogging?: boolean; maxMemoryEntriesPerEngine?: number }) => ipcRenderer.invoke('engine-logging-set-config', config),
    onEngineData: (callback: Callback) => {
      const handler = (_e: unknown, data: unknown) => callback(data);
      ipcRenderer.on('engine-logging-data', handler);
      return () => ipcRenderer.removeListener('engine-logging-data', handler);
    },
    onLogEntry: (callback: Callback) => {
      const handler = (_e: unknown, entry: unknown) => callback(entry);
      ipcRenderer.on('engine-logging-log', handler);
      return () => ipcRenderer.removeListener('engine-logging-log', handler);
    },
  },
  appShutdown: () => ipcRenderer.invoke('app-shutdown'),
  mcp: {
      getToolNames: () => ipcRenderer.invoke('mcp-get-tool-names'),
      callTool: (toolName: string, params?: Record<string, unknown>) => 
        ipcRenderer.invoke('mcp-call-tool', toolName, params || {}),
    },
  pingu: {
    downloadGguf: (opts: { url: string; quantization: string }) => 
      ipcRenderer.invoke('pingu-download-gguf', opts).then((r: any) => ({ success: r.success, error: r.error })),

    loadGgufFromFile: (filePath: string, quantMode?: string) =>
      ipcRenderer.invoke('pingu-load-gguf-file', { filePath, quantization: quantMode })
        .then((r: any) => ({ success: r.success, destPath: r.destPath || undefined, error: r.error })),

    selectGgufFile: () => ipcRenderer.invoke('pingu-select-gguf-file'),
    
    downloadLlamaCpp: () =>
      ipcRenderer.invoke('pingu-download-llama-cpp').then((r: any) => ({ success: r.success, extracted: r.extracted, error: r.error })),

    installLlamaCppFromZip: (filePath: string) =>
      ipcRenderer.invoke('pingu-install-llama-cpp-zip', { filePath })
        .then((r: any) => ({ success: r.success, extracted: r.extracted, error: r.error })),

    selectLlamaCppZip: () => ipcRenderer.invoke('pingu-select-llama-zip'),
    
    getHardwareInfo: () => ipcRenderer.invoke('pingu-get-hardware-info'),
  },
  onGgufProgress: (callback: (data: { percent: number; downloaded: number; total?: number }) => void) => {
      const handler = (_e: unknown, data: { percent?: number; downloaded?: number; total?: number } | undefined) => {
        if (!data || typeof data.percent !== 'number' || typeof data.downloaded !== 'number') return;
        callback({ percent: data.percent, downloaded: data.downloaded, total: data.total });
      };
      ipcRenderer.on('pingu-gguf-progress', handler);
      return () => ipcRenderer.removeListener('pingu-gguf-progress', handler);
    },
  reloadModel: (opts: { backend: string; gpuLayers?: number; threads?: number; contextWindow?: number }) => ipcRenderer.invoke('pingu-reload-model', opts),
  qemu: {
      create: (config: Record<string, unknown>) => ipcRenderer.invoke('qemu-vm-create', config),
      start: (vmId: string) => ipcRenderer.invoke('qemu-vm-start', vmId),
      pause: (vmId: string) => ipcRenderer.invoke('qemu-vm-pause', vmId),
      resume: (vmId: string) => ipcRenderer.invoke('qemu-vm-resume', vmId),
      stop: (vmId: string) => ipcRenderer.invoke('qemu-vm-stop', vmId),
      delete: (vmId: string) => ipcRenderer.invoke('qemu-vm-delete', vmId),
      monitorSend: (vmId: string, command: string, args?: Record<string, unknown>) => 
        ipcRenderer.invoke('qemu-monitor-send', vmId, command, args || {}),
      listInstances: () => ipcRenderer.invoke('qemu-vm-list'),
      createDiskImage: (format: string, sizeMB: number, path: string) => 
        ipcRenderer.invoke('qemu-img-create', format, sizeMB, path),
      convertDiskImage: (srcFormat: string, dstFormat: string, srcPath: string, dstPath: string) => 
        ipcRenderer.invoke('qemu-img-convert', srcFormat, dstFormat, srcPath, dstPath),
      getDiskInfo: (path: string) => ipcRenderer.invoke('qemu-img-info', path),
      getAvailableMachines: (arch: string) => ipcRenderer.invoke('qemu-get-available-machines', arch),
      getAvailableCPUs: (arch: string) => ipcRenderer.invoke('qemu-get-available-cpus', arch),
      hotplugCPU: (vmId: string, socketId: number) => ipcRenderer.invoke('qemu-hotplug-cpu', vmId, socketId),
      addMemory: (vmId: string, sizeBytes: number) => ipcRenderer.invoke('qemu-add-memory', vmId, sizeBytes),
      queryBlocks: (vmId: string) => ipcRenderer.invoke('qemu-query-blocks', vmId),
      createSnapshot: (vmId: string, driveId: string) => ipcRenderer.invoke('qemu-create-snapshot', vmId, driveId),
      checkKVM: () => ipcRenderer.invoke('qemu-check-kvm-availability'),
      getNetBackends: () => ipcRenderer.invoke('qemu-get-available-net-backends'),
      onQemuOutput: (callback: Callback) => {
        const handler = (_e: unknown, data: unknown) => callback(data);
        ipcRenderer.on('qemu-output', handler);
        return () => ipcRenderer.removeListener('qemu-output', handler);
      },
      listToolchains: () => ipcRenderer.invoke('qemu-toolchain-list'),
      ensureToolchain: (arch: string) => ipcRenderer.invoke('qemu-toolchain-ensure', arch),
      getProjectToolchains: (projectDir: string) => ipcRenderer.invoke('qemu-toolchain-project-config', projectDir),
    },
};

// Expose via contextBridge — this is the ONLY way to expose APIs when contextIsolation: true
contextBridge.exposeInMainWorld('api', api);