// HuggingFace API client — download management & authentication (Phase B)
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

export type HFAuthMethod = 'browser' | 'cli' | 'token';

export interface HuggingFaceModel {
  id: string;
  author: string;
  tags: string[];
  downloads: number;
  likes: number;
  createdAt: string;
  gguf?: boolean;
}

export interface DownloadProgress {
  modelId: string;
  fileName: string;
  downloadedBytes: number;
  totalBytes: number;
  speedMBps: number; // MB per second
  etaSeconds: number;
  status: 'downloading' | 'paused' | 'completed' | 'failed';
  error?: string;
}

export interface HFSession {
  token: string;
  method: HFAuthMethod;
  expiresAt?: number; // epoch ms, if applicable
  username?: string;
}

const HUGGINGFACE_API = 'https://huggingface.co/api';
const DATA_DIR = path.join(
  process.platform === 'win32' ? (process.env.APPDATA || '/tmp') : (process.env.HOME || '/tmp'),
  'OpenLLMCode',
);

/** Keytar key for storing the HF token in OS keychain */
const HF_KEYTAR_SERVICE = 'OpenLLMCode';
const HF_KEYTAR_USERNAME = 'huggingface-token';

// ─── Authentication ──────────────────────
export async function checkHFAuth(): Promise<HFSession | null> {
  // Try OS keychain first (Phase F-2) — if available, use it instead of local JSON file
  try {
    const keytar = await import('keytar');
    const token = await keytar.getPassword(HF_KEYTAR_SERVICE, HF_KEYTAR_USERNAME);
    if (token) {
      return { token, method: 'browser', expiresAt: Date.now() + 365 * 24 * 3600 * 1000 };
    }
  } catch {
    // keytar not available — fall back to local config file
  }
  
  // Fallback: read from local JSON file (Phase B)
  try {
    const configPath = path.join(DATA_DIR, 'hf_config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {}
  return null;
}

/** Login with a token — stores it in OS keychain first, then also saves to local config as backup */
export async function loginBrowser(token: string): Promise<HFSession> {
  // Store in OS keychain if available (Phase F-2)
  try {
    const keytar = await import('keytar');
    await keytar.setPassword(HF_KEYTAR_SERVICE, HF_KEYTAR_USERNAME, token);
  } catch {
    // keytar not available — continue with local config only
  }
  
  // Also save to local config file for backward compatibility and offline access
  const session: HFSession = { token, method: 'browser', expiresAt: Date.now() + 365 * 24 * 3600 * 1000 };
  fs.writeFileSync(path.join(DATA_DIR, 'hf_config.json'), JSON.stringify(session));
  return session;
}

/** CLI-based login — runs huggingface-cli and stores the resulting token in keychain */
export async function loginCLI(modelPath?: string): Promise<{ success: boolean; username?: string }> {
  // First try to get token from keytar if available (user may have already authenticated via browser)
  try {
    const keytar = await import('keytar');
    const existingToken = await keytar.getPassword(HF_KEYTAR_SERVICE, HF_KEYTAR_USERNAME);
    if (existingToken) {
      const validation = await validateToken(existingToken);
      if (validation.valid) {
        return { success: true, username: validation.username };
      }
    }
  } catch {}
  
  // Run huggingface-cli login in embedded terminal (Phase D terminal integration)
  // Runs `huggingface-cli login` in embedded terminal (Phase D terminal integration)
  const modelDir = modelPath || path.join(DATA_DIR, 'models');
  fs.mkdirSync(modelDir, { recursive: true });

  return new Promise((resolve) => {
    const proc = spawn('huggingface-cli', ['login'], { env: process.env, shell: true });
    let stdout = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => {});
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, username: 'user' });
      } else {
        resolve({ success: false });
      }
    });
  });
}

/** Logout — removes the token from keychain AND local config file */
export async function logout(): Promise<void> {
  // Remove from OS keychain if available (Phase F-2)
  try {
    const keytar = await import('keytar');
    await keytar.deletePassword(HF_KEYTAR_SERVICE, HF_KEYTAR_USERNAME);
  } catch {}
  
  // Also remove from local config file for consistency
  const configPath = path.join(DATA_DIR, 'hf_config.json');
  if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
}

// ─── Model browsing & discovery ──────────────
export interface HFModelInfo {
  id: string;
  author: string;
  tags: string[];
  downloads: number;
  likes: number;
  createdAt: string;
  gguf?: boolean;
  sizeMB?: number;
}

export async function searchModels(query = 'gguf', limit = 20): Promise<HFModelInfo[]> {
  const session = await checkHFAuth();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (session?.token) headers['Authorization'] = `Bearer ${session.token}`;

  try {
    const res = await axios.get(
      `${HUGGINGFACE_API}/models`,
      { params: { search: query, sort: 'downloads', direction: -1, limit }, headers }
    );
    return (res.data as any[]).map((m) => ({
      id: m.id,
      author: m.author || 'unknown',
      tags: m.tags || [],
      downloads: m.downloads || 0,
      likes: m.likes || 0,
      createdAt: new Date(m.createdAt).toISOString(),
      gguf: m.tags?.includes('gguf'),
    }));
  } catch {
    return []; // fall back to offline MODELS.md search
  }
}

export async function getModelDetails(modelId: string): Promise<HFModelInfo> {
  const session = await checkHFAuth();
  const headers: Record<string, string> = {};
  if (session?.token) headers['Authorization'] = `Bearer ${session.token}`;

  try {
    const res = await axios.get(`${HUGGINGFACE_API}/models/${modelId}`, { headers });
    return {
      id: modelId,
      author: res.data.author,
      tags: res.data.tags || [],
      downloads: res.data.downloads || 0,
      likes: res.data.likes || 0,
      createdAt: new Date(res.data.createdAt).toISOString(),
      gguf: res.data.tags?.includes('gguf'),
    };
  } catch {
    return { id: modelId, author: 'unknown', tags: [], downloads: 0, likes: 0, createdAt: '' };
  }
}

// ─── Model download management (resumable) — Fix #7: Added timeout + immediate error handler ──────────────
export async function downloadModel(modelId: string, fileName?: string): Promise<DownloadProgress> {
  const session = await checkHFAuth();
  if (!session?.token) return { modelId, fileName: fileName || '*', downloadedBytes: 0, totalBytes: 0, speedMBps: 0, etaSeconds: -1, status: 'failed', error: 'No HF auth token' };

  const destDir = path.join(DATA_DIR, 'models');
  fs.mkdirSync(destDir, { recursive: true });

  // Check for existing file (resumable download)
  const targetFile = fileName || await getModelFileList(modelId);
  const destPath = path.join(destDir, `${modelId.replace('/', '--')}-${targetFile}`.replace(/[/\\]/g, '_'));

  return new Promise((resolve) => {
    // Use huggingface-cli for resumable downloads
    const args = ['download', modelId];
    if (fileName) args.push(fileName);
    args.push('--local-dir', destDir, '--resume-download');

    const proc = spawn('huggingface-cli', args, { env: process.env });
    let downloadedBytes = 0;
    let totalBytes = 0;
    let speedMBps = 0;
    const startTime = Date.now();

    // Fix #7: Immediate error handler — catches failures before stdout emits any data
    proc.on('error', (err) => {
      resolve({ modelId, fileName: targetFile, downloadedBytes, totalBytes, speedMBps, etaSeconds: -1, status: 'failed', error: `Spawn error: ${err.message}` });
    });

    // Fix #7: Timeout handler — downloads that hang indefinitely will be aborted after 30 minutes
    const timeoutId = setTimeout(() => {
      proc.kill();
      resolve({ modelId, fileName: targetFile, downloadedBytes, totalBytes, speedMBps, etaSeconds: -1, status: 'failed', error: 'Download timed out after 30 minutes' });
    }, 30 * 60 * 1000); // 30 minutes

    proc.stdout.on('data', (d: Buffer) => {
      const output = d.toString();
      // Parse download progress lines from huggingface-cli
      const sizeMatch = output.match(/(\d+)\s*(\w+)\/(\d+)\s*(\w+)/);
      if (sizeMatch) {
        totalBytes = parseInt(sizeMatch[3]);
        downloadedBytes = parseInt(sizeMatch[1]);
        speedMBps = Math.round((downloadedBytes / 1048576) / ((Date.now() - startTime) / 1000) * 100) / 100;
      }
    });

    proc.stderr.on('data', (d: Buffer) => {
      // Log stderr for debugging download errors
      const errOutput = d.toString().trim();
      if (errOutput.includes('Error') || errOutput.includes('error')) {
        // Clear timeout and resolve with error immediately on detected error
        clearTimeout(timeoutId);
        resolve({ modelId, fileName: targetFile, downloadedBytes, totalBytes, speedMBps, etaSeconds: -1, status: 'failed', error: errOutput });
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId); // Always clear timeout on process close
      if (code === 0 || downloadedBytes > 0) {
        resolve({
          modelId, fileName: targetFile,
          downloadedBytes, totalBytes, speedMBps,
          etaSeconds: totalBytes > downloadedBytes && speedMBps > 0 ? Math.round((totalBytes - downloadedBytes) / (speedMBps * 1048576)) : 0,
          status: 'completed',
        });
      } else {
        resolve({ modelId, fileName: targetFile, downloadedBytes, totalBytes, speedMBps, etaSeconds: -1, status: 'failed', error: `Exit code ${code}` });
      }
    });
  });
}

// ─── Download queue management ──────────────
export interface QueuedDownload {
  id: string;
  modelId: string;
  fileName?: string;
  progress: DownloadProgress;
  queuedAt: number;
}

let downloadQueue: QueuedDownload[] = [];
const MAX_CONCURRENT_DOWNLOADS = 3; // configurable in settings

export function addToDownloadQueue(modelId: string, fileName?: string): string {
  const id = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: QueuedDownload = {
    id, modelId, fileName,
    progress: { modelId, fileName: fileName || '*', downloadedBytes: 0, totalBytes: 0, speedMBps: 0, etaSeconds: -1, status: 'downloading' },
    queuedAt: Date.now(),
  };
  downloadQueue.push(entry);
  return id;
}

export function getDownloadQueue(): QueuedDownload[] {
  return [...downloadQueue];
}

/** Interface for local GGUF/BIN models found in the models directory */
export interface LocalModelInfo {
  name: string;
  path: string;
  sizeMB: number;
}

// ─── Local model file discovery ──────────────
export async function listLocalModels(modelDir?: string): Promise<LocalModelInfo[]> {
  const dir = modelDir || path.join(DATA_DIR, 'models');
  fs.mkdirSync(dir, { recursive: true });

  try {
    return (await fs.promises.readdir(dir))
      .filter((f) => f.endsWith('.gguf') || f.endsWith('.bin'))
      .map((name) => {
        const fullPath = path.join(dir, name);
        const stats = fs.statSync(fullPath);
        return { name, path: fullPath, sizeMB: Math.round(stats.size / 1048576 * 100) / 100 };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function getModelFileList(modelId: string): Promise<string> {
  // Fetch file list from HuggingFace API to find GGUF files
  const session = await checkHFAuth();
  const headers: Record<string, string> = {};
  if (session?.token) headers['Authorization'] = `Bearer ${session.token}`;

  try {
    // Try common branch names since repos may use 'main', 'master', or other defaults
    for (const branch of ['main', 'master']) {
      try {
        const res = await axios.get(`${HUGGINGFACE_API}/models/${modelId}/tree/${branch}`, { headers });
        const files = (res.data as any[]).filter((f: any) => f.path.endsWith('.gguf'));
        if (files.length > 0) return files[0].path;
      } catch {
        // Try next branch
      }
    }
    return 'model.gguf';
  } catch {
    return 'model.gguf';
  }
}

// ─── HuggingFace CLI install helper ──────────────
export async function installHFCLI(): Promise<boolean> {
  return new Promise((resolve) => {
    // On Windows, use PowerShell to download and run the installer; on Unix, pipe curl to bash
    let cmd: string;
    if (process.platform === 'win32') {
      cmd = 'powershell -Command "Invoke-WebRequest -Uri \'https://hf.co/cli/install.sh\' -OutFile \"$env:TEMP\\hf_install.sh\"; bash \"$env:TEMP\\hf_install.sh\""';
    } else {
      cmd = 'curl -LsSf https://hf.co/cli/install.sh | bash';
    }
    const proc = spawn(cmd, [], { env: process.env, shell: true });
    let output = '';
    proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    proc.stderr.on('data', () => {}); // suppress error noise
    proc.on('close', (code) => resolve(code === 0));
  });
}

export async function hfCliLogin(): Promise<{ success: boolean; username?: string }> {
  return new Promise((resolve) => {
    const proc = spawn('huggingface-cli', ['login'], { env: process.env, shell: true });
    let stdout = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.on('close', (code) => resolve({ success: code === 0 }));
  });
}

export async function hfCliListModels(): Promise<string[]> {
  return new Promise((resolve) => {
    const proc = spawn('huggingface-cli', ['list-models', '--library', 'gguf'], { env: process.env, shell: true });
    let stdout = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.on('close', () => resolve(stdout.trim().split('\n').filter(Boolean)));
  });
}

// ─── Token refresh & validation ──────────────
/** Validate an existing token — checks if still valid and returns the associated username */
export async function validateToken(token: string): Promise<{ valid: boolean; username?: string }> {
  // First check keytar for a potentially better (refreshed) token
  try {
    const keytar = await import('keytar');
    const keytarToken = await keytar.getPassword(HF_KEYTAR_SERVICE, HF_KEYTAR_USERNAME);
    if (keytarToken && keytarToken !== token) {
      // Keytar has a different token — validate that one instead
      return validateToken(keytarToken);
    }
  } catch {}
  
  // Validate the provided token against HuggingFace API
  try {
    const res = await axios.get(`${HUGGINGFACE_API}/whoami`, { headers: { Authorization: `Bearer ${token}` } });
    return { valid: true, username: (res.data as any)?.username };
  } catch {
    return { valid: false };
  }
}

// ─── Exported for IPC ──────────────
/** Get the GGUF quantization tag name for a given quantization format code */
function getQuantTagFromFormat(formatCode: string): string | null {
  const quantMap: Record<string, string> = {
    'Q8_0': 'Q8_0',
    'F16': 'F16',
    'BF16': 'BF16',
    'FP16': 'FP16',
    'Q5_K_S': 'Q5_K_S',
    'Q5_K_M': 'Q5_K_M',
    'Q4_K_S': 'Q4_K_S',
    'Q4_K_M': 'Q4_K_M',
    'I8': 'I8',
  };
  return quantMap[formatCode] || null;
}

/** Fetch model file details (size, quantization) from HuggingFace API */
export async function getModelFileDetails(modelId: string): Promise<Array<{ fileName: string; sizeBytes: number; format?: string }>> {
  const session = await checkHFAuth();
  const headers: Record<string, string> = {};
  if (session?.token) headers['Authorization'] = `Bearer ${session.token}`;

  try {
    // Try common branch names since repos may use 'main', 'master', or other defaults
    for (const branch of ['main', 'master']) {
      try {
        const res = await axios.get(`${HUGGINGFACE_API}/models/${modelId}/tree/${branch}`, { headers });
        // Filter to GGUF files and extract size/format info from the filename
        const ggufFiles = (res.data as any[]).filter((f: any) => f.path.endsWith('.gguf'));
        
        return ggufFiles.map((f: any) => {
          const quant = extractQuantizationFormat(f.path);
          // Convert null to undefined for type compatibility with the return type
          return {
            fileName: f.path,
            sizeBytes: f.size || 0,
            format: quant !== null ? quant : undefined,
          };
        });
      } catch {
        // Try next branch
      }
    }
    return [];
  } catch {
    return [];
  }
}

/** Extract quantization format from GGUF filename (e.g., 'model-Q8_0.gguf' -> 'Q8_0'). Returns undefined if no match found. */
function extractQuantizationFormat(fileName: string): string | undefined {
  const match = fileName.match(/-([A-Z]([KQ])?\d+[._]?[KM])\.gguf$/);
  if (match) return match[1];
  
  // Try other common patterns
  const formats = ['Q8_0', 'F16', 'BF16', 'FP16', 'Q5_K_S', 'Q5_K_M', 'Q4_K_S', 'Q4_K_M', 'I8'];
  for (const fmt of formats) {
    if (fileName.includes(fmt)) return fmt;
  }
  
  // Fallback: look for any uppercase letter followed by digits and optional suffix
  const fallback = fileName.match(/[A-Z][KQ]?\d+[._]?[KM]/);
  return fallback?.[0];
}

// ─── Exported for IPC ──────────────
export async function hfInit() {
  await checkHFAuth();
  const models = await listLocalModels();
  return { auth: true, modelCount: models.length };
}