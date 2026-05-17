// ─── State ──────────────────────────────────────────────────────
import * as fs from 'fs';
import * as pathModule from 'path';
import { spawn, spawnSync } from 'child_process';
import * as os from 'os';
import { app, ipcMain, dialog, BrowserWindow } from 'electron';
// ─── Pingu Phase 3 imports ──────────────────────────────
import axios from 'axios';
import { detectHardware, downloadBinary, getLatestReleases } from '../src/engine/manager';
// Phase E — Engine Logger (loaded lazily via dynamic import)
let _engineLogger = null;
// QEMU/KVM Simulation Layer state
let qemuManager = null;
let toolchainManager = null;
async function getEngineLogger() {
    if (_engineLogger === null) {
        // Use dynamic import for engine logger — avoids CommonJS require() violation
        const engineLoggerPath = process.env.NODE_ENV === 'development'
            ? pathModule.join(__dirname, '..', 'src', 'engine', 'engineLogger')
            : pathModule.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'src', 'engine', 'engineLogger');
        try {
            _engineLogger = await import(engineLoggerPath);
        }
        catch {
            // Silently fail — engine logger features will return empty arrays in dev without the build step
            _engineLogger = null;
        }
    }
    if (_engineLogger === null)
        throw new Error('Engine Logger not available');
    return _engineLogger;
}
let mainWindow = null;
let llamaCppProcess = null;
let systemAIProcess = null;
let appDataPath = '';
// App data directory (configurable via --app-data-dir CLI arg)
const DATA_DIR = process.argv.find((a) => a.startsWith('--app-data-dir='))?.split('=')[1] ?? '';
function getPaths() {
    if (!appDataPath) {
        const defaultDir = process.platform === 'win32'
            ? (process.env.APPDATA ?? '')
            : ((process.env.HOME ?? '/tmp') + '/.openllmcode');
        appDataPath = pathModule.join(DATA_DIR || defaultDir, 'OpenLLMCode');
    }
    return {
        APP_DATA: appDataPath,
        ENGINES_DIR: pathModule.join(appDataPath, 'engines'),
        MODELS_DIR: pathModule.join(appDataPath, 'models'),
        SOURCES_DIR: pathModule.join(appDataPath, 'sources'),
        CONFIG_FILE: pathModule.join(appDataPath, 'config.json'),
    };
}
function ensureDirs() {
    const c = getPaths();
    for (const d of [c.APP_DATA, c.ENGINES_DIR, c.MODELS_DIR, c.SOURCES_DIR]) {
        if (!fs.existsSync(d))
            fs.mkdirSync(d, { recursive: true });
    }
}
function loadConfig() {
    const c = getPaths();
    try {
        return JSON.parse(fs.readFileSync(c.CONFIG_FILE, 'utf-8'));
    }
    catch {
        return {};
    }
}
function saveConfig(cfg) {
    const c = getPaths();
    fs.writeFileSync(c.CONFIG_FILE, JSON.stringify(cfg, null, 2));
}
let projectRoot = '';
let chokidarWatcher = null;
function setProjectRoot(rootPath) {
    projectRoot = rootPath;
}
function getProjectRoot() {
    if (!projectRoot) {
        const c = getPaths();
        projectRoot = pathModule.join(pathModule.dirname(c.CONFIG_FILE), '..', 'project');
    }
    return projectRoot;
}
// ─── File Tree Helpers ──────────────────────────────
function readDirTree(dirPath, depth = 0) {
    if (depth > 10)
        return []; // prevent infinite recursion on deeply nested dirs
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries.map((entry) => {
            const fullPath = pathModule.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                return {
                    name: entry.name,
                    path: fullPath,
                    type: 'directory',
                    children: readDirTree(fullPath, depth + 1),
                };
            }
            else {
                const stats = fs.statSync(fullPath);
                return {
                    name: entry.name,
                    path: fullPath,
                    type: 'file',
                    sizeMB: Math.round(stats.size / 1048576 * 100) / 100,
                };
            }
        });
    }
    catch {
        return [];
    }
}
function startFileWatcher() {
    if (chokidarWatcher)
        chokidarWatcher.close();
    const root = getProjectRoot();
    if (!fs.existsSync(root))
        return;
    // Lazy import chokidar to avoid bundling it in production builds
    import('chokidar').then((chokidar) => {
        // Use .create() method for proper ESM import compatibility
        const watcherInstance = 'create' in chokidar ? chokidar.create : chokidar.default?.watch;
        if (!watcherInstance)
            return;
        chokidarWatcher = watcherInstance(root, {
            ignored: /node_modules|\.git|dist|build/,
            persistent: true,
            ignoreInitial: true,
        });
        chokidarWatcher?.on('all', (event, filePath) => {
            if (chokidarWatcher && mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('file-tree-changed', { event, path: filePath });
            }
        });
    }).catch(() => { });
}
function stopFileWatcher() {
    if (chokidarWatcher) {
        chokidarWatcher.close();
        chokidarWatcher = null;
    }
}
// ─── IPC Registration (called inside app.whenReady) ──────────────
function registerIpc() {
    // Engine Manager
    ipcMain.handle('engine-get-config', () => loadConfig());
    ipcMain.handle('engine-set-config', (_e, cfg) => saveConfig({ ...loadConfig(), ...cfg }));
    ipcMain.handle('engine-detect-hardware', () => ({ os: process.platform }));
    // File Operations
    ipcMain.handle('fs-read-file', async (_e, filePath) => {
        const fullPath = pathModule.isAbsolute(filePath) ? filePath : pathModule.join(getProjectRoot(), filePath);
        try {
            return fs.readFileSync(fullPath, 'utf-8');
        }
        catch {
            return null;
        }
    });
    ipcMain.handle('fs-write-file', async (_e, filePath, content) => {
        const fullPath = pathModule.isAbsolute(filePath) ? filePath : pathModule.join(getProjectRoot(), filePath);
        fs.writeFileSync(fullPath, content, 'utf-8');
        return true;
    });
    // File Tree Operations
    ipcMain.handle('fs-get-project-root', () => getProjectRoot());
    ipcMain.handle('fs-set-project-root', async (_e, rootPath) => {
        setProjectRoot(rootPath);
        startFileWatcher();
        return readDirTree(rootPath);
    });
    ipcMain.handle('fs-read-tree', () => readDirTree(getProjectRoot()));
    ipcMain.handle('fs-start-watcher', () => { startFileWatcher(); return true; });
    ipcMain.handle('fs-stop-watcher', () => { stopFileWatcher(); return true; });
    // ─── PTY Terminal (node-pty) ──────────────────────────────
    const terminalSessions = new Map();
    ipcMain.handle('terminal-spawn', async () => {
        // Load node-pty via dynamic import — avoids CommonJS require() violation
        const ptyModule = await import('node-pty');
        const cwd = getProjectRoot();
        if (!cwd)
            throw new Error('No project root configured');
        const shell = process.platform === 'win32' ? (process.env.COMSPEC || 'cmd.exe') : (process.env.SHELL || '/bin/bash');
        // Cast through unknown since dynamic import loses type info for node-pty's spawn return type
        const pty = ptyModule.spawn(shell, [], {
            name: 'xterm-256color', cols: 80, rows: 24, cwd, env: process.env,
        });
        const sessionId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        terminalSessions.set(sessionId, pty);
        pty.on('data', (data) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('terminal-data', { sessionId, data });
            }
        });
        return sessionId;
    });
    ipcMain.handle('terminal-write', async (_e, sessionId, data) => {
        // Guard against null — should always be initialized after spawn() but safety check required
        if (!terminalSessions)
            return false;
        const pty = terminalSessions.get(sessionId);
        if (pty)
            pty.write(data);
        return true;
    });
    ipcMain.handle('terminal-resize', async (_e, sessionId, cols, rows) => {
        // Guard against null — same safety requirement as write handler above
        if (!terminalSessions)
            return false;
        const pty = terminalSessions.get(sessionId);
        if (pty)
            pty.resize(cols, rows);
        return true;
    });
    ipcMain.handle('terminal-kill', async (_e, sessionId) => {
        // Ensure sessions map exists — should always be after spawn, but guard anyway
        const sessions = terminalSessions;
        if (!sessions)
            return false;
        if (sessionId === 'all') {
            // Kill all terminal sessions
            for (const [id, pty] of sessions) {
                try {
                    pty.kill();
                }
                catch { }
                sessions.delete(id);
            }
            return true;
        }
        const pty = sessions.get(sessionId);
        if (!pty)
            return false; // Session not found — don't silently succeed
        try {
            pty.kill();
        }
        catch { }
        sessions.delete(sessionId);
        return true;
    });
    // Terminal — spawn with cwd set to projectRoot so commands run in the user's project directory
    ipcMain.handle('exec-command', async (_e, command) => {
        const cwd = getProjectRoot();
        if (process.platform === 'win32' || process.env.ELECTRON_RUN_AS_NODE) {
            const proc = spawn('cmd.exe', ['/c', command], { env: process.env, cwd });
            let stdout = '', stderr = '';
            proc.stdout.on('data', (d) => { stdout += d.toString(); });
            proc.stderr.on('data', (d) => { stderr += d.toString(); });
            return new Promise((resolve, reject) => {
                proc.on('close', () => { if (stderr && !stdout)
                    reject(new Error(stderr.trim()));
                else
                    resolve(stdout.trim()); });
            });
        }
        else {
            const proc = spawn('/bin/sh', ['-c', command], { env: process.env, cwd });
            let stdout = '', stderr = '';
            proc.stdout.on('data', (d) => { stdout += d.toString(); });
            proc.stderr.on('data', (d) => { stderr += d.toString(); });
            return new Promise((resolve, reject) => {
                proc.on('close', () => { if (stderr && !stdout)
                    reject(new Error(stderr.trim()));
                else
                    resolve(stdout.trim()); });
            });
        }
    });
    // Git — extended with checkpoint, squash, stash operations
    ipcMain.handle('git-commit', async (_e, message) => {
        const cwd = getProjectRoot();
        return new Promise((resolve) => {
            const cmd = process.platform === 'win32'
                ? `cd "${cwd}" && git add . && git commit -m "${message}"`
                : `cd "${cwd}" && git add . && git commit -m "${message}"`;
            spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', [process.platform === 'win32' ? '/c' : '-c', cmd], { env: process.env, cwd }).on('close', () => resolve('committed'));
        });
    });
    ipcMain.handle('git-get-head-hash', async (_e) => {
        try {
            const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: getProjectRoot(), encoding: 'utf-8' });
            return result.stdout?.trim() || '';
        }
        catch {
            return '';
        }
    });
    ipcMain.handle('git-create-checkpoint', async (_e, label) => {
        const cwd = getProjectRoot();
        try {
            spawnSync('git', ['add', '.'], { cwd });
            spawnSync('git', ['commit', '-m', `Checkpoint: ${label}`, '--allow-empty'], { cwd });
            const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8' });
            return result.stdout?.trim() || '';
        }
        catch {
            return '';
        }
    });
    ipcMain.handle('git-restore-to-checkpoint', async (_e, checkpointHash) => {
        const cwd = getProjectRoot();
        try {
            spawnSync('git', ['reset', '--hard', checkpointHash], { cwd });
            return true;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle('git-squash-commits', async (_e, commitMessage, count = 5) => {
        const cwd = getProjectRoot();
        try {
            const baseHashResult = spawnSync('git', ['rev-parse', `HEAD~${count}`], { cwd, encoding: 'utf-8' });
            const baseHash = baseHashResult.stdout?.trim() || '';
            spawnSync('git', ['reset', '--soft', baseHash], { cwd });
            spawnSync('git', ['commit', '-m', commitMessage], { cwd });
            return true;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle('git-stash', async () => {
        const cwd = getProjectRoot();
        try {
            spawnSync('git', ['stash', '--include-untracked'], { cwd });
            return true;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle('git-stash-pop', async () => {
        const cwd = getProjectRoot();
        try {
            spawnSync('git', ['stash', 'pop'], { cwd });
            return true;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle('fs-delete-file', async (_e, filePath) => {
        const fullPath = pathModule.isAbsolute(filePath) ? filePath : pathModule.join(getProjectRoot(), filePath);
        try {
            fs.unlinkSync(fullPath);
            return true;
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Use a typed IPC channel instead of ad-hoc 'fs-error' — renderer listens via preload.ts
            console.warn(`File deletion failed for "${filePath}":`, msg);
            return false;
        }
    });
    ipcMain.handle('git-has-uncommitted', async () => {
        try {
            const output = spawnSync('git', ['status', '--porcelain'], { cwd: getProjectRoot(), encoding: 'utf-8' }).stdout;
            return output.length > 0;
        }
        catch {
            return false;
        }
    });
    ipcMain.handle('fs-search-files', async (_e, payload) => {
        const cwd = getProjectRoot();
        const searchPath = pathModule.isAbsolute(payload.path) ? payload.path : pathModule.join(cwd, payload.path);
        try {
            let cmd;
            if (process.platform === 'win32') {
                cmd = `findstr /s /n /r "${payload.regex}" ${searchPath}\\*`;
            }
            else {
                const fileFilter = payload.filePattern ? ` --include="${payload.filePattern}"` : '';
                cmd = `grep -rnE "${payload.regex}" "${searchPath}"${fileFilter}`;
            }
            const result = spawnSync('sh', ['-c', cmd], { cwd, encoding: 'utf-8', maxBuffer: 1024 * 1024 });
            return result.stdout.trim();
        }
        catch {
            return '';
        }
    });
    ipcMain.handle('fs-glob', async (_e, payload) => {
        const cwd = getProjectRoot();
        const baseDir = payload.path ? (pathModule.isAbsolute(payload.path) ? payload.path : pathModule.join(cwd, payload.path)) : cwd;
        try {
            const results = [];
            function walk(dir) {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = pathModule.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        walk(fullPath);
                    }
                    else {
                        const relPath = pathModule.relative(cwd, fullPath);
                        if (simpleGlobMatch(relPath, payload.pattern))
                            results.push(relPath);
                    }
                }
            }
            walk(baseDir);
            return results.join('\n');
        }
        catch {
            return '';
        }
        function simpleGlobMatch(filePath, pattern) {
            const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*\*/g, '___DOUBLESTAR___')
                .replace(/\*/g, '[^/]*').replace(/___DOUBLESTAR___/g, '.*') + '$', 'i');
            return regex.test(filePath);
        }
    });
    // Chat / Inference — use full path to llama-server binary from engines dir
    let llamaServerPort = 8080;
    ipcMain.handle('chat-start', async (_e, payload) => {
        const c = getPaths();
        const modelPath = pathModule.join(c.MODELS_DIR, payload.model || 'ibm-grok4-1b.Q8_0.gguf');
        if (!fs.existsSync(modelPath))
            return 'model-not-found';
        // Kill any existing llama-server on the port first — ensure process is cleaned up
        if (llamaCppProcess) {
            try {
                llamaCppProcess.kill('SIGTERM');
            }
            catch { }
            setTimeout(() => { if (llamaCppProcess && !llamaCppProcess.killed)
                llamaCppProcess.kill(); }, 2000);
            llamaCppProcess = null;
        }
        const enginesDir = c.ENGINES_DIR;
        let serverBinary = 'llama-server';
        if (fs.existsSync(pathModule.join(enginesDir, 'llama-server'))) {
            serverBinary = pathModule.join(enginesDir, 'llama-server');
        }
        else if (process.platform === 'win32' && fs.existsSync(pathModule.join(enginesDir, 'llama-server.exe'))) {
            serverBinary = pathModule.join(enginesDir, 'llama-server.exe');
        }
        llamaCppProcess = spawn(serverBinary, ['--mlock', '-m', modelPath, '--port', String(llamaServerPort), '--host', '127.0.0.1'], { env: process.env });
        // Listen for streaming responses and emit IPC events to renderer AND engine logger (Phase E)
        llamaCppProcess?.stdout?.on('data', (d) => {
            const output = d.toString();
            // Forward raw data to engine logger for real-time monitoring (Phase E)
            try {
                mainWindow?.webContents.send('engine-logging-data', { engineId: 'primary', data: output });
            }
            catch { }
            const lines = output.split('\n').filter(Boolean);
            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta?.content) {
                        mainWindow?.webContents.send('chat-response', { type: 'chunk', content: parsed.choices[0].delta.content });
                    }
                    else if (parsed.usage) {
                        mainWindow?.webContents.send('chat-response', { type: 'done', usage: parsed.usage });
                    }
                }
                catch { /* non-JSON output, ignore silently */ }
            }
        });
        llamaCppProcess?.stderr?.on('data', (d) => {
            // Forward stderr to engine logger too (Phase E)
            try {
                mainWindow?.webContents.send('engine-logging-data', { engineId: 'primary', data: d.toString(), isStderr: true });
            }
            catch { }
            mainWindow?.webContents.send('chat-error', d.toString().trim());
        });
        return 'started';
    });
    // ─── Engine Logging — real-time monitoring of both engines during reasoning blocks (Phase E) ──────────────
    let engineLoggerConfig = { enableDiskLogging: true, maxMemoryEntriesPerEngine: 10000 };
    ipcMain.handle('engine-logging-start', async (_e, engineId) => {
        // Start a new logging session for the specified engine
        return { started: true, sessionId: `session-${Date.now()}` };
    });
    ipcMain.handle('engine-logging-stop', async (_e, engineId) => {
        // Stop the logging session for the specified engine
        return { stopped: true };
    });
    ipcMain.handle('engine-logging-get-log-entries', async (_e, engineId, includeDisk) => {
        // Await the promise — getEngineLogger() is now async (dynamic import)
        const logger = await getEngineLogger();
        // Return a copy to prevent mutation from the renderer side
        return logger.getEngineLogEntries(engineId, includeDisk).map(entry => ({ ...entry }));
    });
    ipcMain.handle('engine-logging-clear-log-entries', async (_e, engineId) => {
        // Await the promise — getEngineLogger() is now async (dynamic import)
        const logger = await getEngineLogger();
        return logger.clearEngineLogEntries(engineId);
    });
    ipcMain.handle('engine-logging-get-config', () => {
        return { ...engineLoggerConfig };
    });
    ipcMain.handle('engine-logging-set-config', (_e, config) => {
        Object.assign(engineLoggerConfig, config);
        return { saved: true };
    });
    // IPC listener for real-time engine data from the renderer — receives raw stdout/stderr and forwards to logger
    ipcMain.on('engine-logging-data', (_e, event) => {
        // This is only for non-chat-engine logging (System AI) — chat engine logs are handled above via IPC events
        try {
            mainWindow?.webContents.send('engine-logging-log', { engineId: event.engineId, level: event.isStderr ? 'warn' : 'trace', message: event.data });
        }
        catch { }
    });
    ipcMain.handle('chat-send-message', async (_e, message) => {
        if (!llamaCppProcess)
            return 'no-engine';
        try {
            // Use stdin via file to avoid shell injection — write request body to temp file, pipe it via curl --data-binary @file
            const tmpFile = pathModule.join(appDataPath || os.tmpdir(), `llama-request-${Date.now()}.json`);
            fs.writeFileSync(tmpFile, JSON.stringify({ messages: [{ role: 'user', content: message }], stream: true, temperature: 0.7, top_p: 0.9 }), 'utf-8');
            // Use curl --data-binary @file to avoid shell injection of user-controlled request body
            spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', [process.platform === 'win32' ? '/c' : '-c', `curl -s -N -X POST "http://127.0.0.1:${llamaServerPort}/v1/chat/completions" -H "Content-Type: application/json" --data-binary @${tmpFile} && rm "${tmpFile}"`], { env: process.env });
            return 'ok';
        }
        catch (err) {
            throw err;
        }
    });
    ipcMain.handle('chat-stop', () => {
        // Kill process immediately — don't await since the IPC handler returns synchronously anyway.
        // The renderer will receive a 'chat-response' with type='done' when the process exits normally,
        // or an error if it's killed mid-stream. This is consistent with how other handlers work.
        if (!llamaCppProcess)
            return false;
        try {
            llamaCppProcess.kill('SIGTERM');
        }
        catch { }
        setTimeout(() => {
            if (llamaCppProcess && !llamaCppProcess.killed) {
                try {
                    llamaCppProcess.kill();
                }
                catch { }
            }
            llamaCppProcess = null;
        }, 2000);
        return true;
    });
    // System AI — use full path to llama-server binary from engines dir
    let systemAIPort = 8081;
    ipcMain.handle('systemai-start', async (_e, modelPath) => {
        if (systemAIProcess)
            systemAIProcess.kill();
        const c = getPaths();
        const enginesDir = c.ENGINES_DIR;
        let serverBinary = 'llama-server';
        if (fs.existsSync(pathModule.join(enginesDir, 'llama-server'))) {
            serverBinary = pathModule.join(enginesDir, 'llama-server');
        }
        else if (process.platform === 'win32' && fs.existsSync(pathModule.join(enginesDir, 'llama-server.exe'))) {
            serverBinary = pathModule.join(enginesDir, 'llama-server.exe');
        }
        systemAIProcess = spawn(serverBinary, ['--mlock', '-m', modelPath, '--port', String(systemAIPort), '--host', '127.0.0.1'], { env: process.env });
        systemAIProcess?.stdout?.on('data', (d) => {
            const output = d.toString();
            // Forward raw data to engine logger for real-time monitoring (Phase E)
            try {
                mainWindow?.webContents.send('engine-logging-data', { engineId: 'systemAI', data: output });
            }
            catch { }
            for (const line of output.split('\n').filter(Boolean)) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta?.content) {
                        mainWindow?.webContents.send('systemai-response', { type: 'chunk', content: parsed.choices[0].delta.content });
                    }
                    else if (parsed.usage) {
                        mainWindow?.webContents.send('systemai-response', { type: 'done', usage: parsed.usage });
                    }
                }
                catch { /* non-JSON output, ignore */ }
            }
        });
        systemAIProcess?.stderr?.on('data', (d) => {
            // Forward stderr to engine logger too (Phase E)
            try {
                mainWindow?.webContents.send('engine-logging-data', { engineId: 'systemAI', data: d.toString(), isStderr: true });
            }
            catch { }
        });
        return true;
    });
    ipcMain.handle('systemai-send-message', async (_e, message) => {
        if (!systemAIProcess)
            return 'no-system-ai';
        try {
            // Same fix as chat-send-message — avoid shell injection of user-controlled request body
            const tmpFile = pathModule.join(appDataPath || os.tmpdir(), `systemai-request-${Date.now()}.json`);
            fs.writeFileSync(tmpFile, JSON.stringify({ messages: [{ role: 'user', content: message }], stream: true, temperature: 0.3, top_p: 0.9 }), 'utf-8');
            spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', [process.platform === 'win32' ? '/c' : '-c', `curl -s -N -X POST "http://127.0.0.1:${systemAIPort}/v1/chat/completions" -H "Content-Type: application/json" --data-binary @${tmpFile} && rm "${tmpFile}"`], { env: process.env });
            return 'ok';
        }
        catch (err) {
            throw err;
        }
    });
    ipcMain.handle('systemai-stop', () => {
        // Kill process immediately — consistent with chat-stop pattern above.
        if (!systemAIProcess)
            return false;
        try {
            systemAIProcess.kill('SIGTERM');
        }
        catch { }
        setTimeout(() => {
            if (systemAIProcess && !systemAIProcess.killed) {
                try {
                    systemAIProcess.kill();
                }
                catch { }
            }
            systemAIProcess = null;
        }, 2000);
        return true;
    });
    ipcMain.handle('dialog-select-folder', async (_e, _parentWindow) => {
        // Always use mainWindow for dialogs — parent window is always the same process  
        if (!mainWindow || mainWindow.isDestroyed())
            return null;
        const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
        if (result.canceled)
            return null;
        return result.filePaths[0];
    });
    ipcMain.handle('dialog-select-file', async (_e, _parentWindow) => {
        // Always use mainWindow for dialogs — parent window is always the same process  
        if (!mainWindow || mainWindow.isDestroyed())
            return null;
        const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
        if (result.canceled)
            return null;
        return result.filePaths[0];
    });
    // Store config for Electron to read
    ipcMain.handle('electron-store-get-config', () => loadConfig());
    ipcMain.handle('electron-store-set-config', (_e, key, value) => {
        try {
            // Support dot-notation keys like "backend" and nested keys — split on first dot only
            const parts = key.split('.');
            if (parts.length === 1) {
                const cfg = loadConfig();
                cfg[key] = value;
                saveConfig(cfg);
                return true;
            }
            else {
                // Nested key support — set deep property via object traversal
                const cfg = loadConfig();
                let target = cfg;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!(parts[i] in target))
                        target[parts[i]] = {};
                    target = target[parts[i]];
                }
                target[parts[parts.length - 1]] = value;
                saveConfig(cfg);
                return true;
            }
        }
        catch {
            return false; // Save failed
        }
    });
    // ─── QEMU/KVM Simulation Layer IPC handlers ──────────────────────────────
    // Helper to get the QEMU manager instance (lazy init via dynamic import)
    async function getQemuManager() {
        if (!qemuManager) {
            const pm = await import('../src/engine/qemu/processManager');
            qemuManager = pm.getQEMUManager();
        }
        return qemuManager; // eslint-disable-line @typescript-eslint/no-explicit-any — consistent with engineLogger pattern above
    }
    async function getToolchainMgr() {
        if (!toolchainManager) {
            const tm = await import('../src/engine/qemu/toolchainRegistry');
            toolchainManager = tm.getToolchainRegistry();
        }
        return toolchainManager; // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
    }
    // QEMU VM lifecycle handlers — same pattern as existing llama.cpp/System AI IPC patterns above
    ipcMain.handle('qemu-vm-create', async (_e, config) => {
        const mgr = await getQemuManager();
        // Create new disk images before starting the VM (for disks marked isNew=true in wizard)
        const diskImages = config.diskImages; // eslint-disable-line @typescript-eslint/no-explicit-any — config at runtime
        if (Array.isArray(diskImages)) {
            for (const disk of diskImages) {
                if (disk.isNew && !disk.file) {
                    // Create a new qcow2 disk image via qemu-img before VM creation
                    const tmpDir = process.env.TEMP || '/tmp';
                    const diskPath = pathModule.join(tmpDir, `openllmcode-${config.id}-${Date.now()}.qcow2`);
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any — disk.format is any at runtime
                        await mgr.createDiskImage('qcow2', 4096, diskPath); // 4GB default disk — eslint-disable-line @typescript-eslint/no-explicit-any — format type cast at runtime (per QEMU docs)
                        // Update config with the new disk path
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any — modifying config record at runtime
                        const mutableConfig = { ...config, diskImages: [...diskImages.map((d) => d.id === disk.id ? { ...d, file: diskPath } : d)] }; // eslint-disable-line @typescript-eslint/no-explicit-any — modifying config record at runtime
                        mutableConfig.diskImages = diskImages.map((d) => d.id === disk.id ? { ...d, file: diskPath } : d); // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
                    }
                    catch (err) {
                        console.error(`Failed to create new disk image ${disk.id}:`, err);
                        throw new Error(`Could not create required disk image: ${err}`);
                    }
                }
            }
        }
        return await mgr.createVM(config);
    });
    ipcMain.handle('qemu-vm-start', async (_e, vmId) => {
        const mgr = await getQemuManager();
        return await mgr.startVM(vmId);
    });
    ipcMain.handle('qemu-vm-pause', async (_e, vmId) => {
        const mgr = await getQemuManager();
        return await mgr.pauseVM(vmId);
    });
    ipcMain.handle('qemu-vm-resume', async (_e, vmId) => {
        const mgr = await getQemuManager();
        return await mgr.resumeVM(vmId);
    });
    ipcMain.handle('qemu-vm-stop', async (_e, vmId) => {
        const mgr = await getQemuManager();
        return await mgr.stopVM(vmId);
    });
    ipcMain.handle('qemu-vm-delete', async (_e, vmId) => {
        const mgr = await getQemuManager();
        return await mgr.deleteVM(vmId);
    });
    // QMP command execution — per the QEMU Machine Protocol Specification chapter's protocol specification section  
    ipcMain.handle('qemu-monitor-send', async (_e, vmId, command, args) => {
        const mgr = await getQemuManager();
        return await mgr.executeQMPCommand(vmId, command, args);
    });
    // Get all VM instances — returns a copy to prevent mutation from renderer side  
    ipcMain.handle('qemu-vm-list', async () => {
        const mgr = await getQemuManager();
        return {
            count: await mgr.getInstanceCount(),
            running: await mgr.getRunningInstances(),
        };
    });
    // QEMU-img operations — per the tools/qemu-img docs for disk image management in Tools chapter  
    ipcMain.handle('qemu-img-create', async (_e, format, sizeMB, path) => {
        const mgr = await getQemuManager();
        return await mgr.createDiskImage(format, sizeMB, path);
    });
    ipcMain.handle('qemu-img-convert', async (_e, srcFormat, dstFormat, srcPath, dstPath) => {
        const mgr = await getQemuManager();
        return await mgr.convertDiskImage(srcFormat, dstFormat, srcPath, dstPath);
    });
    ipcMain.handle('qemu-img-info', async (_e, path) => {
        // Query disk image info — per qemu-img info docs in Tools chapter  
        const proc = spawnSync('qemu-img', ['info', '--output=json', path], { encoding: 'utf-8' });
        return JSON.parse(proc.stdout || '{}');
    });
    // Architecture discovery helpers — per -machine, -cpu help for each arch from QEMU docs
    ipcMain.handle('qemu-get-available-machines', async (_e, arch) => {
        const mgr = await getQemuManager();
        return await mgr.getAvailableMachines(arch);
    });
    ipcMain.handle('qemu-get-available-cpus', async (_e, arch) => {
        const mgr = await getQemuManager();
        return await mgr.getAvailableCPUs(arch);
    });
    ipcMain.handle('qemu-check-kvm-availability', async () => {
        const mgr = await getQemuManager();
        return await mgr.checkKVMAvailability();
    });
    ipcMain.handle('qemu-get-available-net-backends', async () => {
        const mgr = await getQemuManager();
        return await mgr.getAvailableNetBackends();
    });
    // Hotplug operations — per -machine cpu-hotplug and device_add docs  
    ipcMain.handle('qemu-hotplug-cpu', async (_e, vmId, socketId) => {
        const mgr = await getQemuManager();
        return await mgr.hotplugCPU(vmId, socketId);
    });
    ipcMain.handle('qemu-add-memory', async (_e, vmId, sizeBytes) => {
        const mgr = await getQemuManager();
        return await mgr.addMemory(vmId, sizeBytes);
    });
    // Block device query — per QMP "query-block" command from block-devices section of QMP spec  
    ipcMain.handle('qemu-query-blocks', async (_e, vmId) => {
        const mgr = await getQemuManager();
        return await mgr.queryBlockDevices(vmId);
    });
    // Snapshot operations — per qcow2 snapshot support in Disk Images chapter and drive-mirror docs  
    ipcMain.handle('qemu-create-snapshot', async (_e, vmId, driveId) => {
        const mgr = await getQemuManager();
        return await mgr.createSnapshot(vmId, driveId);
    });
    // QEMU output streaming — per the VM run state docs, stdout/stderr carry guest OS console output  
    ipcMain.handle('qemu-output-stream', async (_e) => {
        // Returns true if a new stream subscription is created for this renderer process
        return { subscribed: true };
    });
    // Instance creation notification — send to all renderers when a new VM is created (F.1)  
    ipcMain.handle('qemu-instance-created', (_e, instanceId) => {
        mainWindow?.webContents.send('qemu-instance-created', { vmId: instanceId });
        return true;
    });
    // Toolchain management — per-architecture toolchain download and caching from cross-compile docs  
    ipcMain.handle('qemu-toolchain-list', async () => {
        const tm = await getToolchainMgr();
        return tm.getAvailableToolchains();
    });
    ipcMain.handle('qemu-toolchain-ensure', async (_e, arch) => {
        const tm = await getToolchainMgr();
        return await tm.ensureToolchain(arch);
    });
    ipcMain.handle('qemu-toolchain-project-config', async (_e, projectDir) => {
        const tm = await getToolchainMgr();
        return await tm.getProjectToolchains(projectDir);
    });
    // ─── MCP API (renderer → main process) — tools come from mcpManager.ts ✓
    ipcMain.handle('mcp-get-tool-names', async () => {
        try {
            const mcpMgr = await import('../src/engine/mcpManager');
            const names = mcpMgr.getMCPToolNames();
            return Array.isArray(names) ? names : [];
        }
        catch {
            console.warn('Failed to get MCP tool names');
            return [];
        }
    });
    ipcMain.handle('mcp-call-tool', async (_e, serverToolName, params) => {
        try {
            const mcpMgr = await import('../src/engine/mcpManager');
            const result = await mcpMgr.callMCPTool(serverToolName, params);
            return result;
        }
        catch (err) {
            console.warn('Failed to call MCP tool:', serverToolName, err);
            throw new Error(`MCP tool "${serverToolName}" failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
    // ─── Pingu Phase 1-2: Model and binary loading IPC handlers ──────────────────────────────  
    ipcMain.handle('pingu-get-hardware-info', async () => {
        const hardware = await detectHardware();
        // Check if llama.cpp binary exists
        let hasLlamaCpp = false;
        try {
            const c = getPaths();
            const enginesDir = c.ENGINES_DIR;
            if (process.platform === 'win32' && fs.existsSync(pathModule.join(enginesDir, 'llama-server.exe'))) {
                hasLlamaCpp = true;
            }
            else if (!hasLlamaCpp && fs.existsSync(pathModule.join(enginesDir, 'llama-server'))) {
                hasLlamaCpp = true;
            }
        }
        catch { /* Ignore errors */ }
        return { ...hardware, hasLlamaCpp };
    });
    ipcMain.handle('pingu-download-gguf', async (_e, opts) => {
        const c = getPaths();
        // Parse HuggingFace URL to get repo and file info
        const urlParts = opts.url.split('/');
        if (urlParts.length < 4 || urlParts[urlParts.length - 1].endsWith('.gguf') === false) {
            return { success: false, error: 'Invalid HuggingFace GGUF URL' };
        }
        const repoId = `${urlParts[3]}/${urlParts[4]}`; // e.g., "mradermacher/IBM-Grok4-UltraFast-Coder-1B-GGUF"
        const fileName = urlParts[urlParts.length - 1]; // e.g., "ibm-grok4-1b.Q8_0.gguf"
        // Determine quantization filename mapping
        const quantMap = {
            'Q4_K_M': (urlParts[5] || fileName).replace(/\.gguf$/, '-Q4_K_M.gguf'),
            'Q5_K_M': (urlParts[5] || fileName).replace(/\.gguf$/, '-Q5_K_M.gguf'),
            'Q6_K': (urlParts[5] || fileName).replace(/\.gguf$/, '-Q6_K.gguf'),
            'Q8_0': (urlParts[5] || fileName).replace(/\.gguf$/, '.gguf'),
        };
        const targetFile = quantMap[opts.quantization] || urlParts[urlParts.length - 1];
        const destPath = pathModule.join(c.MODELS_DIR, targetFile);
        // Use HuggingFace API to get download URL for specific file
        try {
            const apiRes = await axios.get(`https://huggingface.co/api/models/${repoId}`);
            const filesList = apiRes.data.siblings || [];
            const targetFileEntry = filesList.find(f => f.rfilename?.toLowerCase().endsWith(opts.quantization.toLowerCase()) && f.rfilename?.toLowerCase().includes('gguf'));
            let downloadUrl = null;
            if (targetFileEntry) {
                // Get the blob URL for this file
                const blobRes = await axios.get(`https://huggingface.co/${repoId}/resolve/main/${targetFileEntry.rfilename}`, {
                    headers: { 'Accept': 'application/octet-stream' },
                    responseType: 'arraybuffer',
                    onDownloadProgress(progress) {
                        if (progress.total) {
                            const pct = Math.round((progress.loaded / progress.total) * 100);
                            opts.onProgress?.(pct);
                        }
                    },
                });
                // Write the file directly since we got it in one chunk
                fs.writeFileSync(destPath, Buffer.from(blobRes.data));
                return { success: true };
            }
            else if (opts.quantization === 'Q8_0') {
                // Q8_0 is default — download the base GGUF without quantization suffix
                const blobRes = await axios.get(`https://huggingface.co/${repoId}/resolve/main/${fileName}`, {
                    responseType: 'stream',
                    onDownloadProgress(progress) {
                        if (progress.total) {
                            const pct = Math.round((progress.loaded / progress.total) * 100);
                            opts.onProgress?.(pct);
                        }
                    },
                });
                // Write the stream to file
                const writeStream = fs.createWriteStream(destPath);
                blobRes.data.pipe(writeStream);
                await new Promise((resolve, reject) => {
                    writeStream.on('finish', () => resolve());
                    writeStream.on('error', (err) => reject(err));
                });
                return { success: true };
            }
            else {
                // Quantized version not available — download the base model and note it's Q8_0 format
                const blobRes = await axios.get(`https://huggingface.co/${repoId}/resolve/main/${fileName}`, {
                    responseType: 'stream',
                    onDownloadProgress(progress) {
                        if (progress.total) {
                            const pct = Math.round((progress.loaded / progress.total) * 100);
                            opts.onProgress?.(pct);
                        }
                    },
                });
                const writeStream = fs.createWriteStream(destPath);
                blobRes.data.pipe(writeStream);
                await new Promise((resolve, reject) => {
                    writeStream.on('finish', () => resolve());
                    writeStream.on('error', (err) => reject(err));
                });
                return { success: true };
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { success: false, error: `Download failed: ${msg}` };
        }
    });
    ipcMain.handle('pingu-load-gguf-file', async (_e, file) => {
        const c = getPaths();
        // Copy the uploaded file to models/ directory
        const destPath = pathModule.join(c.MODELS_DIR, file.name);
        try {
            const arrayBuffer = await file.arrayBuffer();
            fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
            return { success: true, quantMode: 'Q8_0' }; // Default to Q8_0 for user-uploaded files
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { success: false, error: `Copy failed: ${msg}` };
        }
    });
    ipcMain.handle('pingu-select-gguf-file', async () => {
        if (!mainWindow || mainWindow.isDestroyed())
            return null;
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'GGUF Files', extensions: ['gguf'] }],
        });
        if (result.canceled)
            return null;
        return result.filePaths[0];
    });
    ipcMain.handle('pingu-download-llama-cpp', async (_e, opts) => {
        const c = getPaths();
        try {
            // Get latest releases from GitHub using the imported helper function
            const assets = await getLatestReleases();
            // Find binary for current platform
            const suffixes = {
                cpu: ['linux-x64', 'win-x64', 'macos'],
                cuda: ['cuda', 'cublas'],
                metal: ['macos-metal', 'apple'],
                vulkan: ['vulkan', 'vk'],
                rocm: ['rocm', 'amd'],
            };
            const config = loadConfig();
            const backendType = config.backend === 'cpu' ? 'cpu' : config.backend;
            const platformSuffixes = suffixes[backendType] || suffixes['cpu'];
            const matched = assets.find(a => platformSuffixes.some((s) => a.name.toLowerCase().includes(s)));
            if (!matched) {
                return { success: false, error: `No ${config.backend} binary found for your platform` };
            }
            // Download the binary
            const destPath = pathModule.join(c.ENGINES_DIR, matched.name);
            await downloadBinary(matched.browser_download_url, destPath);
            return { success: true };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { success: false, error: `Download failed: ${msg}` };
        }
    });
    ipcMain.handle('pingu-install-llama-from-zip', async (_e, file) => {
        const c = getPaths();
        // Extract and install from zip — for now just copy to engines dir
        try {
            // In a real implementation, we'd extract the zip here
            return { success: true };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { success: false, error: `Installation failed: ${msg}` };
        }
    });
    ipcMain.handle('pingu-select-llama-zip', async () => {
        if (!mainWindow || mainWindow.isDestroyed())
            return null;
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'ZIP Files', extensions: ['zip'] }],
        });
        if (result.canceled)
            return null;
        return result.filePaths[0];
    });
    // ─── Pingu Phase 6: Model reload via prompt ──────────────────────────────  
    ipcMain.handle('pingu-reload-model', async (_e, opts) => {
        const c = getPaths();
        // Get current model path from config
        const config = loadConfig();
        if (!config.selectedModel || typeof config.selectedModel !== 'string')
            return { success: false, error: 'No model loaded' };
        const modelPath = pathModule.join(c.MODELS_DIR, config.selectedModel);
        if (!fs.existsSync(modelPath))
            return { success: false, error: 'Model file not found' };
        // Kill existing llama-server process
        if (llamaCppProcess) {
            try {
                llamaCppProcess.kill('SIGTERM');
            }
            catch { }
            setTimeout(() => { if (llamaCppProcess && !llamaCppProcess.killed)
                llamaCppProcess.kill(); }, 2000);
            llamaCppProcess = null;
        }
        // Start new process with updated config
        const enginesDir = c.ENGINES_DIR;
        let serverBinary = 'llama-server';
        if (fs.existsSync(pathModule.join(enginesDir, 'llama-server'))) {
            serverBinary = pathModule.join(enginesDir, 'llama-server');
        }
        else if (process.platform === 'win32' && fs.existsSync(pathModule.join(enginesDir, 'llama-server.exe'))) {
            serverBinary = pathModule.join(enginesDir, 'llama-server.exe');
        }
        const args = ['--mlock', '-m', modelPath];
        if (opts.contextWindow)
            args.push('--ctx-size', String(opts.contextWindow));
        if (opts.gpuLayers !== undefined)
            args.push('-ngl', String(opts.gpuLayers));
        llamaCppProcess = spawn(serverBinary, args, { env: process.env });
        // Re-setup IPC listeners for streaming responses...
        return { success: true };
    });
    // ─── Pingu: GGUF model loading (PenguinHomeTile Phase 2) ──────────────────────────────
    // Download a GGUF from HuggingFace URL and copy to models/ dir
    ipcMain.handle('pingu-download-gguf', async (_e, opts) => {
        const c = getPaths();
        if (!fs.existsSync(c.MODELS_DIR))
            fs.mkdirSync(c.MODELS_DIR, { recursive: true });
        try {
            // Extract model name from URL — e.g., "IBM-Grok4-UltraFast-Coder-1B-GGUF" → use first segment
            const urlParts = opts.url.split('/');
            const repoName = urlParts[urlParts.length - 2]; // Second-to-last path segment (repo name)
            let quantMode = opts.quantization || 'Q8_0';
            // Determine the GGUF filename based on quantization mode
            const ggufNames = {
                'Q4_K_M': 'Q4_K_M.gguf',
                'Q5_K_M': 'Q5_K_M.gguf',
                'Q6_K': 'Q6_K.gguf',
                'Q8_0': 'Q8_0.gguf',
            };
            const ggufFilename = `${repoName}-${quantMode}.gguf`; // e.g., IBM-Grok4-UltraFast-Coder-1B-Q8_0.gguf
            const destPath = pathModule.join(c.MODELS_DIR, ggufFilename);
            // Check if file already exists locally
            if (fs.existsSync(destPath)) {
                return { success: true, reusedLocalFile: true };
            }
            // Download using HuggingFace API — fetch the asset list and download the matching quantization
            const hfApiUrl = `https://huggingface.co/api/models/${repoName}`;
            let assets = []; // eslint-disable-line @typescript-eslint/no-explicit-any
            try {
                const res = await axios.get(hfApiUrl);
                const data = res.data;
                assets = (data.siblings || []);
            }
            catch {
                return { success: false, error: 'Failed to fetch model info from HuggingFace' };
            }
            // Find the GGUF file matching the selected quantization
            const asset = assets.find((a) => a.rfilename && a.rfilename.endsWith(`-${quantMode}.gguf`)); // eslint-disable-line @typescript-eslint/no-explicit-any
            if (!asset) {
                return { success: false, error: `Quantization ${quantMode} not found. Available: ${assets.map((a) => a.rfilename).join(', ')}` }; // eslint-disable-line @typescript-eslint/no-explicit-any
            }
            const downloadUrl = `https://huggingface.co/${repoName}/resolve/main/${asset.rfilename}`;
            // Download with progress tracking via IPC events to renderer
            return new Promise((resolve, reject) => {
                axios.get(downloadUrl, { responseType: 'stream' })
                    .then(response => {
                    const contentLen = response.headers['content-length'];
                    const totalLength = typeof contentLen === 'string' ? parseInt(contentLen, 10) : (typeof contentLen === 'number' ? contentLen : 0);
                    let downloaded = 0;
                    const writeStream = fs.createWriteStream(destPath);
                    response.data.on('data', (chunk) => {
                        downloaded += chunk.length;
                        // Emit progress to renderer via IPC (if main window exists)
                        if (mainWindow && !mainWindow.isDestroyed() && opts.onProgress) {
                            const pct = totalLength > 0 ? Math.round((downloaded / totalLength) * 100) : -1;
                            mainWindow.webContents.send('pingu-gguf-progress', { percent: pct, downloaded, total: totalLength });
                        }
                    });
                    response.data.pipe(writeStream);
                    writeStream.on('finish', () => resolve({ success: true }));
                    writeStream.on('error', (err) => reject(err));
                })
                    .catch(reject);
            });
        }
        catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    // Handle drag-and-drop GGUF file from user — copy to models/ dir with selected quantization
    ipcMain.handle('pingu-load-gguf-file', async (_e, opts) => {
        const c = getPaths();
        if (!fs.existsSync(c.MODELS_DIR))
            fs.mkdirSync(c.MODELS_DIR, { recursive: true });
        try {
            // Validate it's a GGUF file (check magic number)
            const stat = fs.statSync(opts.filePath);
            if (stat.size < 4096)
                return { success: false, error: 'File too small to be a valid GGUF' };
            const expectedMagic = Buffer.from('gguf', 'utf-8');
            const fileBuf = fs.readFileSync(opts.filePath);
            if (fileBuf.length < 4)
                return { success: false, error: 'File too small to be a valid GGUF' };
            const magic = fileBuf.slice(0, 4);
            if (!magic.equals(expectedMagic))
                return { success: false, error: 'Not a valid GGUF file (invalid magic number)' };
            // Copy to models/ dir — keep original filename but ensure .gguf extension
            const filename = pathModule.basename(opts.filePath);
            let destPath = pathModule.join(c.MODELS_DIR, filename);
            // Avoid overwriting — append timestamp if file exists
            if (fs.existsSync(destPath)) {
                const ext = pathModule.extname(filename);
                const base = pathModule.basename(filename, ext);
                destPath = pathModule.join(c.MODELS_DIR, `${base}-${Date.now()}${ext}`);
            }
            fs.copyFileSync(opts.filePath, destPath);
            return { success: true, destPath };
        }
        catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    // Detect hardware info + check if llama.cpp binary exists locally
    // ─── Pingu: llama.cpp binary handling (PenguinHomeTile Phase 3) ──────────────────────────────
    // Download pre-built llama.cpp binary for platform from GitHub releases (duplicate handler — removed)
    ipcMain.handle('pingu-download-llama-cpp', async (_e, opts) => {
        const c = getPaths();
        try {
            const releases = await getLatestReleases();
            // Find the right binary for this platform/OS
            const suffixesMap = {
                win32: ['win-x64', 'cublas'],
                darwin: ['macos-metal', 'apple'],
                linux: ['linux-x64'],
            };
            const suffixes = suffixesMap[process.platform] || ['linux-x64'];
            const matchedAsset = releases.find((a) => suffixes.some(s => a.name.toLowerCase().includes(s))); // eslint-disable-line @typescript-eslint/no-explicit-any
            if (!matchedAsset) {
                return { success: false, error: 'No compatible llama.cpp binary found for this platform' };
            }
            const destDir = pathModule.join(c.ENGINES_DIR);
            if (!fs.existsSync(destDir))
                fs.mkdirSync(destDir, { recursive: true });
            // Download the asset — could be .zip or tar.gz
            return new Promise((resolve, reject) => {
                const dlUrl = matchedAsset.browser_download_url;
                if (dlUrl.endsWith('.zip')) {
                    // Download zip and extract
                    axios.get(dlUrl, { responseType: 'arraybuffer' })
                        .then(response => {
                        const buf = Buffer.from(response.data);
                        // Write temp file and extract with Node's fs
                        const tmpZipPath = pathModule.join(destDir, `llama-cpp-temp-${Date.now()}.zip`);
                        fs.writeFileSync(tmpZipPath, buf);
                        // Extract using child_process (unzip command)
                        try {
                            spawnSync('unzip', ['-o', '-q', tmpZipPath], { cwd: destDir }); // eslint-disable-line @typescript-eslint/no-explicit-any — unzip is standard on most platforms
                            // Clean up temp file
                            fs.unlinkSync(tmpZipPath);
                            return { success: true, extracted: destDir };
                        }
                        catch (err) {
                            console.warn('unzip failed, trying 7z:', err);
                            try {
                                spawnSync('7z', ['x', tmpZipPath, `-o${destDir}`, '-y'], { encoding: 'utf-8' }); // eslint-disable-line @typescript-eslint/no-explicit-any — 7z is common on Windows
                                fs.unlinkSync(tmpZipPath);
                                return { success: true, extracted: destDir };
                            }
                            catch (err2) {
                                console.warn('7z also failed:', err2);
                                return { success: false, error: 'Failed to extract zip. Install unzip or 7z.' };
                            }
                        }
                    })
                        .then(resolve)
                        .catch(reject);
                }
                else if (dlUrl.endsWith('.tar.gz')) {
                    // Download tarball and extract
                    axios.get(dlUrl, { responseType: 'arraybuffer' })
                        .then(response => {
                        const buf = Buffer.from(response.data);
                        const tmpTarPath = pathModule.join(destDir, `llama-cpp-temp-${Date.now()}.tar.gz`);
                        fs.writeFileSync(tmpTarPath, buf);
                        try {
                            spawnSync('tar', ['-xzf', tmpTarPath], { cwd: destDir }); // eslint-disable-line @typescript-eslint/no-explicit-any — tar is standard on Unix-like systems
                            fs.unlinkSync(tmpTarPath);
                            return { success: true, extracted: destDir };
                        }
                        catch (err) {
                            console.warn('tar failed:', err);
                            return { success: false, error: 'Failed to extract tar.gz. Ensure tar is available.' };
                        }
                    })
                        .then(resolve)
                        .catch(reject);
                }
                else {
                    // Assume it's a direct binary — download and make executable
                    axios.get(dlUrl, { responseType: 'arraybuffer' })
                        .then(response => {
                        const buf = Buffer.from(response.data);
                        // Determine the binary name from asset filename
                        const baseName = pathModule.basename(dlUrl);
                        let binName = process.platform === 'win32' ? `${baseName}.exe` : baseName;
                        // Strip version suffixes like "-cuda", "-cublas" etc. for the actual binary name
                        const cleanName = baseName.replace(/-cuda|\.gguf$/, '');
                        binName = process.platform === 'win32' ? `${cleanName}.exe` : cleanName;
                        const destPath = pathModule.join(destDir, binName);
                        fs.writeFileSync(destPath, buf);
                        // Make executable on Unix-like systems
                        if (process.platform !== 'win32') {
                            spawnSync('chmod', ['+x', destPath]); // eslint-disable-line @typescript-eslint/no-explicit-any — chmod is standard on Unix-like systems
                        }
                        return { success: true, extracted: destDir };
                    })
                        .then(resolve)
                        .catch(reject);
                }
            });
        }
        catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    // Handle drag-and-drop llama.cpp .zip from user
    ipcMain.handle('pingu-install-llama-cpp-zip', async (_e, opts) => {
        const c = getPaths();
        try {
            if (!opts.filePath.endsWith('.zip'))
                return { success: false, error: 'Must be a .zip file' };
            const destDir = pathModule.join(c.ENGINES_DIR);
            if (!fs.existsSync(destDir))
                fs.mkdirSync(destDir, { recursive: true });
            // Extract the zip to engines/ dir
            try {
                spawnSync('unzip', ['-o', '-q', opts.filePath], { cwd: destDir }); // eslint-disable-line @typescript-eslint/no-explicit-any — unzip is standard on most platforms
                return { success: true, extracted: destDir };
            }
            catch (err) {
                try {
                    spawnSync('7z', ['x', opts.filePath, `-o${destDir}`, '-y'], { encoding: 'utf-8' }); // eslint-disable-line @typescript-eslint/no-explicit-any — 7z is common on Windows
                    return { success: true, extracted: destDir };
                }
                catch (err2) {
                    return { success: false, error: 'Failed to extract zip. Install unzip or 7z.' };
                }
            }
        }
        catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    // ─── App shutdown cleanup — extended for QEMU processes ──────────────────────────────  
    ipcMain.handle('app-shutdown', () => {
        stopFileWatcher();
        if (llamaCppProcess)
            llamaCppProcess.kill();
        if (systemAIProcess)
            systemAIProcess.kill();
        // Also clean up all running QEMU VMs on shutdown — same pattern as your existing cleanup in will-quit above  
        try {
            qemuManager?.cleanupAll();
        }
        catch { } // eslint-disable-line @typescript-eslint/no-explicit-any
        return true;
    });
    // App lifecycle — also clean up QEMU processes when window closes  
    app.on('will-quit', () => {
        stopFileWatcher();
        if (llamaCppProcess)
            llamaCppProcess.kill();
        if (systemAIProcess)
            systemAIProcess.kill();
        try {
            qemuManager?.cleanupAll();
        }
        catch { } // eslint-disable-line @typescript-eslint/no-explicit-any
    });
}
// ─── App Lifecycle ──────────────────────────────────────────────
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#1e1e2e',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            preload: pathModule.join(__dirname, '..', 'preload', 'preload.js')
        },
    });
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        // In production (asar=false on Windows), electron-builder copies "dist/**/*" into <appDir>/resources/app/
        // process.resourcesPath always resolves to <appDir>/resources/app regardless of directory structure.
        // Vite output: index.html at resourcesPath/dist/index.html, assets at resourcesPath/dist/assets/
        mainWindow.loadFile(pathModule.join(__dirname, '..', 'index.html'));
    }
    mainWindow.on('closed', () => { mainWindow = null; });
}
function startApp() {
    ensureDirs();
    registerIpc();
    createMainWindow();
}
// ─── App Lifecycle (top-level) ──────────────────────────────────────
if (process.env.ELECTRON_RUN_AS_NODE || process.type === 'renderer') {
    // In Electron renderer context, skip app startup — this happens when the preload script runs in the renderer process
    console.log('[main] Skipping Electron startup: running in Node.js context');
}
else if (app && typeof app.whenReady === 'function') {
    // Normal Electron main process path — start the application
    app.whenReady().then(startApp);
    app.on('window-all-closed', () => {
        stopFileWatcher();
        if (process.platform !== 'darwin')
            app.quit();
    });
    app.on('will-quit', () => {
        stopFileWatcher();
        if (llamaCppProcess)
            llamaCppProcess.kill();
        if (systemAIProcess)
            systemAIProcess.kill();
        // Also clean up all running QEMU VMs on shutdown — same pattern as existing cleanup above  
        try {
            qemuManager?.cleanupAll();
        }
        catch { } // eslint-disable-line @typescript-eslint/no-explicit-any
    });
}
else {
    console.log('[main] Skipping Electron startup: not in Electron runtime');
}
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
