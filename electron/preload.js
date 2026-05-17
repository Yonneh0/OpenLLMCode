// Preload script — exposes window.api for React components
// With contextIsolation: false, this runs in the same context as the renderer (no isolated world)
import { ipcRenderer } from 'electron';
// With contextIsolation: false, use direct window assignment instead of contextBridge
window.api = {
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
        getProjectRoot: () => ipcRenderer.invoke('fs-get-project-root'),
        setProjectRoot: (rootPath) => ipcRenderer.invoke('fs-set-project-root', rootPath),
        readTree: () => ipcRenderer.invoke('fs-read-tree'),
        startWatcher: () => ipcRenderer.invoke('fs-start-watcher'),
        stopWatcher: () => ipcRenderer.invoke('fs-stop-watcher'),
        onFileTreeChanged: (callback) => {
            const handler = (_e, data) => callback(data);
            ipcRenderer.on('file-tree-changed', handler);
            return () => ipcRenderer.removeListener('file-tree-changed', handler);
        },
        // File search & glob, deletion
        deleteFile: (filePath) => ipcRenderer.invoke('fs-delete-file', filePath),
        searchFiles: (payload) => ipcRenderer.invoke('fs-search-files', payload),
        glob: (payload) => ipcRenderer.invoke('fs-glob', payload),
        // File tree operations via IPC (for agent tools)
        searchFilesIPC: async (searchPath, regex, filePattern) => {
            const result = await ipcRenderer.invoke('fs-search-files', { path: searchPath, regex, filePattern });
            return result || '';
        },
        globIPC: async (pattern, baseDir) => {
            const result = await ipcRenderer.invoke('fs-glob', { pattern, path: baseDir });
            return result || '';
        },
    },
    // Terminal — PTY-based streaming terminal + legacy execCommand
    terminal: {
        spawn: () => ipcRenderer.invoke('terminal-spawn'),
        write: (sessionId, data) => ipcRenderer.invoke('terminal-write', sessionId, data),
        resize: (sessionId, cols, rows) => ipcRenderer.invoke('terminal-resize', sessionId, cols, rows),
        kill: (sessionId) => ipcRenderer.invoke('terminal-kill', sessionId),
        onData: (callback) => {
            const handler = (_e, data) => callback(data);
            ipcRenderer.on('terminal-data', handler);
            return () => ipcRenderer.removeListener('terminal-data', handler);
        },
    },
    execCommand: (command) => ipcRenderer.invoke('exec-command', command),
    // Git — extended with checkpoint, squash, stash operations
    git: {
        commit: (message) => ipcRenderer.invoke('git-commit', message),
        getHeadHash: () => ipcRenderer.invoke('git-get-head-hash'),
        createCheckpoint: (label) => ipcRenderer.invoke('git-create-checkpoint', label),
        restoreToCheckpoint: (checkpointHash) => ipcRenderer.invoke('git-restore-to-checkpoint', checkpointHash),
        squashCommits: (commitMessage, count = 5) => ipcRenderer.invoke('git-squash-commits', commitMessage, count),
        stash: () => ipcRenderer.invoke('git-stash'),
        stashPop: () => ipcRenderer.invoke('git-stash-pop'),
        hasUncommitted: () => ipcRenderer.invoke('git-has-uncommitted'),
    },
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
        stop: () => ipcRenderer.invoke('systemai-stop'),
    },
    // Dialogs
    dialog: {
        selectFolder: (parentWindow) => ipcRenderer.invoke('dialog-select-folder', parentWindow),
        selectFile: (parentWindow) => ipcRenderer.invoke('dialog-select-file', parentWindow),
    },
    // Store config for Electron to read
    electronStore: {
        getConfig: () => ipcRenderer.invoke('electron-store-get-config'),
        setConfig: (key, value) => ipcRenderer.invoke('electron-store-set-config', key, value),
    },
    // Approval events (main → renderer notifications)
    approval: {
        onApprovalRequest: (callback) => {
            const handler = (_e, data) => callback(data);
            ipcRenderer.on('approval-request', handler);
            return () => ipcRenderer.removeListener('approval-request', handler);
        },
    },
    // Engine logging (real-time monitoring of both engines during reasoning blocks)
    engineLogging: {
        start: (engineId) => ipcRenderer.invoke('engine-logging-start', engineId),
        stop: (engineId) => ipcRenderer.invoke('engine-logging-stop', engineId),
        getLogEntries: (engineId, includeDisk = false) => ipcRenderer.invoke('engine-logging-get-log-entries', engineId, includeDisk),
        clearLogEntries: (engineId) => ipcRenderer.invoke('engine-logging-clear-log-entries', engineId),
        getConfig: () => ipcRenderer.invoke('engine-logging-get-config'),
        setConfig: (config) => ipcRenderer.invoke('engine-logging-set-config', config),
        onEngineData: (callback) => {
            const handler = (_e, data) => callback(data);
            ipcRenderer.on('engine-logging-data', handler);
            return () => ipcRenderer.removeListener('engine-logging-data', handler);
        },
        onLogEntry: (callback) => {
            const handler = (_e, entry) => callback(entry);
            ipcRenderer.on('engine-logging-log', handler);
            return () => ipcRenderer.removeListener('engine-logging-log', handler);
        },
    },
    // App shutdown cleanup
    appShutdown: () => ipcRenderer.invoke('app-shutdown'),
    // ─── MCP API (renderer → main process) ──────────────────────────────
    mcp: {
        getToolNames: () => ipcRenderer.invoke('mcp-get-tool-names'),
        callTool: (toolName, params) => ipcRenderer.invoke('mcp-call-tool', toolName, params || {}),
    },
    // ─── Pingu Phase 1-2: Model and binary loading IPC handlers ──────────────────────────────  
    pingu: {
        downloadGguf: (opts) => ipcRenderer.invoke('pingu-download-gguf', opts).then((r) => ({ success: r.success, error: r.error })),
        loadGgufFromFile: (filePath, quantMode) => ipcRenderer.invoke('pingu-load-gguf-file', { filePath, quantization: quantMode })
            .then((r) => ({ success: r.success, destPath: r.destPath || undefined, error: r.error })),
        selectGgufFile: () => ipcRenderer.invoke('pingu-select-gguf-file'),
        downloadLlamaCpp: () => ipcRenderer.invoke('pingu-download-llama-cpp').then((r) => ({ success: r.success, extracted: r.extracted, error: r.error })),
        installLlamaCppFromZip: (filePath) => ipcRenderer.invoke('pingu-install-llama-cpp-zip', { filePath })
            .then((r) => ({ success: r.success, extracted: r.extracted, error: r.error })),
        selectLlamaCppZip: () => ipcRenderer.invoke('pingu-select-llama-zip'),
        getHardwareInfo: () => ipcRenderer.invoke('pingu-get-hardware-info'),
    },
    // ─── Pingu Phase 4: Inference statistics listener (GGUF progress) ──────────────────────────────  
    onGgufProgress: (callback) => {
        const handler = (_e, data) => callback(data);
        ipcRenderer.on('pingu-gguf-progress', handler);
        return () => ipcRenderer.removeListener('pingu-gguf-progress', handler);
    },
    // ─── Pingu Phase 6: Model reload via prompt ──────────────────────────────  
    reloadModel: (opts) => ipcRenderer.invoke('pingu-reload-model', opts),
    // ─── QEMU/KVM Simulation Layer API ──────────────────────────────  
    qemu: {
        // VM lifecycle — per QMP commands from vm-run-state and monitor sections of QMP spec  
        create: (config) => ipcRenderer.invoke('qemu-vm-create', config),
        start: (vmId) => ipcRenderer.invoke('qemu-vm-start', vmId),
        pause: (vmId) => ipcRenderer.invoke('qemu-vm-pause', vmId),
        resume: (vmId) => ipcRenderer.invoke('qemu-vm-resume', vmId),
        stop: (vmId) => ipcRenderer.invoke('qemu-vm-stop', vmId),
        delete: (vmId) => ipcRenderer.invoke('qemu-vm-delete', vmId),
        // QMP command execution — per the QEMU Machine Protocol Specification chapter's protocol specification section  
        monitorSend: (vmId, command, args) => ipcRenderer.invoke('qemu-monitor-send', vmId, command, args || {}),
        // Get all VM instances — returns copy to prevent mutation from renderer side  
        listInstances: () => ipcRenderer.invoke('qemu-vm-list'),
        // QEMU-img operations — per the tools/qemu-img docs for disk image management in Tools chapter  
        createDiskImage: (format, sizeMB, path) => ipcRenderer.invoke('qemu-img-create', format, sizeMB, path),
        convertDiskImage: (srcFormat, dstFormat, srcPath, dstPath) => ipcRenderer.invoke('qemu-img-convert', srcFormat, dstFormat, srcPath, dstPath),
        getDiskInfo: (path) => ipcRenderer.invoke('qemu-img-info', path),
        // Architecture discovery helpers — per -machine, -cpu help for each arch from QEMU docs  
        getAvailableMachines: (arch) => ipcRenderer.invoke('qemu-get-available-machines', arch),
        getAvailableCPUs: (arch) => ipcRenderer.invoke('qemu-get-available-cpus', arch),
        // Hotplug operations — per -machine cpu-hotplug and device_add docs  
        hotplugCPU: (vmId, socketId) => ipcRenderer.invoke('qemu-hotplug-cpu', vmId, socketId),
        addMemory: (vmId, sizeBytes) => ipcRenderer.invoke('qemu-add-memory', vmId, sizeBytes),
        // Block device query — per QMP "query-block" command from block-devices section of QMP spec  
        queryBlocks: (vmId) => ipcRenderer.invoke('qemu-query-blocks', vmId),
        // Snapshot operations — per qcow2 snapshot support in Disk Images chapter and drive-mirror docs  
        createSnapshot: (vmId, driveId) => ipcRenderer.invoke('qemu-create-snapshot', vmId, driveId),
        // KVM availability check — per kernel-irqchip and -enable-kvm docs (per /dev/kvm check in QEMU docs)
        checkKVM: () => ipcRenderer.invoke('qemu-check-kvm-availability'),
        // Get available network backends — per -netdev help docs in Network Devices chapter  
        getNetBackends: () => ipcRenderer.invoke('qemu-get-available-net-backends'),
        // Output stream subscription — per the VM run state docs, stdout/stderr carry guest OS console output
        onQemuOutput: (callback) => {
            const handler = (_e, data) => callback(data);
            ipcRenderer.on('qemu-output', handler);
            return () => ipcRenderer.removeListener('qemu-output', handler);
        },
        // Toolchain management — per-architecture toolchain download and caching from cross-compile docs  
        listToolchains: () => ipcRenderer.invoke('qemu-toolchain-list'),
        ensureToolchain: (arch) => ipcRenderer.invoke('qemu-toolchain-ensure', arch),
        getProjectToolchains: (projectDir) => ipcRenderer.invoke('qemu-toolchain-project-config', projectDir),
    },
};
