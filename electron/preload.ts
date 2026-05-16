// Preload script — exposes window.api for React components
import { contextBridge, ipcRenderer } from 'electron';

export interface AppConfig { backend?: string; binarySource?: string; selectedModel?: string; systemAIModel?: string; hfToken?: string; }

// ─── Exported types for renderer use ──────────────────────────────
export type Callback = (msg: unknown) => void;

// ─── API interface namespace — used by Window.api in the global declaration below ──────────────────────────────
export interface Api {
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
  appShutdown: () => Promise<void>;
}

// QEMU/KVM Simulation Layer API types — mirrors the IPC handler signatures in preload.ts  
export interface QemuAPI {
  // VM lifecycle operations
  create: (config: Record<string, unknown>) => Promise<unknown>;
  start: (vmId: string) => Promise<void>;
  pause: (vmId: string) => Promise<void>;
  resume: (vmId: string) => Promise<void>;
  stop: (vmId: string) => Promise<void>;
  delete: (vmId: string) => Promise<void>;

  // QMP command execution — per the QEMU Machine Protocol Specification chapter  
  monitorSend: (vmId: string, command: string, args?: Record<string, unknown>) => Promise<unknown>;

  // VM listing and disk operations
  listInstances: () => Promise<{ count: number; running: unknown[] }>;
  createDiskImage: (format: string, sizeMB: number, path: string) => Promise<void>;
  convertDiskImage: (srcFormat: string, dstFormat: string, srcPath: string, dstPath: string) => Promise<void>;
  getDiskInfo: (path: string) => Promise<unknown>;

  // Architecture discovery
  getAvailableMachines: (arch: string) => Promise<unknown[]>;
  getAvailableCPUs: (arch: string) => Promise<string[]>;

  // Hotplug operations — per -machine cpu-hotplug and device_add docs  
  hotplugCPU: (vmId: string, socketId: number) => Promise<void>;
  addMemory: (vmId: string, sizeBytes: number) => Promise<void>;

  // Block device query — per QMP "query-block" command  
  queryBlocks: (vmId: string) => Promise<unknown>;

  // Snapshot operations — per qcow2 snapshot support in Disk Images chapter
  createSnapshot: (vmId: string, driveId: string) => Promise<string>;

  // KVM availability check
  checkKVM: () => Promise<boolean>;

  // Get available network backends — per -netdev help docs  
  getNetBackends: () => Promise<string[]>;

  // Output stream subscription
  onQemuOutput: (callback: (data: unknown) => void) => () => void;

  // Toolchain management — per-architecture toolchain download and caching from cross-compile docs  
  listToolchains: () => Promise<unknown[]>;
  ensureToolchain: (arch: string) => Promise<unknown>;
  getProjectToolchains: (projectDir: string) => Promise<Record<string, unknown>>;
}

// ─── Global window.api augmentation — Api + optional QEMU namespace ──────────────────────────────
declare global {
  interface Window {
    api: Api & { qemu?: QemuAPI };
  }
}

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

    // File search & glob, deletion
    deleteFile: (filePath: string) => ipcRenderer.invoke('fs-delete-file', filePath),
    searchFiles: (payload: { path: string; regex: string; filePattern?: string }) =>
      ipcRenderer.invoke('fs-search-files', payload),
    glob: (payload: { pattern: string; path?: string }) =>
      ipcRenderer.invoke('fs-glob', payload),

    // File tree operations via IPC (for agent tools)
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
  execCommand: (command: string) => ipcRenderer.invoke('exec-command', command),

  // Git — extended with checkpoint, squash, stash operations
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
    selectFile: (parentWindow?: any) => ipcRenderer.invoke('dialog-select-file', parentWindow),
  },

  // Store config for Electron to read
  electronStore: {
    getConfig: () => ipcRenderer.invoke('electron-store-get-config'),
    setConfig: (key: string, value: unknown) => ipcRenderer.invoke('electron-store-set-config', key, value),
  },

  // Approval events (main → renderer notifications)
  approval: {
    onApprovalRequest: (callback: Callback) => {
      const handler = (_e: unknown, data: unknown) => callback(data);
      ipcRenderer.on('approval-request', handler);
      return () => ipcRenderer.removeListener('approval-request', handler);
    },
  },

  // Engine logging (real-time monitoring of both engines during reasoning blocks)
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

  // App shutdown cleanup
  appShutdown: () => ipcRenderer.invoke('app-shutdown'),

  // ─── QEMU/KVM Simulation Layer API ──────────────────────────────  
  qemu: {
    // VM lifecycle — per QMP commands from vm-run-state and monitor sections of QMP spec  
    create: (config: Record<string, unknown>) => ipcRenderer.invoke('qemu-vm-create', config),
    start: (vmId: string) => ipcRenderer.invoke('qemu-vm-start', vmId),
    pause: (vmId: string) => ipcRenderer.invoke('qemu-vm-pause', vmId),
    resume: (vmId: string) => ipcRenderer.invoke('qemu-vm-resume', vmId),
    stop: (vmId: string) => ipcRenderer.invoke('qemu-vm-stop', vmId),
    delete: (vmId: string) => ipcRenderer.invoke('qemu-vm-delete', vmId),

    // QMP command execution — per the QEMU Machine Protocol Specification chapter's protocol specification section  
    monitorSend: (vmId: string, command: string, args?: Record<string, unknown>) => 
      ipcRenderer.invoke('qemu-monitor-send', vmId, command, args || {}),

    // Get all VM instances — returns copy to prevent mutation from renderer side  
    listInstances: () => ipcRenderer.invoke('qemu-vm-list'),

    // QEMU-img operations — per the tools/qemu-img docs for disk image management in Tools chapter  
    createDiskImage: (format: string, sizeMB: number, path: string) => 
      ipcRenderer.invoke('qemu-img-create', format, sizeMB, path),
    convertDiskImage: (srcFormat: string, dstFormat: string, srcPath: string, dstPath: string) => 
      ipcRenderer.invoke('qemu-img-convert', srcFormat, dstFormat, srcPath, dstPath),
    getDiskInfo: (path: string) => ipcRenderer.invoke('qemu-img-info', path),

    // Architecture discovery helpers — per -machine, -cpu help for each arch from QEMU docs  
    getAvailableMachines: (arch: string) => ipcRenderer.invoke('qemu-get-available-machines', arch),
    getAvailableCPUs: (arch: string) => ipcRenderer.invoke('qemu-get-available-cpus', arch),

    // Hotplug operations — per -machine cpu-hotplug and device_add docs  
    hotplugCPU: (vmId: string, socketId: number) => ipcRenderer.invoke('qemu-hotplug-cpu', vmId, socketId),
    addMemory: (vmId: string, sizeBytes: number) => ipcRenderer.invoke('qemu-add-memory', vmId, sizeBytes),

    // Block device query — per QMP "query-block" command from block-devices section of QMP spec  
    queryBlocks: (vmId: string) => ipcRenderer.invoke('qemu-query-blocks', vmId),

    // Snapshot operations — per qcow2 snapshot support in Disk Images chapter and drive-mirror docs  
    createSnapshot: (vmId: string, driveId: string) => ipcRenderer.invoke('qemu-create-snapshot', vmId, driveId),

    // KVM availability check — per kernel-irqchip and -enable-kvm docs (per /dev/kvm check in QEMU docs)
    checkKVM: () => ipcRenderer.invoke('qemu-check-kvm-availability'),

    // Get available network backends — per -netdev help docs in Network Devices chapter  
    getNetBackends: () => ipcRenderer.invoke('qemu-get-available-net-backends'),

    // Output stream subscription — per the VM run state docs, stdout/stderr carry guest OS console output
    onQemuOutput: (callback: Callback) => {
      const handler = (_e: unknown, data: unknown) => callback(data);
      ipcRenderer.on('qemu-output', handler);
      return () => ipcRenderer.removeListener('qemu-output', handler);
    },

    // Toolchain management — per-architecture toolchain download and caching from cross-compile docs  
    listToolchains: () => ipcRenderer.invoke('qemu-toolchain-list'),
    ensureToolchain: (arch: string) => ipcRenderer.invoke('qemu-toolchain-ensure', arch),
    getProjectToolchains: (projectDir: string) => ipcRenderer.invoke('qemu-toolchain-project-config', projectDir),
  },
});
