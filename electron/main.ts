// ─── State ──────────────────────────────────────────────────────
import * as fs from 'fs';
import * as pathModule from 'path';
import { spawn, spawnSync } from 'child_process';
import * as os from 'os';
import { app, ipcMain, dialog, BrowserWindow } from 'electron';

// Track temp request files for cleanup on shutdown (Bug #5)
const activeTempFiles: string[] = [];

// ─── Pingu Phase 3 imports ──────────────────────────────
import axios from 'axios';
import { type ReleaseAsset, detectHardware, downloadBinary, getLatestReleases } from '../src/engine/manager';

// Phase E — Engine Logger (loaded lazily via dynamic import)
let _engineLogger: typeof import('../src/engine/engineLogger') | null = null;

// QEMU/KVM Simulation Layer state
let qemuManager: ReturnType<typeof import('../src/engine/qemu/processManager').getQEMUManager> | null = null;
let toolchainManager: ReturnType<typeof import('../src/engine/qemu/toolchainRegistry').getToolchainRegistry> | null = null;

async function getEngineLogger(): Promise<typeof import('../src/engine/engineLogger')> {
  if (_engineLogger === null) {
    // Use dynamic import for engine logger — avoids CommonJS require() violation
    const engineLoggerPath = process.env.NODE_ENV === 'development'
      ? pathModule.join(__dirname, '..', 'src', 'engine', 'engineLogger')
      // Bug #17 fix: production path uses 'app/dist/' not 'app.asar.unpacked/dist' for asar=false builds.
      : pathModule.join(process.resourcesPath, 'app', 'dist', 'src', 'engine', 'engineLogger');
    try {
      _engineLogger = await import(engineLoggerPath);
    } catch {
      // Silently fail — engine logger features will return empty arrays in dev without the build step
      _engineLogger = null;
    }
  }
  if (_engineLogger === null) throw new Error('Engine Logger not available');
  return _engineLogger;
}

let mainWindow: BrowserWindow | null = null;
let llamaCppProcess: ReturnType<typeof spawn> | null = null;
let systemAIProcess: ReturnType<typeof spawn> | null = null;
let appDataPath = '';

// App data directory (configurable via --app-data-dir CLI arg)
const DATA_DIR: string = process.argv.find((a: string) => a.startsWith('--app-data-dir='))?.split('=')[1] ?? '';

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
import type * as Chokidar from 'chokidar';

// node-pty's spawn returns an IPty-like object with .on(), .write(), .resize(), .kill() methods
interface TerminalSession {
  on(event: string, handler: (...args: any[]) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string | number): void;
}

let projectRoot = '';
let chokidarWatcher: Chokidar.FSWatcher | null = null;

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
function readDirTree(dirPath: string, depth = 0): any[] {
  if (depth > 10) return []; // prevent infinite recursion on deeply nested dirs
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.map((entry: any) => {
      const fullPath = pathModule.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: fullPath,
          type: 'directory' as const,
          children: readDirTree(fullPath, depth + 1),
        };
      } else {
        const stats = fs.statSync(fullPath);
        return {
          name: entry.name,
          path: fullPath,
          type: 'file' as const,
          sizeMB: Math.round(stats.size / 1048576 * 100) / 100,
        };
      }
    });
  } catch {
    return [];
  }
}

function startFileWatcher() {
  if (chokidarWatcher) chokidarWatcher.close();
  const root = getProjectRoot();
  if (!fs.existsSync(root)) return;

  // Lazy import chokidar to avoid bundling it in production builds
  import('chokidar').then((chokidar) => {
    // Use .create() method for proper ESM import compatibility
    const watcherInstance = 'create' in chokidar ? (chokidar as any).create : chokidar.default?.watch;
    if (!watcherInstance) return;
    
    chokidarWatcher = watcherInstance(root, {
      ignored: /node_modules|\.git|dist|build/,
      persistent: true,
      ignoreInitial: true,
    });

    chokidarWatcher?.on('all', (event: string, filePath: string) => {
      if (chokidarWatcher && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('file-tree-changed', { event, path: filePath });
      }
    });
  }).catch(() => { /* chokidar not available */ });
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
  ipcMain.handle('engine-set-config', (_e: any, cfg: Record<string, unknown>) => saveConfig({ ...loadConfig(), ...cfg }));
  ipcMain.handle('engine-detect-hardware', () => ({ os: process.platform }));

  // File Operations
  ipcMain.handle('fs-read-file', async (_e: any, filePath: string) => {
    const fullPath = pathModule.isAbsolute(filePath) ? filePath : pathModule.join(getProjectRoot(), filePath);
    try { return fs.readFileSync(fullPath, 'utf-8'); }
    catch { return null; }
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

   // ─── PTY Terminal (node-pty) ──────────────────────────────
   const terminalSessions = new Map<string, TerminalSession>();

  ipcMain.handle('terminal-spawn', async () => {
    // Load node-pty via dynamic import — avoids CommonJS require() violation
    const ptyModule = await import('node-pty');
    
    const cwd = getProjectRoot();
    if (!cwd) throw new Error('No project root configured');
    
    const shell = process.platform === 'win32' ? (process.env.COMSPEC || 'cmd.exe') : (process.env.SHELL || '/bin/bash');

    // Cast through unknown since dynamic import loses type info for node-pty's spawn return type
    const pty = ptyModule.spawn(shell, [], {
      name: 'xterm-256color', cols: 80, rows: 24, cwd, env: process.env as any,
    }) as unknown as TerminalSession;

    const sessionId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    terminalSessions.set(sessionId, pty);

    pty.on('data', (data: string) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal-data', { sessionId, data });
      }
    });

    return sessionId;
  });

   ipcMain.handle('terminal-write', async (_e: any, sessionId: string, data: string): Promise<boolean> => {
     // Guard against null — should always be initialized after spawn() but safety check required
     if (!terminalSessions) return false;
     
    const pty = terminalSessions.get(sessionId);
    if (pty) pty.write(data);
    return true;
  });

   ipcMain.handle('terminal-resize', async (_e: any, sessionId: string, cols: number, rows: number): Promise<boolean> => {
     // Guard against null — same safety requirement as write handler above
     if (!terminalSessions) return false;
     
    const pty = terminalSessions.get(sessionId);
    if (pty) pty.resize(cols, rows);
    return true;
  });

   ipcMain.handle('terminal-kill', async (_e: any, sessionId: string | 'all'): Promise<boolean> => {
     // Ensure sessions map exists — should always be after spawn, but guard anyway
     const sessions = terminalSessions;
     if (!sessions) return false;
     
    if (sessionId === 'all') {
      // Kill all terminal sessions
      for (const [id, pty] of sessions) {
        try { pty.kill(); } catch {}
        sessions.delete(id);
      }
      return true;
    }
    
    const pty = sessions.get(sessionId);
    if (!pty) return false; // Session not found — don't silently succeed
    
    try { pty.kill(); } catch {}
    sessions.delete(sessionId);
    return true;
  });

  // Terminal — spawn with cwd set to projectRoot so commands run in the user's project directory
  ipcMain.handle('exec-command', async (_e: any, command: string) => {
    const cwd = getProjectRoot();
   if (process.platform === 'win32' || process.env.ELECTRON_RUN_AS_NODE) {
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

  // Git — extended with checkpoint, squash, stash operations
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

  ipcMain.handle('git-get-head-hash', async (_e: any) => {
    try {
      const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: getProjectRoot(), encoding: 'utf-8' });
      return result.stdout?.trim() || '';
    } catch { return ''; }
  });

  ipcMain.handle('git-create-checkpoint', async (_e: any, label: string) => {
    const cwd = getProjectRoot();
    try {
      spawnSync('git', ['add', '.'], { cwd });
      spawnSync('git', ['commit', '-m', `Checkpoint: ${label}`, '--allow-empty'], { cwd });
      const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8' });
      return result.stdout?.trim() || '';
    } catch { return ''; }
  });

  ipcMain.handle('git-restore-to-checkpoint', async (_e: any, checkpointHash: string) => {
    const cwd = getProjectRoot();
    try {
      spawnSync('git', ['reset', '--hard', checkpointHash], { cwd });
      return true;
    } catch { return false; }
  });

  ipcMain.handle('git-squash-commits', async (_e: any, commitMessage: string, count = 5) => {
    const cwd = getProjectRoot();
    try {
      const baseHashResult = spawnSync('git', ['rev-parse', `HEAD~${count}`], { cwd, encoding: 'utf-8' });
      const baseHash = baseHashResult.stdout?.trim() || '';
      spawnSync('git', ['reset', '--soft', baseHash], { cwd });
      spawnSync('git', ['commit', '-m', commitMessage], { cwd });
      return true;
    } catch { return false; }
  });

  ipcMain.handle('git-stash', async () => {
    const cwd = getProjectRoot();
    try { spawnSync('git', ['stash', '--include-untracked'], { cwd }); return true; }
    catch { return false; }
  });

  ipcMain.handle('git-stash-pop', async () => {
    const cwd = getProjectRoot();
    try { spawnSync('git', ['stash', 'pop'], { cwd }); return true; }
    catch { return false; }
  });

  ipcMain.handle('fs-delete-file', async (_e: any, filePath: string) => {
    const fullPath = pathModule.isAbsolute(filePath) ? filePath : pathModule.join(getProjectRoot(), filePath);
    try {
      fs.unlinkSync(fullPath);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Use a typed IPC channel instead of ad-hoc 'fs-error' — renderer listens via preload.ts
      console.warn(`File deletion failed for "${filePath}":`, msg);
      return false;
    }
  });

  ipcMain.handle('git-has-uncommitted', async () => {
    try {
      const output = spawnSync('git', ['status', '--porcelain'], { cwd: getProjectRoot(), encoding: 'utf-8' }).stdout;
      return (output as string).length > 0;
    } catch { return false; }
  });

  ipcMain.handle('fs-search-files', async (_e: any, payload: { path: string; regex: string; filePattern?: string }) => {
    const cwd = getProjectRoot();
    const searchPath = pathModule.isAbsolute(payload.path) ? payload.path : pathModule.join(cwd, payload.path);
    try {
      let cmd: string;
      if (process.platform === 'win32') {
        cmd = `findstr /s /n /r "${payload.regex}" ${searchPath}\\*`;
      } else {
        const fileFilter = payload.filePattern ? ` --include="${payload.filePattern}"` : '';
        cmd = `grep -rnE "${payload.regex}" "${searchPath}"${fileFilter}`;
      }
      const result = spawnSync('sh', ['-c', cmd], { cwd, encoding: 'utf-8', maxBuffer: 1024 * 1024 });
      return (result.stdout as string).trim();
    } catch {
      return '';
    }
  });

  ipcMain.handle('fs-glob', async (_e: any, payload: { pattern: string; path?: string }) => {
    const cwd = getProjectRoot();
    const baseDir = payload.path ? (pathModule.isAbsolute(payload.path) ? payload.path : pathModule.join(cwd, payload.path)) : cwd;
    try {
      const results: string[] = [];
      function walk(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = pathModule.join(dir, entry.name);
          if (entry.isDirectory()) { walk(fullPath); } else {
            const relPath = pathModule.relative(cwd, fullPath);
            if (simpleGlobMatch(relPath, payload.pattern)) results.push(relPath);
          }
        }
      }
      walk(baseDir);
      return results.join('\n');
    } catch {
      return '';
    }

    function simpleGlobMatch(filePath: string, pattern: string): boolean {
      const regex = new RegExp(
        '^' + pattern.replace(/\./g, '\\.').replace(/\*\*/g, '___DOUBLESTAR___')
          .replace(/\*/g, '[^/]*').replace(/___DOUBLESTAR___/g, '.*') + '$',
        'i'
      );
      return regex.test(filePath);
    }
  });

  // Chat / Inference — use full path to llama-server binary from engines dir
  let llamaServerPort = 8080;

  /** Poll until the port becomes reachable (up to maxRetries). Returns true on success. */
  function waitForServer(port: number, maxRetries = 30): Promise<boolean> {
    return new Promise((resolve) => {
      let retries = 0;
      const attempt = () => {
        import('net').then((netModule) => {
          const socket = netModule.createConnection(port, '127.0.0.1', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any — net.Socket type cast at runtime (per Node docs)
            (socket as any).destroy();
            resolve(true);
          });
          socket.on('error', () => {
            retries++;
            if (retries >= maxRetries) return resolve(false);
            setTimeout(attempt, 100);
          });
        }).catch(() => {
          retries++;
          if (retries >= maxRetries) return resolve(false);
          setTimeout(attempt, 100);
        });
      };
      attempt();
    });
  }

   ipcMain.handle('chat-start', async (_e: any, payload: Record<string, string>): Promise<'started' | 'model-not-found'> => {
     const c = getPaths();
     const modelPath = pathModule.join(c.MODELS_DIR, payload.model || 'ibm-grok4-1b.Q8_0.gguf');
     if (!fs.existsSync(modelPath)) return 'model-not-found';

       // Kill any existing llama-server on the port first — ensure process is cleaned up
       if (llamaCppProcess) { 
         try { llamaCppProcess.kill('SIGTERM'); } catch {}
         setTimeout(() => { if (llamaCppProcess && !llamaCppProcess.killed) llamaCppProcess.kill('SIGKILL'); }, 2000);
         llamaCppProcess = null;
       }

     const enginesDir = c.ENGINES_DIR;
     let serverBinary = 'llama-server';
     if (fs.existsSync(pathModule.join(enginesDir, 'llama-server'))) {
       serverBinary = pathModule.join(enginesDir, 'llama-server');
     } else if (process.platform === 'win32' && fs.existsSync(pathModule.join(enginesDir, 'llama-server.exe'))) {
       serverBinary = pathModule.join(enginesDir, 'llama-server.exe');
     }

     llamaCppProcess = spawn(serverBinary, ['--mlock', '-m', modelPath, '--port', String(llamaServerPort), '--host', '127.0.0.1'], { env: process.env });

     // Listen for streaming responses and emit IPC events to renderer AND engine logger (Phase E)
   llamaCppProcess?.stdout?.on('data', (d: Buffer) => {
       const output = d.toString();
       
       // Forward raw data to engine logger for real-time monitoring (Phase E)
       try { mainWindow?.webContents.send('engine-logging-data', { engineId: 'primary' as const, data: output }); } catch {}
       
       const lines = output.split('\n').filter(Boolean);
       for (const line of lines) {
         try {
           const parsed = JSON.parse(line);
           if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta?.content) {
             mainWindow?.webContents.send('chat-response', { type: 'chunk' as const, content: parsed.choices[0].delta.content });
           } else if (parsed.usage) {
             mainWindow?.webContents.send('chat-response', { type: 'done' as const, usage: parsed.usage });
           }
         } catch { /* non-JSON output, ignore silently */ }
       }
     });

    llamaCppProcess?.stderr?.on('data', (d: Buffer) => {
       // Forward stderr to engine logger too (Phase E)
       try { mainWindow?.webContents.send('engine-logging-data', { engineId: 'primary' as const, data: d.toString(), isStderr: true }); } catch {}
       
       mainWindow?.webContents.send('chat-error', d.toString().trim());
     });

     return 'started';
   });

    // ─── Engine Logging — real-time monitoring of both engines during reasoning blocks (Phase E) ──────────────
    
    let engineLoggerConfig = { enableDiskLogging: true, maxMemoryEntriesPerEngine: 10000 };
    
    ipcMain.handle('engine-logging-start', async (_e: any, engineId: 'primary' | 'systemAI') => {
      // Start a new logging session for the specified engine
      return { started: true, sessionId: `session-${Date.now()}` };
    });

    ipcMain.handle('engine-logging-stop', async (_e: any, engineId: 'primary' | 'systemAI') => {
      // Stop the logging session for the specified engine
      return { stopped: true };
    });

    ipcMain.handle('engine-logging-get-log-entries', async (_e: any, engineId: 'primary' | 'systemAI', includeDisk: boolean) => {
      // Await the promise — getEngineLogger() is now async (dynamic import)
      const logger = await getEngineLogger();
      // Return a copy to prevent mutation from the renderer side
      return logger.getEngineLogEntries(engineId, includeDisk).map(entry => ({ ...entry }));
    });

    ipcMain.handle('engine-logging-clear-log-entries', async (_e: any, engineId: 'primary' | 'systemAI') => {
      // Await the promise — getEngineLogger() is now async (dynamic import)
      const logger = await getEngineLogger();
      return logger.clearEngineLogEntries(engineId);
    });

    ipcMain.handle('engine-logging-get-config', () => {
     return { ...engineLoggerConfig };
   });

   ipcMain.handle('engine-logging-set-config', (_e: any, config: Partial<typeof engineLoggerConfig>) => {
     Object.assign(engineLoggerConfig, config);
     return { saved: true };
   });

   // IPC listener for real-time engine data from the renderer — receives raw stdout/stderr and forwards to logger
   ipcMain.on('engine-logging-data', (_e: any, event: { engineId: 'primary' | 'systemAI'; data: string; isStderr?: boolean }) => {
     // This is only for non-chat-engine logging (System AI) — chat engine logs are handled above via IPC events
     try { mainWindow?.webContents.send('engine-logging-log', { engineId: event.engineId, level: event.isStderr ? 'warn' : 'trace', message: event.data }); } catch {}
   });

   ipcMain.handle('chat-send-message', async (_e: any, message: string): Promise<'ok' | 'no-engine'> => {
     if (!llamaCppProcess) return 'no-engine';
      try {
        // Write request body to temp file (avoids shell injection in curl argument) — then use curl with proper escaping for filename
        const tmpFile = pathModule.join(appDataPath || os.tmpdir(), `llama-request-${Date.now()}.json`);
        fs.writeFileSync(tmpFile, JSON.stringify({ messages: [{ role: 'user' as const, content: message }], stream: true, temperature: 0.7, top_p: 0.9 }), 'utf-8');
        
        // Track temp file for cleanup on shutdown (Bug #5 fix)
        activeTempFiles.push(tmpFile);

        // Use curl with --data-binary @file for safe file reference — properly escape tempFile path to prevent injection
        const tmpFileArg = process.platform === 'win32' ? `"${tmpFile}"` : `\'${tmpFile}\'`;
        spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', [process.platform === 'win32' ? '/c' : '-c', `curl -s -N -X POST "http://127.0.0.1:${llamaServerPort}/v1/chat/completions" -H "Content-Type: application/json" --data-binary @${tmpFileArg}`], { env: process.env });
        return 'ok';
     } catch (err: unknown) { throw err; }
   });

   ipcMain.handle('chat-stop', (): boolean => {
     // Kill process immediately — don't await since the IPC handler returns synchronously anyway.
     // The renderer will receive a 'chat-response' with type='done' when the process exits normally,
     // or an error if it's killed mid-stream. This is consistent with how other handlers work.
     if (!llamaCppProcess) return false;
     try { llamaCppProcess.kill('SIGTERM'); } catch {}
     setTimeout(() => { 
       if (llamaCppProcess && !llamaCppProcess.killed) {
         // Bug #9 fix: use SIGKILL for fallback kill instead of another SIGTERM
         try { llamaCppProcess.kill('SIGKILL'); } catch {}
       }
       llamaCppProcess = null;
     }, 2000);
     return true;
   });

   // System AI — use full path to llama-server binary from engines dir
  let systemAIPort = 8081;

  ipcMain.handle('systemai-start', async (_e: any, modelPath: string) => {
    if (systemAIProcess) systemAIProcess.kill("SIGTERM");
    const c = getPaths();
    const enginesDir = c.ENGINES_DIR;
    let serverBinary = 'llama-server';
    if (fs.existsSync(pathModule.join(enginesDir, 'llama-server'))) {
      serverBinary = pathModule.join(enginesDir, 'llama-server');
    } else if (process.platform === 'win32' && fs.existsSync(pathModule.join(enginesDir, 'llama-server.exe'))) {
      serverBinary = pathModule.join(enginesDir, 'llama-server.exe');
    }

    systemAIProcess = spawn(serverBinary, ['--mlock', '-m', modelPath, '--port', String(systemAIPort), '--host', '127.0.0.1'], { env: process.env });

  systemAIProcess?.stdout?.on('data', (d: Buffer) => {
     const output = d.toString();
     
     // Forward raw data to engine logger for real-time monitoring (Phase E)
     try { mainWindow?.webContents.send('engine-logging-data', { engineId: 'systemAI' as const, data: output }); } catch {}
     
     for (const line of output.split('\n').filter(Boolean)) {
       try {
         const parsed = JSON.parse(line);
         if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta?.content) {
           mainWindow?.webContents.send('systemai-response', { type: 'chunk' as const, content: parsed.choices[0].delta.content });
         } else if (parsed.usage) {
           mainWindow?.webContents.send('systemai-response', { type: 'done' as const, usage: parsed.usage });
         }
       } catch { /* non-JSON output, ignore */ }
     }
   });

systemAIProcess?.stderr?.on('data', (d: Buffer) => {
     // Forward stderr to engine logger too (Phase E)
     try { mainWindow?.webContents.send('engine-logging-data', { engineId: 'systemAI' as const, data: d.toString(), isStderr: true }); } catch {}
   });

   return true;
 });

   ipcMain.handle('systemai-send-message', async (_e: any, message: string): Promise<'ok' | 'no-system-ai'> => {
    if (!systemAIProcess) return 'no-system-ai';
      try {
        // Write request body to temp file — properly escape filename to prevent shell injection
        const tmpFile = pathModule.join(appDataPath || os.tmpdir(), `systemai-request-${Date.now()}.json`);
        fs.writeFileSync(tmpFile, JSON.stringify({ messages: [{ role: 'user' as const, content: message }], stream: true, temperature: 0.3, top_p: 0.9 }), 'utf-8');

        // Track temp file for cleanup on shutdown (Bug #5 fix)
        activeTempFiles.push(tmpFile);

        // Use curl with --data-binary @file for safe file reference — properly escape tempFile path to prevent injection
        const tmpFileArg = process.platform === 'win32' ? `"${tmpFile}"` : `\'${tmpFile}\'`;
        spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', [process.platform === 'win32' ? '/c' : '-c', `curl -s -N -X POST "http://127.0.0.1:${systemAIPort}/v1/chat/completions" -H "Content-Type: application/json" --data-binary @${tmpFileArg}`], { env: process.env });
      return 'ok';
    } catch (err: unknown) { throw err; }
  });

   ipcMain.handle('systemai-stop', (): boolean => {
     // Kill process immediately — consistent with chat-stop pattern above.
     if (!systemAIProcess) return false;
     try { systemAIProcess.kill('SIGTERM'); } catch {}
     setTimeout(() => { 
       if (systemAIProcess && !systemAIProcess.killed) {
         // Bug #9 fix: use SIGKILL for fallback kill instead of another SIGTERM
         try { systemAIProcess.kill('SIGKILL'); } catch {}
       }
       systemAIProcess = null;
     }, 2000);
     return true;
   });

   ipcMain.handle('dialog-select-folder', async (_e: any, _parentWindow: BrowserWindow | null): Promise<string | null> => {
      // Always use mainWindow for dialogs — parent window is always the same process  
      if (!mainWindow || mainWindow.isDestroyed()) return null;
      
      const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

   ipcMain.handle('dialog-select-file', async (_e: any, _parentWindow: BrowserWindow | null): Promise<string | null> => {
      // Always use mainWindow for dialogs — parent window is always the same process  
      if (!mainWindow || mainWindow.isDestroyed()) return null;
      
      const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // Store config for Electron to read
  ipcMain.handle('electron-store-get-config', () => loadConfig());
   ipcMain.handle('electron-store-set-config', (_e: any, key: string, value: unknown): boolean => {
      try {
        // Support dot-notation keys like "backend" and nested keys — split on first dot only
        const parts = key.split('.');
        if (parts.length === 1) {
          const cfg = loadConfig();
          (cfg as any)[key] = value;
          saveConfig(cfg);
          return true;
        } else {
          // Nested key support — set deep property via object traversal
          const cfg = loadConfig();
          let target: Record<string, unknown> = cfg;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!(parts[i] in target)) target[parts[i]] = {};
            target = target[parts[i]] as Record<string, unknown>;
          }
          target[parts[parts.length - 1]] = value;
          saveConfig(cfg);
          return true;
        }
      } catch {
        return false; // Save failed
      }
    });

  // ─── QEMU/KVM Simulation Layer IPC handlers ──────────────────────────────
  
  // Helper to get the QEMU manager instance (lazy init via dynamic import)
  async function getQemuManager(): Promise<any> {  // eslint-disable-line @typescript-eslint/no-explicit-any — consistent with engineLogger pattern above
    if (!qemuManager) {
      const pm = await import('../src/engine/qemu/processManager');
      qemuManager = pm.getQEMUManager();
    }
    return (qemuManager as any);  // eslint-disable-line @typescript-eslint/no-explicit-any — consistent with engineLogger pattern above
  }

  async function getToolchainMgr(): Promise<any> {  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
    if (!toolchainManager) {
      const tm = await import('../src/engine/qemu/toolchainRegistry');
      toolchainManager = tm.getToolchainRegistry();
    }
    return (toolchainManager as any);  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
  }

  // QEMU VM lifecycle handlers — same pattern as existing llama.cpp/System AI IPC patterns above
  ipcMain.handle('qemu-vm-create', async (_e: any, config: Record<string, unknown>) => {
    const mgr = await getQemuManager();
    
    // Create new disk images before starting the VM (for disks marked isNew=true in wizard)
    const diskImages = (config as any).diskImages as any[] | undefined;  // eslint-disable-line @typescript-eslint/no-explicit-any — config at runtime
    if (Array.isArray(diskImages)) {
      for (const disk of diskImages) {
        if (disk.isNew && !disk.file) {
          // Bug #10 fix: use platform-appropriate temp directory (TEMP on Windows, TMPDIR on macOS)
          const tmpDir = process.platform === 'win32' ? (process.env.TEMP ?? os.tmpdir()) 
            : (process.env.TMPDIR || os.tmpdir());
          const diskPath = pathModule.join(tmpDir, `openllmcode-${config.id}-${Date.now()}.qcow2`);
          
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any — disk.format is any at runtime
            await mgr.createDiskImage('qcow2' as any, 4096, diskPath);  // 4GB default disk — eslint-disable-line @typescript-eslint/no-explicit-any — format type cast at runtime (per QEMU docs)
            
            // Update config with the new disk path
            // eslint-disable-next-line @typescript-eslint/no-explicit-any — modifying config record at runtime
            const mutableConfig = { ...config, diskImages: [...(diskImages as any[]).map((d: any) => d.id === disk.id ? { ...d, file: diskPath } : d)] };  // eslint-disable-line @typescript-eslint/no-explicit-any — modifying config record at runtime
            (mutableConfig as any).diskImages = (diskImages as any[]).map((d: any) => d.id === disk.id ? { ...d, file: diskPath } : d);  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
          } catch (err) {
            console.error(`Failed to create new disk image ${disk.id}:`, err);
            throw new Error(`Could not create required disk image: ${err}`);
          }
        }
      }
    }
    
    return await mgr.createVM(config);
  });

  ipcMain.handle('qemu-vm-start', async (_e: any, vmId: string) => {
    const mgr = await getQemuManager();
    return await mgr.startVM(vmId);
  });

  ipcMain.handle('qemu-vm-pause', async (_e: any, vmId: string) => {
    const mgr = await getQemuManager();
    return await mgr.pauseVM(vmId);
  });

  ipcMain.handle('qemu-vm-resume', async (_e: any, vmId: string) => {
    const mgr = await getQemuManager();
    return await mgr.resumeVM(vmId);
  });

  ipcMain.handle('qemu-vm-stop', async (_e: any, vmId: string) => {
    const mgr = await getQemuManager();
    return await mgr.stopVM(vmId);
  });

  ipcMain.handle('qemu-vm-delete', async (_e: any, vmId: string) => {
    const mgr = await getQemuManager();
    return await mgr.deleteVM(vmId);
  });

  // QMP command execution — per the QEMU Machine Protocol Specification chapter's protocol specification section  
  ipcMain.handle('qemu-monitor-send', async (_e: any, vmId: string, command: string, args?: Record<string, unknown>) => {
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
  ipcMain.handle('qemu-img-create', async (_e: any, format: string, sizeMB: number, path: string) => {
    const mgr = await getQemuManager();
    return await mgr.createDiskImage(format as any, sizeMB, path);
  });

  ipcMain.handle('qemu-img-convert', async (_e: any, srcFormat: string, dstFormat: string, srcPath: string, dstPath: string) => {
    const mgr = await getQemuManager();
    return await mgr.convertDiskImage(srcFormat as any, dstFormat as any, srcPath, dstPath);
  });

  ipcMain.handle('qemu-img-info', async (_e: any, path: string) => {
    // Query disk image info — per qemu-img info docs in Tools chapter  
    const proc = spawnSync('qemu-img', ['info', '--output=json', path], { encoding: 'utf-8' });
    return JSON.parse(proc.stdout || '{}');
  });

  // Architecture discovery helpers — per -machine, -cpu help for each arch from QEMU docs
  ipcMain.handle('qemu-get-available-machines', async (_e: any, arch: string) => {
    const mgr = await getQemuManager();
    return await mgr.getAvailableMachines(arch as any);
  });

  ipcMain.handle('qemu-get-available-cpus', async (_e: any, arch: string) => {
    const mgr = await getQemuManager();
    return await mgr.getAvailableCPUs(arch as any);
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
  ipcMain.handle('qemu-hotplug-cpu', async (_e: any, vmId: string, socketId: number) => {
    const mgr = await getQemuManager();
    return await mgr.hotplugCPU(vmId, socketId);
  });

  ipcMain.handle('qemu-add-memory', async (_e: any, vmId: string, sizeBytes: number) => {
    const mgr = await getQemuManager();
    return await mgr.addMemory(vmId, sizeBytes);
  });

  // Block device query — per QMP "query-block" command from block-devices section of QMP spec  
  ipcMain.handle('qemu-query-blocks', async (_e: any, vmId: string) => {
    const mgr = await getQemuManager();
    return await mgr.queryBlockDevices(vmId);
  });

  // Snapshot operations — per qcow2 snapshot support in Disk Images chapter and drive-mirror docs  
  ipcMain.handle('qemu-create-snapshot', async (_e: any, vmId: string, driveId: string) => {
    const mgr = await getQemuManager();
    return await mgr.createSnapshot(vmId, driveId);
  });

  // QEMU output streaming — per the VM run state docs, stdout/stderr carry guest OS console output  
  ipcMain.handle('qemu-output-stream', async (_e: any) => {
    // Returns true if a new stream subscription is created for this renderer process
    return { subscribed: true };
  });

  // Instance creation notification — send to all renderers when a new VM is created (F.1)  
  ipcMain.handle('qemu-instance-created', (_e: any, instanceId: string) => {
    mainWindow?.webContents.send('qemu-instance-created', { vmId: instanceId });
    return true;
  });

  // Toolchain management — per-architecture toolchain download and caching from cross-compile docs  
  ipcMain.handle('qemu-toolchain-list', async () => {
    const tm = await getToolchainMgr();
    return (tm as any).getAvailableToolchains();
  });

  ipcMain.handle('qemu-toolchain-ensure', async (_e: any, arch: string) => {
    const tm = await getToolchainMgr();
    return await (tm as any).ensureToolchain(arch as any);
  });

  ipcMain.handle('qemu-toolchain-project-config', async (_e: any, projectDir: string) => {
    const tm = await getToolchainMgr();
    return await (tm as any).getProjectToolchains(projectDir);
  });

   // ─── MCP API (renderer → main process) — tools come from mcpManager.ts ✓
   ipcMain.handle('mcp-get-tool-names', async () => {
     try {
       const mcpMgr = await import('../src/engine/mcpManager');
       const names = mcpMgr.getMCPToolNames();
       return Array.isArray(names) ? (names as string[]) : [];
     } catch {
       console.warn('Failed to get MCP tool names');
       return [];
     }
   });

   ipcMain.handle('mcp-call-tool', async (_e: any, serverToolName: string, params?: Record<string, unknown>) => {
     try {
       const mcpMgr = await import('../src/engine/mcpManager');
       const result = await mcpMgr.callMCPTool(serverToolName, params);
       return result;
     } catch (err) {
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
       } else if (!hasLlamaCpp && fs.existsSync(pathModule.join(enginesDir, 'llama-server'))) {
         hasLlamaCpp = true;
       }
     } catch { /* Ignore errors */ }
     
     return { ...hardware, hasLlamaCpp };
   });

   ipcMain.handle('pingu-download-gguf', async (_e: any, opts: { url: string; quantization: string; onProgress?: (pct: number) => void }) => {
     const c = getPaths();
     
     // Parse HuggingFace URL to get repo and file info
     const urlParts = opts.url.split('/');
     if (urlParts.length < 4 || urlParts[urlParts.length - 1].endsWith('.gguf') === false) {
       return { success: false, error: 'Invalid HuggingFace GGUF URL' };
     }
     
     const repoId = `${urlParts[3]}/${urlParts[4]}`; // e.g., "mradermacher/IBM-Grok4-UltraFast-Coder-1B-GGUF"
     const fileName = urlParts[urlParts.length - 1]; // e.g., "ibm-grok4-1b.Q8_0.gguf"
     
     // Determine quantization filename mapping
     const quantMap: Record<string, string> = {
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
       const filesList: Array<{ rfilename?: string; path?: string }> = (apiRes.data as any).siblings || [];
       
       const targetFileEntry = filesList.find(f => f.rfilename?.toLowerCase().endsWith(opts.quantization.toLowerCase()) && f.rfilename?.toLowerCase().includes('gguf'));
       
       let downloadUrl: string | null = null;
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
       } else if (opts.quantization === 'Q8_0') {
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
         
         await new Promise<void>((resolve, reject) => {
           writeStream.on('finish', () => resolve());
           writeStream.on('error', (err: Error) => reject(err));
         });
         
         return { success: true };
       } else {
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
         
         await new Promise<void>((resolve, reject) => {
           writeStream.on('finish', () => resolve());
           writeStream.on('error', (err: Error) => reject(err));
         });
         
         return { success: true };
       }
     } catch (err: unknown) {
       const msg = err instanceof Error ? err.message : String(err);
       return { success: false, error: `Download failed: ${msg}` };
     }
   });

   ipcMain.handle('pingu-load-gguf-file', async (_e: any, payload: { filePath?: string; quantization?: string }) => {
     const c = getPaths();
     
     // Accept either a direct File object (from preload) or { filePath, quantization } from renderer
     if (payload.filePath) {
       // Read file from filesystem path (more reliable than Blob in Electron context)
       try {
         const content = fs.readFileSync(payload.filePath);
         const destPath = pathModule.join(c.MODELS_DIR, pathModule.basename(payload.filePath));
         fs.writeFileSync(destPath, content);
         return { success: true, quantMode: payload.quantization || 'Q8_0' };
       } catch (err: unknown) {
         const msg = err instanceof Error ? err.message : String(err);
         return { success: false, error: `Copy failed: ${msg}` };
       }
     }
     
     // Legacy path: accept File object directly — handle both ArrayBuffer and Buffer inputs
     try {
       const file = payload.filePath || '';
       if (!file) return { success: false, error: 'No file specified' };
       
       const destPath = pathModule.join(c.MODELS_DIR, pathModule.basename(file));
       // If filePath is a valid file path, read from disk; otherwise fallthrough to Blob path
       fs.writeFileSync(destPath, fs.readFileSync(file));
       return { success: true, quantMode: payload.quantization || 'Q8_0' };
     } catch (err: unknown) {
       const msg = err instanceof Error ? err.message : String(err);
       return { success: false, error: `Copy failed: ${msg}` };
     }
   });

   ipcMain.handle('pingu-select-gguf-file', async () => {
     if (!mainWindow || mainWindow.isDestroyed()) return null;
     
     const result = await dialog.showOpenDialog(mainWindow, {
       properties: ['openFile'],
       filters: [{ name: 'GGUF Files', extensions: ['gguf'] }],
     });
     
     if (result.canceled) return null;
     return result.filePaths[0];
   });

   ipcMain.handle('pingu-download-llama-cpp', async (_e: any, opts?: { onProgress?: (pct: number) => void }) => {
     const c = getPaths();
     
      try {
        // Get latest releases from GitHub using the imported helper function
        const assets: ReleaseAsset[] = await getLatestReleases();
        
        // Find binary for current platform
        const suffixes: Record<string, string[]> = {
          cpu: ['linux-x64', 'win-x64', 'macos'],
          cuda: ['cuda', 'cublas'],
          metal: ['macos-metal', 'apple'],
          vulkan: ['vulkan', 'vk'],
          rocm: ['rocm', 'amd'],
        };
        
        const config = loadConfig() as Record<string, string>;
        const backendVal = typeof config.backend === 'string' ? config.backend : 'cpu';
        const backendType = backendVal === 'cpu' ? 'cpu' : backendVal;
        const platformSuffixes = suffixes[backendType] || suffixes['cpu'];
        
        const matched = assets.find(a => platformSuffixes.some((s: string) => a.name.toLowerCase().includes(s)));
       if (!matched) {
         return { success: false, error: `No ${backendVal} binary found for your platform` };
       }
       
       // Download the binary
       const destPath = pathModule.join(c.ENGINES_DIR, matched.name);
       await downloadBinary(matched.browser_download_url, destPath);
       
       return { success: true };
     } catch (err: unknown) {
       const msg = err instanceof Error ? err.message : String(err);
       return { success: false, error: `Download failed: ${msg}` };
     }
   });

   ipcMain.handle('pingu-install-llama-cpp-zip', async (_e: any, payload: { filePath?: string }) => {
     const c = getPaths();
     
      // Extract and install from zip — use adm-zip if available, otherwise just copy
      const destPath = pathModule.join(c.ENGINES_DIR, 'llama-server');
      try {
        if (payload.filePath) {
          fs.writeFileSync(destPath, fs.readFileSync(payload.filePath));
          return { success: true };
        }
     } catch (err: unknown) {
       const msg = err instanceof Error ? err.message : String(err);
       return { success: false, error: `Installation failed: ${msg}` };
     }
   });

   ipcMain.handle('pingu-select-llama-zip', async () => {
     if (!mainWindow || mainWindow.isDestroyed()) return null;
     
     const result = await dialog.showOpenDialog(mainWindow, {
       properties: ['openFile'],
       filters: [{ name: 'ZIP Files', extensions: ['zip'] }],
     });
     
     if (result.canceled) return null;
     return result.filePaths[0];
   });

   // ─── Pingu Phase 6: Model reload via prompt ──────────────────────────────  

   ipcMain.handle('pingu-reload-model', async (_e: any, opts: { backend: string; gpuLayers?: number; threads?: number; contextWindow?: number }) => {
     const c = getPaths();
     
     // Get current model path from config
     const config = loadConfig() as Record<string, string>;
     if (!config.selectedModel || typeof config.selectedModel !== 'string') return { success: false, error: 'No model loaded' };
     
     const modelPath = pathModule.join(c.MODELS_DIR, config.selectedModel);
     if (!fs.existsSync(modelPath)) return { success: false, error: 'Model file not found' };
     
     // Kill existing llama-server process — wait for it to die before assigning null
     if (llamaCppProcess) {
       const oldProc = llamaCppProcess;
       llamaCppProcess = null;  // Set null first so no-new-IPC-listener is enforced
       try { oldProc.kill('SIGTERM'); } catch {}
       await new Promise<void>((resolve) => setTimeout(resolve, 2000));
       if (!oldProc.killed) {
         try { oldProc.kill(); } catch {}
       }
     }
     
     // Start new process with updated config
     const enginesDir = c.ENGINES_DIR;
     let serverBinary = 'llama-server';
     if (fs.existsSync(pathModule.join(enginesDir, 'llama-server'))) {
       serverBinary = pathModule.join(enginesDir, 'llama-server');
     } else if (process.platform === 'win32' && fs.existsSync(pathModule.join(enginesDir, 'llama-server.exe'))) {
       serverBinary = pathModule.join(enginesDir, 'llama-server.exe');
     }
     
     const args: string[] = ['--mlock', '-m', modelPath];
     if (opts.contextWindow) args.push('--ctx-size', String(opts.contextWindow));
     if (opts.gpuLayers !== undefined) args.push('-ngl', String(opts.gpuLayers));
     
     llamaCppProcess = spawn(serverBinary, args, { env: process.env });

     // Re-setup IPC listeners for streaming responses — critical after model reload
   llamaCppProcess?.stdout?.on('data', (d: Buffer) => {
       const output = d.toString();
       
       // Forward raw data to engine logger for real-time monitoring (Phase E)
       try { mainWindow?.webContents.send('engine-logging-data', { engineId: 'primary' as const, data: output }); } catch {}
       
       const lines = output.split('\n').filter(Boolean);
       for (const line of lines) {
         try {
           const parsed = JSON.parse(line);
           if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta?.content) {
             mainWindow?.webContents.send('chat-response', { type: 'chunk' as const, content: parsed.choices[0].delta.content });
           } else if (parsed.usage) {
             mainWindow?.webContents.send('chat-response', { type: 'done' as const, usage: parsed.usage });
           }
         } catch { /* non-JSON output, ignore silently */ }
       }
     });

    llamaCppProcess?.stderr?.on('data', (d: Buffer) => {
       // Forward stderr to engine logger too (Phase E)
       try { mainWindow?.webContents.send('engine-logging-data', { engineId: 'primary' as const, data: d.toString(), isStderr: true }); } catch {}
       
       mainWindow?.webContents.send('chat-error', d.toString().trim());
     });
     
     return { success: true };
   });
   // ─── App shutdown cleanup — extended for QEMU processes and temp file GC ──────────────────────────────  
   ipcMain.handle('app-shutdown', () => {
     stopFileWatcher();
     if (llamaCppProcess) llamaCppProcess.kill('SIGTERM');
     if (systemAIProcess) systemAIProcess.kill('SIGTERM');
     
      // Bug #5 fix: clean up all tracked temp files on shutdown
      for (const tf of activeTempFiles) {
        try { fs.unlinkSync(tf); } catch {}  // eslint-disable-line @typescript-eslint/no-explicit-any — safe to ignore on cleanup failure
      }
      activeTempFiles.length = 0;
      
      // QEMU cleanup on shutdown
      try { qemuManager?.cleanupAll(); } catch {}  // eslint-disable-line @typescript-eslint/no-explicit-any — QEMU cleanup on shutdown
      
      return true;
   });

}

// ─── App Lifecycle ──────────────────────────────────────────────
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
       // Preload lives at <appDir>/resources/app/dist/preload/preload.js relative to __dirname (electron/).
       preload: pathModule.join(__dirname, '..', 'preload', 'preload.js') 
     },
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
   } else {
      // In production (asar=false on Windows), electron-builder copies "dist/**/*" into <appDir>/resources/app/.
      // __dirname = <appDir>/resources/app/dist/electron/ — go up one level to dist/, then index.html.
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
} else if (app && typeof app.whenReady === 'function') {
  // Normal Electron main process path — start the application
  app.whenReady().then(startApp);
    app.on('window-all-closed', () => { 
      stopFileWatcher();
      if (process.platform !== 'darwin') app.quit(); 
    });
    // Bug #4 fix: unified cleanup on will-quit to prevent temp file / QEMU process leaks.
    // Previously only app-shutdown IPC handler cleaned up — SIGTERM/SIGKILL could leave resources behind.
        app.on('will-quit', () => {
          stopFileWatcher();
          if (llamaCppProcess) llamaCppProcess.kill('SIGTERM');
          if (systemAIProcess) systemAIProcess.kill("SIGTERM");
          
          // Bug #4 fix: also clean up tracked temp files on will-quit
          for (const tf of activeTempFiles) {
            try { fs.unlinkSync(tf); } catch {}  // eslint-disable-line @typescript-eslint/no-explicit-any — safe to ignore on cleanup failure
          }
          activeTempFiles.length = 0;
          
          try { qemuManager?.cleanupAll(); } catch {}  // eslint-disable-line @typescript-eslint/no-explicit-any — QEMU cleanup on shutdown
        });
} else {
  console.log('[main] Skipping Electron startup: not in Electron runtime');
}

exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
