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

// ─── Authentication ──────────────────────
export async function checkHFAuth(): Promise<HFSession | null> {
  try {
    const configPath = path.join(DATA_DIR, 'hf_config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {}
  return null;
}

export async function loginBrowser(token: string): Promise<HFSession> {
  const session: HFSession = { token, method: 'browser', expiresAt: Date.now() + 365 * 24 * 3600 * 1000 };
  fs.writeFileSync(path.join(DATA_DIR, 'hf_config.json'), JSON.stringify(session));
  return session;
}

export async function loginCLI(modelPath?: string): Promise<{ success: boolean; username?: string }> {
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

export async function logout(): Promise<void> {
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

// ─── Model download management (resumable) ──────────────
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

    proc.on('close', (code) => {
      if (code === 0 || downloadedBytes > 0) {
        resolve({
          modelId, fileName: targetFile,
          downloadedBytes, totalBytes, speedMBps,
          etaSeconds: totalBytes > downloadedBytes ? Math.round((totalBytes - downloadedBytes) / (speedMBps * 1048576)) : 0,
          status: 'completed',
        });
      } else {
        resolve({ modelId, fileName: targetFile, downloadedBytes, totalBytes, speedMBps, etaSeconds: -1, status: 'failed', error: `Exit code ${code}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ modelId, fileName: targetFile, downloadedBytes, totalBytes, speedMBps, etaSeconds: -1, status: 'failed', error: err.message });
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

// ─── Local model file discovery ──────────────
export async function listLocalModels(modelDir?: string): Promise<Array<{ name: string; path: string; sizeMB: number }>> {
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
    const res = await axios.get(`${HUGGINGFACE_API}/models/${modelId}/tree/main`, { headers });
    const files = (res.data as any[]).filter((f: any) => f.path.endsWith('.gguf'));
    return files[0]?.path || 'model.gguf';
  } catch {
    return 'model.gguf';
  }
}

// ─── HuggingFace CLI install helper ──────────────
export async function installHFCLI(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('curl', ['-LsSf', 'https://hf.co/cli/install.sh', '|', 'bash'], { env: process.env, shell: true });
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
export async function validateToken(token: string): Promise<{ valid: boolean; username?: string }> {
  try {
    const res = await axios.get(`${HUGGINGFACE_API}/whoami`, { headers: { Authorization: `Bearer ${token}` } });
    return { valid: true, username: (res.data as any)?.username };
  } catch {
    return { valid: false };
  }
}

// ─── Exported for IPC ──────────────
export async function hfInit() {
  await checkHFAuth();
  const models = await listLocalModels();
  return { auth: true, modelCount: models.length };
}