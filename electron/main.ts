// ─── State ──────────────────────────────────────────────────────
const electron = require('electron');
let { app, BrowserWindow, ipcMain, dialog } = electron;
const fs = require('fs');
const pathModule = require('path');
const { spawn } = require('child_process');

let mainWindow: any = null;
let llamaCppProcess: any = null;
let systemAIProcess: any = null;
let appDataPath: string = '';

// App data directory (configurable via --app-data-dir CLI arg)
const DATA_DIR = process.argv.find((a: string) => a.startsWith('--app-data-dir='))?.split('=')[1] || '';

function getPaths() {
  if (!appDataPath) {
    appDataPath = pathModule.join(DATA_DIR || (process.platform === 'win32' ? process.env.APPDATA : process.env.HOME + '/.openllmcode'), 'OpenLLMCode');
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
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function loadConfig(): Record<string, unknown> {
  const c = getPaths();
  try { return JSON.parse(fs.readFileSync(c.CONFIG_FILE, 'utf-8')); }
  catch { return {}; }
}
function saveConfig(cfg: Record<string, unknown>) {
  const c = getPaths();
  fs.writeFileSync(c.CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// ─── IPC Registration ──────────────────────────────────────────
function registerIpc() {
  ipcMain.handle('engine-get-config', () => loadConfig());
  ipcMain.handle('engine-set-config', (_e: any, cfg: Record<string, unknown>) => saveConfig({ ...loadConfig(), ...cfg }));
  ipcMain.handle('engine-detect-hardware', () => ({ os: process.platform }));

  ipcMain.handle('fs-read-file', async (_e: any, filePath: string) => {
    const c = getPaths();
    const fullPath = pathModule.join(pathModule.dirname(c.CONFIG_FILE), '..', 'project', filePath);
    try { return fs.readFileSync(fullPath, 'utf-8'); }
    catch (err: unknown) { return null; }
  });

  ipcMain.handle('fs-write-file', async (_e: any, filePath: string, content: string) => {
    const c = getPaths();
    const fullPath = pathModule.join(pathModule.dirname(c.CONFIG_FILE), '..', 'project', filePath);
    fs.writeFileSync(fullPath, content, 'utf-8');
    return true;
  });

  ipcMain.handle('exec-command', async (_e: any, command: string) => {
    if (process.platform === 'win32') {
      const proc = spawn('cmd.exe', ['/c', command], { env: process.env });
      let stdout = '', stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      return new Promise<string>((resolve, reject) => {
        proc.on('close', () => { if (stderr && !stdout) reject(new Error(stderr.trim())); else resolve(stdout.trim()); });
      });
    } else {
      const proc = spawn('/bin/sh', ['-c', command], { env: process.env });
      let stdout = '', stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      return new Promise<string>((resolve, reject) => {
        proc.on('close', () => { if (stderr && !stdout) reject(new Error(stderr.trim())); else resolve(stdout.trim()); });
      });
    }
  });

  ipcMain.handle('git-commit', async (_e: any, message: string) => {
    return new Promise<string>((resolve) => {
      const cmd = process.platform === 'win32'
        ? `cd "%APPDATA%\\OpenLLMCode" && git commit -m "${message}"`
        : `cd "$HOME/.openllmcode" && git commit -m "${message}"`;
      spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
            [process.platform === 'win32' ? '/c' : '-c', cmd],
            { env: process.env }).on('close', () => resolve('committed'));
    });
  });

  ipcMain.handle('chat-start', async (_e: any, payload: Record<string, string>) => {
    const c = getPaths();
    const modelPath = pathModule.join(c.MODELS_DIR, payload.model || 'ibm-grok4-1b.Q8_0.gguf');
    if (!fs.existsSync(modelPath)) return 'model-not-found';

    llamaCppProcess = spawn(
      process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      [process.platform === 'win32' ? '/c' : '-c', `llama-server --mlock -m "${modelPath}"`],
      { env: process.env }
    );
    llamaCppProcess.stdout.on('data', (d: any) => {});
    return 'started';
  });

  ipcMain.handle('chat-send-message', async (_e: any, message: string) => {
    if (!llamaCppProcess) return 'no-engine';
    try {
      llamaCppProcess.stdin.write(JSON.stringify({ type: 'message', text: message }) + '\n');
      return 'ok';
    } catch (err: unknown) { throw err; }
  });

  ipcMain.handle('chat-stop', () => { if (llamaCppProcess) llamaCppProcess.kill(); return true; });

  ipcMain.handle('systemai-start', async (_e: any, modelPath: string) => {
    if (systemAIProcess) systemAIProcess.kill();
    systemAIProcess = spawn(
      process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      [process.platform === 'win32' ? '/c' : '-c', `llama-server --mlock -m "${modelPath}"`],
      { env: process.env }
    );
    return true;
  });

  ipcMain.handle('systemai-send-message', async (_e: any, message: string) => {
    if (!systemAIProcess) return 'no-system-ai';
    try {
      systemAIProcess.stdin.write(JSON.stringify({ type: 'message', text: message }) + '\n');
      return 'ok';
    } catch (err: unknown) { throw err; }
  });

  ipcMain.handle('systemai-stop', () => { if (systemAIProcess) systemAIProcess.kill(); return true; });

  ipcMain.handle('dialog-select-folder', async (_e: any, parentWindow: any) => {
    const result = await dialog.showOpenDialog(parentWindow || mainWindow!, { properties: ['openDirectory'] });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('electron-store-get-config', () => loadConfig());
  ipcMain.handle('electron-store-set-config', (_e: any, key: string, value: unknown) => {
    const cfg = loadConfig();
    (cfg as any)[key] = value;
    saveConfig(cfg);
    return true;
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
      preload: pathModule.join(__dirname, 'preload.js'),
    },
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(pathModule.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

function startApp() {
  ensureDirs();
  registerIpc();
  createMainWindow();
}

// ─── App Lifecycle (top-level) ──────────────────────────────────────
app.whenReady().then(() => {
  // Re-import electron components to ensure they are available.
  const e = require('electron');
  ({ app, BrowserWindow, ipcMain, dialog } = e);
  startApp();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;