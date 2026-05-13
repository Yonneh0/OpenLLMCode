// ─── State ──────────────────────────────────────────────────────
const electron = require('electron');
const { app, BrowserWindow, ipcMain, dialog } = electron;
const fs = require('fs');
const pathModule = require('path');
const { spawn } = require('child_process');
let mainWindow = null;
let llamaCppProcess = null;
let systemAIProcess = null;
let appDataPath = '';
// App data directory (configurable via --app-data-dir CLI arg)
const DATA_DIR = process.argv.find((a) => a.startsWith('--app-data-dir='))?.split('=')[1] || '';
function initPaths() {
    if (!appDataPath) {
        appDataPath = pathModule.join(DATA_DIR || app.getPath('appData'), 'OpenLLMCode');
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
    const c = initPaths();
    for (const d of [c.APP_DATA, c.ENGINES_DIR, c.MODELS_DIR, c.SOURCES_DIR]) {
        if (!fs.existsSync(d))
            fs.mkdirSync(d, { recursive: true });
    }
}
function loadConfig() {
    const c = initPaths();
    try {
        return JSON.parse(fs.readFileSync(c.CONFIG_FILE, 'utf-8'));
    }
    catch {
        return {};
    }
}
function saveConfig(cfg) {
    const c = initPaths();
    fs.writeFileSync(c.CONFIG_FILE, JSON.stringify(cfg, null, 2));
}
// ─── IPC: Engine Manager ────────────────────────────────────────
ipcMain.handle('engine-get-config', () => loadConfig());
ipcMain.handle('engine-set-config', (_e, cfg) => saveConfig({ ...loadConfig(), ...cfg }));
ipcMain.handle('engine-detect-hardware', () => {
    return { os: process.platform }; // 'win32' | 'darwin' | 'linux'
});
// ─── IPC: File Operations ────────────────────────────────────────
ipcMain.handle('fs-read-file', async (_e, filePath) => {
    const c = initPaths();
    const fullPath = pathModule.join(pathModule.dirname(c.CONFIG_FILE), '..', 'project', filePath);
    try {
        return fs.readFileSync(fullPath, 'utf-8');
    }
    catch (err) {
        return null;
    }
});
ipcMain.handle('fs-write-file', async (_e, filePath, content) => {
    const c = initPaths();
    const fullPath = pathModule.join(pathModule.dirname(c.CONFIG_FILE), '..', 'project', filePath);
    fs.writeFileSync(fullPath, content, 'utf-8');
    return true;
});
// ─── IPC: Terminal Command Execution ─────────────────────────────
ipcMain.handle('exec-command', async (_e, command) => {
    if (process.platform === 'win32') {
        return new Promise((resolve, reject) => {
            const proc = spawn('cmd.exe', ['/c', command], { env: process.env });
            let stdout = '', stderr = '';
            proc.stdout.on('data', (d) => { stdout += d.toString(); });
            proc.stderr.on('data', (d) => { stderr += d.toString(); });
            proc.on('close', () => { if (stderr && !stdout)
                reject(new Error(stderr.trim()));
            else
                resolve(stdout.trim()); });
        });
    }
    else {
        return new Promise((resolve, reject) => {
            const proc = spawn('/bin/sh', ['-c', command], { env: process.env });
            let stdout = '', stderr = '';
            proc.stdout.on('data', (d) => { stdout += d.toString(); });
            proc.stderr.on('data', (d) => { stderr += d.toString(); });
            proc.on('close', () => { if (stderr && !stdout)
                reject(new Error(stderr.trim()));
            else
                resolve(stdout.trim()); });
        });
    }
});
// ─── IPC: Git Operations ────────────────────────────────────────
ipcMain.handle('git-commit', async (_e, message) => {
    return new Promise((resolve) => {
        const cmd = process.platform === 'win32'
            ? `cd "%APPDATA%\\OpenLLMCode" && git commit -m "${message}"`
            : `cd "$HOME/.openllmcode" && git commit -m "${message}"`;
        spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', [process.platform === 'win32' ? '/c' : '-c', cmd], { env: process.env }).on('close', () => resolve('committed'));
    });
});
// ─── IPC: Chat / Inference (placeholder — llama-server starts separately) ──────────────────────
ipcMain.handle('chat-start', async (_e, payload) => {
    const c = initPaths();
    const modelPath = pathModule.join(c.MODELS_DIR, payload.model || 'ibm-grok4-1b.Q8_0.gguf');
    if (!fs.existsSync(modelPath))
        return 'model-not-found';
    llamaCppProcess = spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', [process.platform === 'win32' ? '/c' : '-c', `llama-server --mlock -m "${modelPath}"`], { env: process.env });
    llamaCppProcess.stdout.on('data', (d) => { });
    return 'started';
});
ipcMain.handle('chat-send-message', async (_e, message) => {
    if (!llamaCppProcess)
        return 'no-engine';
    try {
        llamaCppProcess.stdin.write(JSON.stringify({ type: 'message', text: message }) + '\n');
        return 'ok';
    }
    catch (err) {
        throw err;
    }
});
ipcMain.handle('chat-stop', () => { if (llamaCppProcess)
    llamaCppProcess.kill(); return true; });
// ─── IPC: System AI ──────────────────────────────────────────────
ipcMain.handle('systemai-start', async (_e, modelPath) => {
    if (systemAIProcess)
        systemAIProcess.kill();
    systemAIProcess = spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', [process.platform === 'win32' ? '/c' : '-c', `llama-server --mlock -m "${modelPath}"`], { env: process.env });
    return true;
});
ipcMain.handle('systemai-send-message', async (_e, message) => {
    if (!systemAIProcess)
        return 'no-system-ai';
    try {
        systemAIProcess.stdin.write(JSON.stringify({ type: 'message', text: message }) + '\n');
        return 'ok';
    }
    catch (err) {
        throw err;
    }
});
ipcMain.handle('systemai-stop', () => { if (systemAIProcess)
    systemAIProcess.kill(); return true; });
// ─── IPC: Dialogs ────────────────────────────────────────────────
ipcMain.handle('dialog-select-folder', async (_e, parentWindow) => {
    const result = await dialog.showOpenDialog(parentWindow || mainWindow, { properties: ['openDirectory'] });
    if (result.canceled)
        return null;
    return result.filePaths[0];
});
// ─── IPC: Electron Store (placeholder for future use) ──────────────
ipcMain.handle('electron-store-get-config', () => loadConfig());
ipcMain.handle('electron-store-set-config', (_e, key, value) => {
    const cfg = loadConfig();
    cfg[key] = value;
    saveConfig(cfg);
    return true;
});
// ─── App Lifecycle ──────────────────────────────────────────────
app.whenReady().then(() => {
    ensureDirs();
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#1e1e2e',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            preload: pathModule.join(__dirname, 'preload.js'),
        },
    });
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(pathModule.join(__dirname, '..', 'dist', 'index.html'));
    }
    mainWindow.on('closed', () => { mainWindow = null; });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin')
    app.quit(); });
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
