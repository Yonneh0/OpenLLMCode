import * as fs from 'fs';
import * as pathModule from 'path';
import { spawn, spawnSync } from 'child_process';
import * as os from 'os';
import axios from 'axios';
import { app, ipcMain, dialog, BrowserWindow } from 'electron';

const activeTempFiles: string[] = [];

// Constants — process kill wait timeout (ms)
const PROCESS_KILL_WAIT_MS = 2000;
import { type ReleaseAsset, detectHardware, downloadBinary, getLatestReleases } from '../src/engine/manager';

let _engineLogger: typeof import('../src/engine/engineLogger') | null = null;

function resolveResourcePath(relative: string): string {
  if (!app.isPackaged) return pathModule.join(__dirname, '..', relative);
  const resolved = process.resourcesPath + '/' + relative;
  return resolved;
}

let qemuManager: ReturnType<typeof import('../src/engine/qemu/processManager').getQEMUManager> | null = null;
let toolchainManager: ReturnType<typeof import('../src/engine/qemu/toolchainRegistry').getToolchainRegistry> | null = null;

async function getEngineLogger(): Promise<typeof import('../src/engine/engineLogger')> {
  if (_engineLogger === null) {
    const engineLoggerPath = resolveResourcePath(pathModule.posix.join('src', 'engine', 'engineLogger'));
    try {
      _engineLogger = await import(engineLoggerPath);
    } catch (err) {
      console.warn('Engine Logger not available:', err instanceof Error ? err.message : String(err));
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

import type * as Chokidar from 'chokidar';

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

function readDirTree(dirPath: string, depth = 0): any[] {
  if (depth > 10) return [];
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

  import('chokidar').then((chokidar) => {
    const watcherInstance = 'create' in chokidar ? (chokidar as any).create : chokidar.default?.watch;
    if (!watcherInstance) return;
    
    chokidarWatcher = watcherInstance(root, {
      ignored: /node_modules|\.git|dist|build/,
      persistent: true,
      ignoreInitial: true,
    });

    chokidarWatcher!.on('all', (event: string, filePath: string) => {
      if (chokidarWatcher && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('file-tree-changed', { event, path: filePath });
      }
    });
  }).catch(() => {});
}

function stopFileWatcher() {
  if (chokidarWatcher) {
    chokidarWatcher.close();
    chokidarWatcher = null;
  }
}

// Track curl processes for cleanup on shutdown
const activeCurlProcesses: ReturnType<typeof spawn>[] = [];

function registerIpc() {
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

   // PTY Terminal (node-pty)
   const terminalSessions = new Map<string, TerminalSession>();

  ipcMain.handle('terminal-spawn', async () => {
    const ptyModule = await import('node-pty');
    
    const cwd = getProjectRoot();
    if (!cwd) throw new Error('No project root configured');
    
    const shell = process.platform === 'win32' ? (process.env.COMSPEC || 'cmd.exe') : (process.env.SHELL || '/bin/bash');

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
    const pty = terminalSessions.get(sessionId);
    if (pty) pty.write(data);
    return true;
  });

   ipcMain.handle('terminal-resize', async (_e: any, sessionId: string, cols: number, rows: number): Promise<boolean> => {
    const pty = terminalSessions.get(sessionId);
    if (pty) pty.resize(cols, rows);
    return true;
  });

   ipcMain.handle('terminal-kill', async (_e: any, sessionId: string | 'all'): Promise<boolean> => {
    if (sessionId === 'all') {
      for (const [id, pty] of terminalSessions) {
        try { pty.kill(); } catch {}
        terminalSessions.delete(id);
      }
      return true;
    }
    
    const pty = terminalSessions.get(sessionId);
    if (!pty) return false;
    
    try { pty.kill(); } catch {}
    terminalSessions.delete(sessionId);
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
    if (!cwd) throw new Error('No project root configured');
    
    await new Promise<string>((resolve) => {
      spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
            [process.platform === 'win32' ? '/c' : '-c', `cd "${cwd}" && git add .`],
            { env: process.env, cwd }).on('close', (code) => {
        if (code !== 0) return resolve(`git-add failed with code ${code}`);
      });
    });
    
    const result = spawnSync('git', ['commit', '-m', message], { cwd, env: process.env });
    return result.stdout ? 'committed' : `Git commit failed with code ${result.status}`;
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
       if (process.platform === 'win32') {
         // Use array-based argument passing for findstr to prevent shell injection
         return spawnSync('cmd.exe', [
           '/c', 'findstr', '/s', '/n', '/r', payload.regex, `"${searchPath}\\*"`
         ], { encoding: 'utf-8', maxBuffer: 1024 * 1024 }).stdout?.trim() || '';
       } else {
         // Use array-based argument passing for grep to prevent shell injection — no shell interpolation.
         const args = ['-rnE'];
         if (payload.filePattern) {
           const safeFilePattern = payload.filePattern.replace(/[^a-zA-Z0-9._*?\/\\-]/g, '');
           if (safeFilePattern.length > 0 && safeFilePattern.length < 256) {
             args.push('--include=' + safeFilePattern);
           }
         }
         args.push(payload.regex, searchPath);
         return spawnSync('grep', args, { cwd, encoding: 'utf-8', maxBuffer: 1024 * 1024 }).stdout?.trim() || '';
       }
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
  const LlamaServerPort = 8080;

  function waitForServer(port: number, maxRetries = 30): Promise<boolean> {
    return new Promise((resolve) => {
      let retries = 0;
      const attempt = () => {
        import('net').then((netModule) => {
          const socket = netModule.createConnection(port, '127.0.0.1', () => {
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

       // Null out first to prevent new events from going to stale reference
         if (llamaCppProcess) {
           const oldProc = llamaCppProcess;
           llamaCppProcess = null;
           try { oldProc.kill('SIGTERM'); } catch (err) { console.error('Failed to kill existing llama-server:', err instanceof Error ? err.message : String(err)); }
           await new Promise<void>((resolve) => setTimeout(resolve, PROCESS_KILL_WAIT_MS));
           if (!oldProc.killed) {
             try { oldProc.kill('SIGKILL'); } catch (err) { console.error('Failed to SIGKILL existing llama-server:', err instanceof Error ? err.message : String(err)); }
           }
         }

        const stdoutListener = (d: Buffer) => {
          const output = d.toString();
          
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
            } catch {}
          }
        };

        const stderrListener = (d: Buffer) => {
          try { mainWindow?.webContents.send('engine-logging-data', { engineId: 'primary' as const, data: d.toString(), isStderr: true }); } catch {}
          
          mainWindow?.webContents.send('chat-error', d.toString().trim());
        };

         const exitHandler = (code: number, signal: string | null) => {
           if (!llamaCppProcess?.killed) {
             mainWindow?.webContents.send('chat-response', { type: 'done' as const });
           }
           llamaCppProcess = null;
         };

      const enginesDir = c.ENGINES_DIR;
     let serverBinary = 'llama-server';
     if (fs.existsSync(pathModule.join(enginesDir, 'llama-server'))) {
       serverBinary = pathModule.join(enginesDir, 'llama-server');
     } else if (process.platform === 'win32' && fs.existsSync(pathModule.join(enginesDir, 'llama-server.exe'))) {
       serverBinary = pathModule.join(enginesDir, 'llama-server.exe');
     }

     llamaCppProcess = spawn(serverBinary, ['--mlock', '-m', modelPath, '--port', String(LlamaServerPort), '--host', '127.0.0.1'], { env: process.env });

    if (llamaCppProcess?.stdout) llamaCppProcess.stdout.on('data', stdoutListener);
     if (llamaCppProcess?.stderr) llamaCppProcess.stderr.on('data', stderrListener);
     llamaCppProcess!.on('exit', exitHandler);

      return 'started';
    });

    // Engine Logging — real-time monitoring of both engines during reasoning blocks
    let engineLoggerConfig = { enableDiskLogging: true, maxMemoryEntriesPerEngine: 10000 };
    
    ipcMain.handle('engine-logging-start', async (_e: any, engineId: 'primary' | 'systemAI') => {
      return { started: true, sessionId: `session-${Date.now()}` };
    });

    ipcMain.handle('engine-logging-stop', async (_e: any, engineId: 'primary' | 'systemAI') => {
      return { stopped: true };
    });

    ipcMain.handle('engine-logging-get-log-entries', async (_e: any, engineId: 'primary' | 'systemAI', includeDisk: boolean) => {
      const logger = await getEngineLogger();
      return logger.getEngineLogEntries(engineId, includeDisk).map(entry => ({ ...entry }));
    });

    ipcMain.handle('engine-logging-clear-log-entries', async (_e: any, engineId: 'primary' | 'systemAI') => {
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

   ipcMain.on('engine-logging-data', (_e: any, event: { engineId: 'primary' | 'systemAI'; data: string; isStderr?: boolean }) => {
     try { mainWindow?.webContents.send('engine-logging-log', { engineId: event.engineId, level: event.isStderr ? 'warn' : 'trace', message: event.data }); } catch {}
   });

   ipcMain.handle('chat-send-message', async (_e: any, message: string): Promise<'ok' | 'no-engine'> => {
     if (!llamaCppProcess) return 'no-engine';
      try {
        const tmpFile = pathModule.join(appDataPath || os.tmpdir(), `llama-request-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.json`);
        fs.writeFileSync(tmpFile, JSON.stringify({ messages: [{ role: 'user' as const, content: message }], stream: true, temperature: 0.7, top_p: 0.9 }), 'utf-8');
        
        activeTempFiles.push(tmpFile);

        const tmpFileArg = process.platform === 'win32' ? `"${tmpFile}"` : `\'${tmpFile}\'`;
        const curlProc = spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', [process.platform === 'win32' ? '/c' : '-c', `curl -s -N -X POST "http://127.0.0.1:${LlamaServerPort}/v1/chat/completions" -H "Content-Type: application/json" --data-binary @${tmpFileArg}`], { env: process.env });
        activeCurlProcesses.push(curlProc);
        return 'ok';
     } catch (err: unknown) { throw err; }
   });

   ipcMain.handle('chat-stop', (): boolean => {
     if (!llamaCppProcess) return false;
     try { llamaCppProcess.kill('SIGTERM'); } catch {}
     setTimeout(() => { 
       if (llamaCppProcess && !llamaCppProcess.killed) {
         try { llamaCppProcess.kill('SIGKILL'); } catch {}
       }
       llamaCppProcess = null;
     }, PROCESS_KILL_WAIT_MS);
     return true;
   });

   // System AI — use full path to llama-server binary from engines dir
  const SystemAIPort = 8081;

  ipcMain.handle('systemai-start', async (_e: any, modelPath: string) => {
      let stdoutListener: (() => void) | undefined;
      let stderrListener: (() => void) | undefined;
      let exitHandler: ((code: number, signal: string | null) => void) | undefined;

      if (systemAIProcess) {
       await new Promise<void>((resolve) => {
         try { systemAIProcess!.kill('SIGTERM'); } catch (err) { console.error('Failed to kill existing System AI process:', err instanceof Error ? err.message : String(err)); }
         setTimeout(() => {
           if (systemAIProcess && !systemAIProcess.killed) {
             try { systemAIProcess.kill('SIGKILL'); } catch (err) { console.error('Failed to SIGKILL existing System AI process:', err instanceof Error ? err.message : String(err)); }
           }
           resolve();
         }, PROCESS_KILL_WAIT_MS);
       });
       systemAIProcess = null;
     }

     const c = getPaths();
     const enginesDir = c.ENGINES_DIR;
     let serverBinary = 'llama-server';
     if (fs.existsSync(pathModule.join(enginesDir, 'llama-server'))) {
       serverBinary = pathModule.join(enginesDir, 'llama-server');
     } else if (process.platform === 'win32' && fs.existsSync(pathModule.join(enginesDir, 'llama-server.exe'))) {
       serverBinary = pathModule.join(enginesDir, 'llama-server.exe');
     }

     systemAIProcess = spawn(serverBinary, ['--mlock', '-m', modelPath, '--port', String(SystemAIPort), '--host', '127.0.0.1'], { env: process.env });

  systemAIProcess?.stdout?.on('data', (d: Buffer) => {
         const output = d.toString();

        try { mainWindow?.webContents.send('engine-logging-data', { engineId: 'systemAI' as const, data: output }); } catch {}

        for (const line of output.split('\n').filter(Boolean)) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta?.content) {
              mainWindow?.webContents.send('systemai-response', { type: 'chunk' as const, content: parsed.choices[0].delta.content });
            } else if (parsed.usage) {
              mainWindow?.webContents.send('systemai-response', { type: 'done' as const, usage: parsed.usage });
            }
          } catch {}
        }
      });

   systemAIProcess?.stderr?.on('data', (d: Buffer) => {
       try { mainWindow?.webContents.send('engine-logging-data', { engineId: 'systemAI' as const, data: d.toString(), isStderr: true }); } catch {}
     });

  systemAIProcess.on('exit', (code, signal) => {
       if (!systemAIProcess?.killed) {
         mainWindow?.webContents.send('systemai-response', { type: 'done' as const });
       }
       systemAIProcess = null;
     });

    return true;
 });

   ipcMain.handle('systemai-send-message', async (_e: any, message: string): Promise<'ok' | 'no-system-ai'> => {
     if (!systemAIProcess) return 'no-system-ai';
       try {
         const tmpFile = pathModule.join(appDataPath || os.tmpdir(), `systemai-request-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.json`);
         fs.writeFileSync(tmpFile, JSON.stringify({ messages: [{ role: 'user' as const, content: message }], stream: true, temperature: 0.3, top_p: 0.9 }), 'utf-8');

         activeTempFiles.push(tmpFile);

         const tmpFileArg = process.platform === 'win32' ? `"${tmpFile}"` : `\'${tmpFile}\'`;
         const curlProc = spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', [process.platform === 'win32' ? '/c' : '-c', `curl -s -N -X POST "http://127.0.0.1:${SystemAIPort}/v1/chat/completions" -H "Content-Type: application/json" --data-binary @${tmpFileArg}`], { env: process.env });
         activeCurlProcesses.push(curlProc);
       return 'ok';
     } catch (err: unknown) { throw err; }
   });

   ipcMain.handle('systemai-stop', (): boolean => {
     if (!systemAIProcess) return false;
     try { systemAIProcess.kill('SIGTERM'); } catch {}
     setTimeout(() => { 
       if (systemAIProcess && !systemAIProcess.killed) {
         try { systemAIProcess.kill('SIGKILL'); } catch {}
       }
       systemAIProcess = null;
     }, PROCESS_KILL_WAIT_MS);
     return true;
   });

   ipcMain.handle('dialog-select-folder', async (_e: any, _parentWindow: BrowserWindow | null): Promise<string | null> => {
       if (!mainWindow || mainWindow.isDestroyed()) return null;
       
       const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
     if (result.canceled) return null;
     return result.filePaths[0];
   });

   ipcMain.handle('dialog-select-file', async (_e: any, _parentWindow: BrowserWindow | null): Promise<string | null> => {
       if (!mainWindow || mainWindow.isDestroyed()) return null;
       
       const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
     if (result.canceled) return null;
     return result.filePaths[0];
   });

   ipcMain.handle('electron-store-get-config', () => loadConfig());
    ipcMain.handle('electron-store-set-config', (_e: any, key: string, value: unknown): boolean => {
       try {
         const parts = key.split('.');
         if (parts.length === 1) {
           const cfg = loadConfig();
           (cfg as any)[key] = value;
           saveConfig(cfg);
           return true;
         } else {
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
         return false;
       }
     });

   // QEMU/KVM Simulation Layer IPC handlers
   
   async function getQemuManager(): Promise<any> { 
     if (!qemuManager) {
       const pm = await import('../src/engine/qemu/processManager');
       qemuManager = pm.getQEMUManager();
     }
     return (qemuManager as any); 
   }

   async function getToolchainMgr(): Promise<any> { 
     if (!toolchainManager) {
       const tm = await import('../src/engine/qemu/toolchainRegistry');
       toolchainManager = tm.getToolchainRegistry();
     }
     return (toolchainManager as any); 
   }

   ipcMain.handle('qemu-vm-create', async (_e: any, config: Record<string, unknown>) => {
     const mgr = await getQemuManager();
     
     const diskImages = (config as any).diskImages as any[] | undefined; 
      let updatedConfig = config;
      if (Array.isArray(diskImages)) {
        for (const disk of diskImages) {
          if (disk.isNew && !disk.file) {
            const tmpDir = process.platform === 'win32' ? (process.env.TEMP ?? os.tmpdir()) 
              : (process.env.TMPDIR || os.tmpdir());
            const diskPath = pathModule.join(tmpDir, `openllmcode-${config.id}-${Date.now()}.qcow2`);
            
            try {
              await mgr.createDiskImage('qcow2' as any, 4096, diskPath);
              
              updatedConfig = { ...config, diskImages: [...(diskImages as any[]).map((d: any) => d.id === disk.id ? { ...d, file: diskPath } : d)] };
            } catch (err) {
              console.error(`Failed to create new disk image ${disk.id}:`, err);
              throw new Error(`Could not create required disk image: ${err}`);
            }
          }
        }
      }
     
     return await mgr.createVM(updatedConfig);
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

   ipcMain.handle('qemu-monitor-send', async (_e: any, vmId: string, command: string, args?: Record<string, unknown>) => {
     const mgr = await getQemuManager();
     return await mgr.executeQMPCommand(vmId, command, args);
   });

   ipcMain.handle('qemu-vm-list', async () => {
     const mgr = await getQemuManager();
     return {
       count: await mgr.getInstanceCount(),
       running: await mgr.getRunningInstances(),
     };
   });

   ipcMain.handle('qemu-img-create', async (_e: any, format: string, sizeMB: number, path: string) => {
     const mgr = await getQemuManager();
     return await mgr.createDiskImage(format as any, sizeMB, path);
   });

   ipcMain.handle('qemu-img-convert', async (_e: any, srcFormat: string, dstFormat: string, srcPath: string, dstPath: string) => {
     const mgr = await getQemuManager();
     return await mgr.convertDiskImage(srcFormat as any, dstFormat as any, srcPath, dstPath);
   });

   ipcMain.handle('qemu-img-info', async (_e: any, path: string) => {
     const proc = spawnSync('qemu-img', ['info', '--output=json', path], { encoding: 'utf-8' });
     try {
       return JSON.parse(proc.stdout || '{}');
     } catch (err: unknown) {
       console.error(`Failed to parse qemu-img info for "${path}":`, err instanceof Error ? err.message : String(err));
       return {};
     }
   });

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

   ipcMain.handle('qemu-hotplug-cpu', async (_e: any, vmId: string, socketId: number) => {
     const mgr = await getQemuManager();
     return await mgr.hotplugCPU(vmId, socketId);
   });

   ipcMain.handle('qemu-add-memory', async (_e: any, vmId: string, sizeBytes: number) => {
     const mgr = await getQemuManager();
     return await mgr.addMemory(vmId, sizeBytes);
   });

   ipcMain.handle('qemu-query-blocks', async (_e: any, vmId: string) => {
     const mgr = await getQemuManager();
     return await mgr.queryBlockDevices(vmId);
   });

   ipcMain.handle('qemu-create-snapshot', async (_e: any, vmId: string, driveId: string) => {
     const mgr = await getQemuManager();
     return await mgr.createSnapshot(vmId, driveId);
   });

   ipcMain.handle('qemu-output-stream', async (_e: any) => {
     return { subscribed: true };
   });

   ipcMain.handle('qemu-instance-created', (_e: any, instanceId: string) => {
     mainWindow?.webContents.send('qemu-instance-created', { vmId: instanceId });
     return true;
   });

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

    // MCP API — tools come from mcpManager.ts
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

   ipcMain.handle('pingu-get-hardware-info', async () => {
     const hardware = await detectHardware();
     
     let hasLlamaCpp = false;
     try {
       const c = getPaths();
       const enginesDir = c.ENGINES_DIR;
       
       if (process.platform === 'win32' && fs.existsSync(pathModule.join(enginesDir, 'llama-server.exe'))) {
         hasLlamaCpp = true;
       } else if (!hasLlamaCpp && fs.existsSync(pathModule.join(enginesDir, 'llama-server'))) {
         hasLlamaCpp = true;
       }
     } catch {}
     
     return { ...hardware, hasLlamaCpp };
   });

   ipcMain.handle('pingu-download-gguf', async (_e: any, opts: { url: string; quantization: string; onProgress?: (pct: number) => void }) => {
     const c = getPaths();
     
     const urlParts = opts.url.split('/');
     if (urlParts.length < 4 || urlParts[urlParts.length - 1].endsWith('.gguf') === false) {
       return { success: false, error: 'Invalid HuggingFace GGUF URL' };
     }
     
     const repoId = `${urlParts[3]}/${urlParts[4]}`;
     const fileName = urlParts[urlParts.length - 1];
     
     const quantMap: Record<string, string> = {
       'Q4_K_M': (urlParts[5] || fileName).replace(/\.gguf$/, '-Q4_K_M.gguf'),
       'Q5_K_M': (urlParts[5] || fileName).replace(/\.gguf$/, '-Q5_K_M.gguf'),
       'Q6_K': (urlParts[5] || fileName).replace(/\.gguf$/, '-Q6_K.gguf'),
       'Q8_0': (urlParts[5] || fileName).replace(/\.gguf$/, '.gguf'),
     };
     
     const targetFile = quantMap[opts.quantization] || urlParts[urlParts.length - 1];
     const destPath = pathModule.join(c.MODELS_DIR, targetFile);
     
     try {
       const apiRes = await axios.get(`https://huggingface.co/api/models/${repoId}`);
       const filesList: Array<{ rfilename?: string; path?: string }> = (apiRes.data as any).siblings || [];
       
       const targetFileEntry = filesList.find(f => f.rfilename?.toLowerCase().endsWith(opts.quantization.toLowerCase()) && f.rfilename?.toLowerCase().includes('gguf'));
       
       let downloadUrl: string | null = null;
       if (targetFileEntry) {
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
         
         fs.writeFileSync(destPath, Buffer.from(blobRes.data));
         return { success: true };
       } else if (opts.quantization === 'Q8_0') {
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
       } else {
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
     
     if (payload.filePath) {
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
        const assets: ReleaseAsset[] = await getLatestReleases();
        
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

   // Model reload via prompt
   
   ipcMain.handle('pingu-reload-model', async (_e: any, opts: { backend: string; gpuLayers?: number; threads?: number; contextWindow?: number }) => {
     const c = getPaths();
     
     const config = loadConfig() as Record<string, string>;
     if (!config.selectedModel || typeof config.selectedModel !== 'string') return { success: false, error: 'No model loaded' };
     
     const modelPath = pathModule.join(c.MODELS_DIR, config.selectedModel);
     if (!fs.existsSync(modelPath)) return { success: false, error: 'Model file not found' };
      
     if (llamaCppProcess) {
       const oldProc = llamaCppProcess;
       
       // Null out first to prevent new events from going to stale reference
       llamaCppProcess = null;
       try { oldProc.kill('SIGTERM'); } catch {}
       await new Promise<void>((resolve) => setTimeout(resolve, PROCESS_KILL_WAIT_MS));
       if (!oldProc.killed) {
         try { oldProc.kill('SIGKILL'); } catch {}
       }
     }
     
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

      const stdoutListener = (d: Buffer) => {
        const output = d.toString();
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
          } catch {}
        }
      };

      const stderrListener = (d: Buffer) => {
        try { mainWindow?.webContents.send('engine-logging-data', { engineId: 'primary' as const, data: d.toString(), isStderr: true }); } catch {}
        mainWindow?.webContents.send('chat-error', d.toString().trim());
      };

   if (llamaCppProcess?.stdout) llamaCppProcess.stdout.on('data', stdoutListener);
     if (llamaCppProcess?.stderr) llamaCppProcess.stderr.on('data', stderrListener);

     return { success: true };
   });
}

function doCleanup() {
  stopFileWatcher();

  for (const proc of [llamaCppProcess, systemAIProcess] as Array<ReturnType<typeof spawn> | null>) {
    if (!proc || proc.killed) continue;
    try { proc.kill('SIGTERM'); } catch {}
    setTimeout(() => {
      if (proc && !proc.killed) {
        try { proc.kill('SIGKILL'); } catch {}
      }
    }, PROCESS_KILL_WAIT_MS);
  }

  // Kill all tracked curl processes for cleanup on shutdown
  for (const curlProc of activeCurlProcesses) {
    if (!curlProc.killed) {
      try { curlProc.kill('SIGTERM'); } catch {}
    }
  }
  activeCurlProcesses.length = 0;

  llamaCppProcess = null;
  systemAIProcess = null;

  for (const tf of activeTempFiles) { try { fs.unlinkSync(tf); } catch {} }
  activeTempFiles.length = 0;
  try { qemuManager?.cleanupAll(); } catch {}
}

ipcMain.handle('app-shutdown', () => { doCleanup(); return true; });

// Unhandled Exception Handler (prevents main process crashes)
process.on('uncaughtException', (err: Error) => {
  console.error('Unhandled exception in main process:', err);
});

// Preload script path resolution — compiled to dist/preload/preload.js by tsconfig.preload.json
function getPreloadPath(): string {
  if (!app.isPackaged) {
    // Development: preload is in the source tree
    return pathModule.join(__dirname, '..', 'electron', 'preload.ts');
  }
  // Production: process.resourcesPath points to the app's resources directory.
  // The preload must be unpacked (asarUnpack) so Electron can load it from file:// URL.
  const packedPreload = pathModule.join(process.resourcesPath, 'preload.js');
  if (fs.existsSync(packedPreload)) return packedPreload;
  
  // Fallback: check dist/preload location when asar is disabled on Windows
  const unpackedPreload = pathModule.join(process.resourcesPath, 'dist', 'preload', 'preload.js');
  return fs.existsSync(unpackedPreload) ? unpackedPreload : packedPreload;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1e1e2e',
    webPreferences: { 
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      preload: getPreloadPath(),
    },
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
   } else {
        mainWindow.loadFile(pathModule.join(__dirname, '..', 'index.html'));
     }

  mainWindow.on('closed', () => { mainWindow = null; });
}

function startApp() {
  ensureDirs();
  registerIpc();
  createMainWindow();
}

if (process.env.ELECTRON_RUN_AS_NODE || process.type === 'renderer') {
  console.log('[main] Skipping Electron startup: running in Node.js context');
} else if (app && typeof app.whenReady === 'function') {
  app.whenReady().then(startApp);
  app.on('window-all-closed', () => { 
    doCleanup();
    if (process.platform !== 'darwin') app.quit(); 
  });
  app.on('will-quit', () => { doCleanup(); });
} else {
  console.log('[main] Skipping Electron startup: not in Electron runtime');
}
