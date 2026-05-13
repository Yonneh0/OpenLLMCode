import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

// ─── State ──────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let llamaCppProcess: ChildProcess | null = null;
let systemAIProcess: ChildProcess | null = null;

// App data directory (configurable via --app-data-dir CLI arg)
const DATA_DIR = process.argv.find((a) => a.startsWith('--app-data-dir='))?.split('=')[1] || '';
const APP_DATA = path.join(DATA_DIR || app.getPath('appData'), 'OpenLLMCode');

const ENGINES_DIR = path.join(APP_DATA, 'engines');
const MODELS_DIR  = path.join(APP_DATA, 'models');
const SOURCES_DIR = path.join(APP_DATA, 'sources');
const CONFIG_FILE = path.join(APP_DATA, 'config.json');

// ─── Helpers ─────────────────────────────────────────────────────
function ensureDirs() {
  for (const d of [APP_DATA, ENGINES_DIR, MODELS_DIR, SOURCES_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function loadConfig(): Record<string, unknown> {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); }
  catch { return {}; }
}
function saveConfig(cfg: Record<string, unknown>) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// ─── IPC: Engine Manager ────────────────────────────────────────
ipcMain.handle('engine-get-config', () => loadConfig());

ipcMain.handle('engine-set-config', (_e, cfg) => saveConfig({ ...loadConfig(), ...cfg }));

ipcMain.handle('engine-detect-hardware', () => {
  const os = process.platform; // 'win32' | 'darwin' | 'linux'
  return { os };
});

// ─── IPC: File Operations ────────────────────────────────────────
ipcMain.handle('fs-read-file', async (_e, filePath) => {
  const fullPath = path.join(path.dirname(CONFIG_FILE), '..', 'project', filePath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch (err: unknown) {
    return null;
  }
});

ipcMain.handle('fs-write-file', async (_e, filePath, content) => {
  const fullPath = path.join(path.dirname(CONFIG_FILE), '..', 'project', filePath);
  fs.writeFileSync(fullPath, content, 'utf-8');
  return true;
});

// ─── IPC: Terminal Command Execution ─────────────────────────────
ipcMain.handle('exec-command', async (_e, command) => {
  if (process.platform === 'win32') {
    return new Promise<string>((resolve, reject) => {
      try {
        const proc = spawn('cmd.exe', ['/c', command], { env: process.env });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        proc.on('close', () => {
          if (stderr && !stdout) reject(new Error(stderr.trim()));
          else resolve(stdout.trim());
        });
      } catch (err) {
        reject(err);
      }
    });
  } else {
    return new Promise<string>((resolve, reject) => {
      try {
        const proc = spawn('/bin/sh', ['-c', command], { env: process.env });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        proc.on('close', () => {
          if (stderr && !stdout) reject(new Error(stderr.trim()));
          else resolve(stdout.trim());
        });
      } catch (err) {
        reject(err);
      }
    });
  }
});

// ─── IPC: Git Operations ────────────────────────────────────────
ipcMain.handle('git-commit', async (_e, message) => {
  // Use APPDATA env variable instead of hardcoded path for cross-platform compatibility
  const projectPath = process.env.APPDATA || '/tmp';
  if (process.platform === 'win32') {
    return new Promise<string>((resolve, reject) => {
      try {
        spawn('cmd.exe', ['/c', `cd "%APPDATA%\\OpenLLMCode" && git commit -m "${message}"`],
          { env: process.env }, (err) => {
            if (err) reject(err);
            else resolve('committed');
          });
      } catch (err) { reject(err); }
    });
  } else {
    return new Promise<string>((resolve, reject) => {
      try {
        spawn('/bin/sh', ['-c', `cd "$HOME/.openllmcode" && git commit -m "${message}"`],
          { env: process.env }, (err) => {
            if (err) reject(err);
            else resolve('committed');
          });
      } catch (err) { reject(err); }
    });
  }
});

// ─── IPC: Chat / Inference ──────────────────────────────────────
ipcMain.handle('chat-start', async (_e, payload) => {
  const modelPath = path.join(MODELS_DIR, payload.model || 'ibm-grok4-1b.Q8_0.gguf');
  if (!fs.existsSync(modelPath)) return 'model-not-found';

  llamaCppProcess = spawn(
    process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
    [process.platform === 'win32' ? '/c' : '-c', `llama-server --mlock -m "${modelPath}"`],
    { env: process.env }
  );

  llamaCppProcess.stdout.on('data', (d) => {});
  return 'started';
});

ipcMain.handle('chat-send-message', async (_e, message) => {
  if (!llamaCppProcess) return 'no-engine';
  return new Promise<string>((resolve) => {
    try {
      llamaCppProcess.stdin.write(JSON.stringify({ type: 'message', text: message }) + '\n');
      resolve('ok');
    } catch (err) { reject(err); }
  });
});

ipcMain.handle('chat-stop', () => {
  if (llamaCppProcess) llamaCppProcess.kill();
  return true;
});

// ─── IPC: System AI ──────────────────────────────────────────────
ipcMain.handle('systemai-start', async (_e, modelPath) => {
  // Kill existing systemAI process before starting new one (prevents double-instances)
  if (systemAIProcess) systemAIProcess.kill();
  systemAIProcess = spawn(
    process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
    [process.platform === 'win32' ? '/c' : '-c', `llama-server --mlock -m "${modelPath}"`],
    { env: process.env }
  );
  return true;
});

ipcMain.handle('systemai-send-message', async (_e, message) => {
  if (!systemAIProcess) return 'no-system-ai';
  return new Promise<string>((resolve) => {
    try {
      systemAIProcess.stdin.write(JSON.stringify({ type: 'message', text: message }) + '\n');
      resolve('ok');
    } catch (err) { reject(err); }
  });
});

ipcMain.handle('systemai-stop', () => {
  if (systemAIProcess) systemAIProcess.kill();
  return true;
});

// ─── IPC: Dialogs ────────────────────────────────────────────────
ipcMain.handle('dialog-select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// ─── IPC: Electron Store (placeholder for future use) ──────────────
ipcMain.handle('electron-store-get-config', () => loadConfig());
ipcMain.handle('electron-store-set-config', (_e, key, value) => {
  const cfg = loadConfig();
  (cfg as any)[key] = value;
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
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load the Vite dev server or built files depending on environment
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── Export for hot-reload / testing ──────────────────────────────
export { loadConfig, saveConfig };