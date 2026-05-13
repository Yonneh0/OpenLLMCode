// ─── State ──────────────────────────────────────────────────────
const fs = require('fs');
const pathModule = require('path');
const { spawn } = require('child_process');

let electron: any;
const getElectron = () => (electron || (electron = require('electron')));

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

// ─── File Tree State ──────────────────────────────
let projectRoot: string = '';
const chokidar = require('chokidar');
let fileWatcher: any = null;

function setProjectRoot(rootPath: string) {
  projectRoot = rootPath;
}

function getProjectRoot(): string {
  if (!projectRoot) {
    const c = getPaths();
    projectRoot = pathModule.join(pathModule.dirname(c.CONFIG_FILE), '..', 'project');
  }
  return projectRoot;
}

// ─── File Tree Helpers ──────────────────────────────
function readDirTree(dirPath: string, depth: number = 0): any[] {
  if (depth > 10) return []; // prevent infinite recursion on deeply nested dirs
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.map((entry: any) => {
      const fullPath = pathModule.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: fullPath,
          type: 'directory',
          children: readDirTree(fullPath, depth + 1),
        };
      } else {
        const stats = fs.statSync(fullPath);
        return {
          name: entry.name,
          path: fullPath,
          type: 'file',
          sizeMB: Math.round(stats.size / 1048576 * 100) / 100,
        };
      }
    });
  } catch (err: unknown) {
    return [];
  }
}

function startFileWatcher() {
  if (fileWatcher) fileWatcher.close();
  const root = getProjectRoot();
  if (!fs.existsSync(root)) return;

  fileWatcher = chokidar.watch(root, {
    ignored: /node_modules|\.git|dist|build/,
    persistent: true,
    ignoreInitial: true,
  });

  fileWatcher.on('all', (event: string, filePath: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file-tree-changed', { event, path: filePath });
    }
  });
}

function stopFileWatcher() {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
}

// ─── IPC Registration (called inside app.whenReady) ──────────────
function registerIpc() {
  const electron = getElectron();
  const ipcMain = electron.ipcMain;
  const dialog = electron.dialog;

  // Engine Manager
  ipcMain.handle('engine-get-config', () => loadConfig());
  ipcMain.handle('engine-set-config', (_e: any, cfg: Record<string, unknown>) => saveConfig({ ...loadConfig(), ...cfg }));
  ipcMain.handle('engine-detect-hardware', () => ({ os: process.platform }));

  // File Operations
  ipcMain.handle('fs-read-file', async (_e: any, filePath: string) => {
    const fullPath = pathModule.isAbsolute(filePath) ? filePath : pathModule.join(getProjectRoot(), filePath);
    try { return fs.readFileSync(fullPath, 'utf-8'); }
    catch (err: unknown) { return null; }
  });

  ipcMain.handle('fs-write-file', async (_e: any, filePath: string, content: string) => {
    const fullPath = pathModule.isAbsolute(filePath) ? filePath : pathModule.join(getProjectRoot(), filePath);
    fs.writeFileSync(fullPath, content, 'utf-8');
    return true;
  });

  // File Tree Operations
  ipcMain.handle('fs-get-project-root', () => getProjectRoot());

  ipcMain.handle('fs-set-project-root', async (_e: any, rootPath: string) => {
    setProjectRoot(rootPath);
    startFileWatcher();
    return readDirTree(rootPath);
  });

  ipcMain.handle('fs-read-tree', () => readDirTree(getProjectRoot()));

  ipcMain.handle('fs-start-watcher', () => { startFileWatcher(); return true; });

  ipcMain.handle('fs-stop-watcher', () => { stopFileWatcher(); return true; });

  // Terminal — Fix #5: spawn with cwd set to projectRoot so commands run in the user's project directory
  ipcMain.handle('exec-command', async (_e: any, command: string) => {
    const cwd = getProjectRoot();
    if (process.platform === 'win32') {
      const proc = spawn('cmd.exe', ['/c', command], { env: process.env, cwd });
      let stdout = '', stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      return new Promise<string>((resolve, reject) => {
        proc.on('close', () => { if (stderr && !stdout) reject(new Error(stderr.trim())); else resolve(stdout.trim()); });
      });
    } else {
      const proc = spawn('/bin/sh', ['-c', command], { env: process.env, cwd });
      let stdout = '', stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      return new Promise<string>((resolve, reject) => {
        proc.on('close', () => { if (stderr && !stdout) reject(new Error(stderr.trim())); else resolve(stdout.trim()); });
      });
    }
  });

  // Git — Phase C: extended with checkpoint, squash, stash operations
  ipcMain.handle('git-commit', async (_e: any, message: string) => {
    const cwd = getProjectRoot();
    return new Promise<string>((resolve) => {
      const cmd = process.platform === 'win32'
        ? `cd "${cwd}" && git add . && git commit -m "${message}"`
        : `cd "${cwd}" && git add . && git commit -m "${message}"`;
      spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
            [process.platform === 'win32' ? '/c' : '-c', cmd],
            { env: process.env, cwd }).on('close', () => resolve('committed'));
    });
  });

  // Get current HEAD hash
  ipcMain.handle('git-get-head-hash', async (_e: any) => {
    try {
      const { execSync } = require('child_process');
      return execSync('git rev-parse HEAD', { cwd: getProjectRoot(), encoding: 'utf-8' }).trim();
    } catch {
      return '';
    }
  });

  // Create a checkpoint (tag + commit)
  ipcMain.handle('git-create-checkpoint', async (_e: any, label: string) => {
    const cwd = getProjectRoot();
    try {
      const { execSync } = require('child_process');
      // Stage all changes first
      execSync('git add .', { cwd });
      // Commit with checkpoint label
      execSync(`git commit -m "Checkpoint: ${label}" --allow-empty`, { cwd });
      // Get the hash
      const hash = execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8' }).trim();
      return hash;
    } catch {
      return '';
    }
  });

  // Restore to a checkpoint (hard reset)
  ipcMain.handle('git-restore-to-checkpoint', async (_e: any, checkpointHash: string) => {
    const cwd = getProjectRoot();
    try {
      const { execSync } = require('child_process');
      execSync(`git reset --hard ${checkpointHash}`, { cwd });
      return true;
    } catch {
      return false;
    }
  });

  // Squash commits from a task into one
  ipcMain.handle('git-squash-commits', async (_e: any, commitMessage: string, count: number = 5) => {
    const cwd = getProjectRoot();
    try {
      const { execSync } = require('child_process');
      // Get the hash before squashing so we know what to squash
      const baseHash = execSync(`git rev-parse HEAD~${count}`, { cwd, encoding: 'utf-8' }).trim();
      execSync(`git reset --soft ${baseHash}`, { cwd });
      execSync(`git commit -m "${commitMessage}"`, { cwd });
      return true;
    } catch {
      return false;
    }
  });

  // Stash current changes (for auto-stashing user edits)
  ipcMain.handle('git-stash', async () => {
    const cwd = getProjectRoot();
    try {
      const { execSync } = require('child_process');
      execSync('git stash --include-untracked', { cwd });
      return true;
    } catch {
      return false;
    }
  });

  // Pop the most recent stash (restore user edits)
  ipcMain.handle('git-stash-pop', async () => {
    const cwd = getProjectRoot();
    try {
      const { execSync } = require('child_process');
      execSync('git stash pop', { cwd });
      return true;
    } catch {
      return false;
    }
  });

  // Check if there are uncommitted changes
  ipcMain.handle('git-has-uncommitted', async () => {
    const cwd = getProjectRoot();
    try {
      const { execSync } = require('child_process');
      const output = execSync('git status --porcelain', { cwd, encoding: 'utf-8' }).trim();
      return output.length > 0;
    } catch {
      return false;
    }
  });

  // File search — regex across files in a directory
  ipcMain.handle('fs-search-files', async (_e: any, payload: { path: string; regex: string; filePattern?: string }) => {
    const cwd = getProjectRoot();
    const searchPath = pathModule.isAbsolute(payload.path) ? payload.path : pathModule.join(cwd, payload.path);
    try {
      const { execSync } = require('child_process');
      let cmd: string;
      if (process.platform === 'win32') {
        // Use findstr on Windows as fallback
        cmd = `findstr /s /n /r "${payload.regex}" ${searchPath}\\*`;
      } else {
        const fileFilter = payload.filePattern ? ` --include="${payload.filePattern}"` : '';
        cmd = `grep -rnE "${payload.regex}" "${searchPath}"${fileFilter}`;
      }
      return execSync(cmd, { cwd, encoding: 'utf-8', maxBuffer: 1024 * 1024 }).trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Search error: ${msg}`;
    }
  });

  // Glob — find files matching a pattern
  ipcMain.handle('fs-glob', async (_e: any, payload: { pattern: string; path?: string }) => {
    const cwd = getProjectRoot();
    const baseDir = payload.path ? (pathModule.isAbsolute(payload.path) ? payload.path : pathModule.join(cwd, payload.path)) : cwd;
    try {
      // Use Node's built-in fs for recursive glob matching
      const results: string[] = [];
      function walk(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = pathModule.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else {
            // Simple glob matching
            const relPath = pathModule.relative(cwd, fullPath);
            if (simpleGlobMatch(relPath, payload.pattern)) {
              results.push(relPath);
            }
          }
        }
      }
      walk(baseDir);
      return results.join('\n');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Glob error: ${msg}`;
    }
  });

  // Simple glob matching helper for fs-glob IPC
  function simpleGlobMatch(filePath: string, pattern: string): boolean {
    // Convert glob to regex
    const regex = new RegExp(
      '^' + pattern.replace(/\./g, '\\.').replace(/\*\*/g, '___DOUBLESTAR___')
        .replace(/\*/g, '[^/]*').replace(/___DOUBLESTAR___/g, '.*') + '$',
      'i'
    );
    return regex.test(filePath);
  }

  // Chat / Inference — Fix #1: use full path to llama-server binary from engines dir; Fix #2: stdout listener emits IPC chat-response events
  let llamaServerPort = 8080;

  ipcMain.handle('chat-start', async (_e: any, payload: Record<string, string>) => {
    const c = getPaths();
    const modelPath = pathModule.join(c.MODELS_DIR, payload.model || 'ibm-grok4-1b.Q8_0.gguf');
    if (!fs.existsSync(modelPath)) return 'model-not-found';

    // Kill any existing llama-server on the port first
    if (llamaCppProcess) {
      try { llamaCppProcess.kill(); } catch {}
    }

    // Use full path to llama-server binary from engines directory, or fallback to PATH lookup
    const enginesDir = c.ENGINES_DIR;
    let serverBinary = 'llama-server';
    if (fs.existsSync(pathModule.join(enginesDir, 'llama-server'))) {
      serverBinary = pathModule.join(enginesDir, 'llama-server');
    } else if (process.platform === 'win32' && fs.existsSync(pathModule.join(enginesDir, 'llama-server.exe'))) {
      serverBinary = pathModule.join(enginesDir, 'llama-server.exe');
    }

    llamaCppProcess = spawn(
      serverBinary,
      ['--mlock', '-m', modelPath, '--port', String(llamaServerPort), '--host', '127.0.0.1'],
      { env: process.env }
    );

    // Fix #2: Listen for streaming responses and emit IPC events to renderer
    llamaCppProcess.stdout.on('data', (d: Buffer) => {
      const output = d.toString();
      const lines = output.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          // Parse JSON response from llama-server chat/completions endpoint
          const parsed = JSON.parse(line);
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta?.content) {
            mainWindow?.webContents.send('chat-response', {
              type: 'chunk',
              content: parsed.choices[0].delta.content,
            });
          } else if (parsed.usage) {
            mainWindow?.webContents.send('chat-response', {
              type: 'done',
              usage: parsed.usage,
            });
          }
        } catch {
          // Non-JSON output (e.g., startup logs), ignore silently
        }
      }
    });

    llamaCppProcess.stderr.on('data', (d: Buffer) => {
      // Log stderr to mainWindow for debugging
      mainWindow?.webContents.send('chat-error', d.toString().trim());
    });

    return 'started';
  });

  ipcMain.handle('chat-send-message', async (_e: any, message: string) => {
    if (!llamaCppProcess) return 'no-engine';
    try {
      // Send chat completion request to llama-server REST API
      const requestBody = JSON.stringify({
        messages: [{ role: 'user', content: message }],
        stream: true,
        temperature: 0.7,
        top_p: 0.9,
      });
      // Use fetch-style via child process for HTTP POST to llama-server
      const httpCmd = process.platform === 'win32'
        ? `echo ${JSON.stringify(requestBody).replace(/"/g, '\\"')} | curl -s -N -X POST "http://127.0.0.1:${llamaServerPort}/v1/chat/completions" -H "Content-Type: application/json" -d @-`
        : `echo '${requestBody.replace(/'/g, "'\\''")}' | curl -s -N -X POST "http://127.0.0.1:${llamaServerPort}/v1/chat/completions" -H "Content-Type: application/json" -d @-`;

      const proc = spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
        [process.platform === 'win32' ? '/c' : '-c', httpCmd],
        { env: process.env }
      );
      return 'ok';
    } catch (err: unknown) { throw err; }
  });

  ipcMain.handle('chat-stop', () => { if (llamaCppProcess) llamaCppProcess.kill(); return true; });

  // System AI — Fix #1: use full path to llama-server binary from engines dir
  let systemAIPort = 8081;

  ipcMain.handle('systemai-start', async (_e: any, modelPath: string) => {
    if (systemAIProcess) systemAIProcess.kill();
    const c = getPaths();
    const enginesDir = c.ENGINES_DIR;
    let serverBinary = 'llama-server';
    if (fs.existsSync(pathModule.join(enginesDir, 'llama-server'))) {
      serverBinary = pathModule.join(enginesDir, 'llama-server');
    } else if (process.platform === 'win32' && fs.existsSync(pathModule.join(enginesDir, 'llama-server.exe'))) {
      serverBinary = pathModule.join(enginesDir, 'llama-server.exe');
    }

    systemAIProcess = spawn(
      serverBinary,
      ['--mlock', '-m', modelPath, '--port', String(systemAIPort), '--host', '127.0.0.1'],
      { env: process.env }
    );

    // Emit IPC events for system AI responses
    systemAIProcess.stdout.on('data', (d: Buffer) => {
      const output = d.toString();
      const lines = output.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta?.content) {
            mainWindow?.webContents.send('systemai-response', {
              type: 'chunk',
              content: parsed.choices[0].delta.content,
            });
          } else if (parsed.usage) {
            mainWindow?.webContents.send('systemai-response', {
              type: 'done',
              usage: parsed.usage,
            });
          }
        } catch { /* non-JSON output, ignore */ }
      }
    });

    return true;
  });

  ipcMain.handle('systemai-send-message', async (_e: any, message: string) => {
    if (!systemAIProcess) return 'no-system-ai';
    try {
      const requestBody = JSON.stringify({
        messages: [{ role: 'user', content: message }],
        stream: true,
        temperature: 0.3,
        top_p: 0.9,
      });
      const httpCmd = process.platform === 'win32'
        ? `echo ${JSON.stringify(requestBody).replace(/"/g, '\\"')} | curl -s -N -X POST "http://127.0.0.1:${systemAIPort}/v1/chat/completions" -H "Content-Type: application/json" -d @-`
        : `echo '${requestBody.replace(/'/g, "'\\''")}' | curl -s -N -X POST "http://127.0.0.1:${systemAIPort}/v1/chat/completions" -H "Content-Type: application/json" -d @-`;

      spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
        [process.platform === 'win32' ? '/c' : '-c', httpCmd],
        { env: process.env }
      );
      return 'ok';
    } catch (err: unknown) { throw err; }
  });

  ipcMain.handle('systemai-stop', () => { if (systemAIProcess) systemAIProcess.kill(); return true; });

  // Dialogs
  ipcMain.handle('dialog-select-folder', async (_e: any, parentWindow: any) => {
    if (!parentWindow && !mainWindow) return null;
    const result = await dialog.showOpenDialog(parentWindow || mainWindow, { properties: ['openDirectory'] });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // Store config for Electron to read
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
  const electron = getElectron();
  const BrowserWindow = electron.BrowserWindow;
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
function _start() {
  const electron = getElectron();
  if (!electron || typeof electron.app === 'undefined') return; // not in Electron runtime

  electron.app.whenReady().then(() => startApp());
  electron.app.on('window-all-closed', () => { if (process.platform !== 'darwin') electron.app.quit(); });
}

// Guard against plain-node execution where require('electron') returns a string path
const _electron = getElectron();
if (typeof _electron === 'string' || typeof _electron.app === 'undefined') {
  console.log('[main] Electron runtime detected, starting...');
  _start();
} else {
  _start();
}

exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;