// Engine Manager — backend selection + GitHub binary download for llama.cpp
// Note: This file runs in Electron's main process where Node.js modules work natively.
// Static imports are safe here as Vite does not bundle the main process entry point.
import axios from 'axios';
import * as fs from 'fs';
import * as pathModule from 'path';
import { spawnSync } from 'child_process';

import { type Backend, type EngineConfig } from '../types';

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/ggerganov/llama.cpp/releases/latest';

// App update check — checks for OpenLLMCode app updates (separate from engine binary updates)
const APP_UPDATE_CHECK_INTERVAL_MS = 3600 * 1000; // Check every hour
let lastAppUpdateCheck = 0;
export let appVersion = '0.2.0'; // App version — increment when releasing new versions

/** Check for app-level updates (separate from engine binary updates). 
 *  Compares current version against the latest GitHub release tag of OpenLLMCode. */
export async function checkForAppUpdates(): Promise<{ available: boolean; version: string; notes?: string } | null> {
  // Only check if we haven't checked recently (avoid spamming API)
  const now = Date.now();
  if (now - lastAppUpdateCheck < APP_UPDATE_CHECK_INTERVAL_MS) return null;
  
  try {
    const res = await axios.get('https://api.github.com/repos/Yonneh0/OpenLLMCode/releases/latest');
    const latestVersion = res.data.tag_name.replace(/^v/, ''); // Strip 'v' prefix if present
    
    lastAppUpdateCheck = now;
    
    // Compare versions — simple semantic versioning comparison (only major.minor.patch)
    const currentParts = appVersion.split('.').map(Number);
    const latestParts = latestVersion.split('.').map(Number);
    
    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const curPart = currentParts[i] ?? 0;
      const latPart = latestParts[i] ?? 0;
      if (latPart > curPart) return { available: true, version: latestVersion, notes: res.data.body };
      if (latPart < curPart) break; // Current is newer — don't warn about downgrades
    }
    
    return null; // Same or older version
  } catch {
    lastAppUpdateCheck = now;
    return null; // Failed to check — silently ignore
  }
}

/** Download the latest app release asset for the current platform */
export async function downloadAppRelease(assetUrl: string, destPath: string): Promise<void> {
  const dir = pathModule.dirname(destPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const response = await axios.get(assetUrl, {
    responseType: 'arraybuffer',
    onDownloadProgress(progress) {
      const pct = Math.round((progress.loaded / (progress.total || progress.loaded)) * 100);
      process.stdout.write(`Downloading app update: ${pct}%\r`);
    },
  });

  fs.writeFileSync(destPath, Buffer.from(response.data));
}

// ─── Hardware detection ──────────────────────
export async function detectHardware(): Promise<{
  platform: string;
  gpu?: string;
  ramGB: number;
}> {
  const platform = process.platform; // 'win32' | 'darwin' | 'linux'

  let gpu: string | undefined;
  if (platform === 'win32') {
    try {
      const result = spawnSync('wmic', ['path', 'win32_VideoController', 'get', 'name'], { encoding: 'utf-8' });
      const output = result.stdout?.toString() || '';
      gpu = output.split('\n').find(Boolean)?.trim() || undefined;
    } catch {}
  }

  let ramGB = 16; // default guess
  try {
    if (process.platform === 'win32') {
      const result = spawnSync('wmic', ['OS', 'get', 'TotalVisibleMemorySize'], { encoding: 'utf-8' });
      const output = result.stdout?.toString() || '';
      ramGB = Math.round(parseInt(output.split('\n')[1]?.trim()) / 1048576);
    } else if (process.platform === 'darwin') {
      const result = spawnSync('sysctl', ['hw.memsize'], { encoding: 'utf-8' });
      ramGB = Math.round(parseInt(result.stdout?.toString().trim() || '') / 1048576);
    } else {
      const result = spawnSync('grep', ['MemTotal', '/proc/meminfo'], { encoding: 'utf-8' });
      ramGB = Math.round(parseInt(result.stdout?.toString().split(':')[1]?.trim()) / 1024 / 1024);
    }
  } catch {}

  return { platform, gpu, ramGB };
}

// ─── Backend selection ──────────────────────
export function getRecommendedBackend(hardware: Awaited<ReturnType<typeof detectHardware>>): Backend {
  if (hardware.platform === 'darwin') return 'metal';
  if (hardware.gpu?.toLowerCase().includes('nvidia')) return 'cuda';
  if (hardware.gpu) return 'vulkan'; // fallback
  return 'cpu';
}

// ─── GitHub releases download ──────────────────────
export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export async function getLatestReleases(): Promise<ReleaseAsset[]> {
  const res = await axios.get(GITHUB_RELEASES_URL);
  return (res.data as any).assets || [];
}

export async function downloadBinary(
  assetUrl: string,
  destPath: string,
): Promise<void> {
  const dir = pathModule.dirname(destPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const response = await axios.get(assetUrl, {
    responseType: 'arraybuffer',
    onDownloadProgress(progress) {
      const pct = Math.round((progress.loaded / (progress.total || progress.loaded)) * 100);
      process.stdout.write(`Downloading: ${pct}%\r`);
    },
  });

  fs.writeFileSync(destPath, Buffer.from(response.data));
}

export async function downloadForBackend(backend: Backend): Promise<string> {
  const assets = await getLatestReleases();
  const suffixes: Record<Backend, string[]> = {
    cpu: ['linux-x64', 'win-x64', 'macos'],
    cuda: ['cuda', 'cublas'],
    metal: ['macos-metal', 'apple'],
    vulkan: ['vulkan', 'vk'],
    rocm: ['rocm', 'amd'],
  };

  const matched = assets.find((a) =>
    suffixes[backend].some((s) => a.name.toLowerCase().includes(s))
  ) || assets[0];

  // Use the same app data directory as electron/main.ts for consistency
  const appDataDir = process.platform === 'win32'
    ? (process.env.APPDATA || '/tmp')
    : ((process.env.HOME || '/tmp') + '/.openllmcode');
  const destPath = pathModule.join(
    appDataDir,
    'OpenLLMCode/engines',
    matched.name
  );

  await downloadBinary(matched.browser_download_url, destPath);
  return destPath;
}

// ─── Config persistence ──────────────────────
export function loadConfig(): EngineConfig {
  try {
    const data = fs.readFileSync(pathModule.join(getAppData(), 'config.json'), 'utf-8');
    const parsed = JSON.parse(data);
    return {
      backend: (parsed.backend as Backend) || 'cpu',
      binarySource: (parsed.binarySource as 'prebuilt' | 'compile') || 'prebuilt',
      selectedModel: parsed.selectedModel || '',
      systemAIModel: parsed.systemAIModel || '',
    };
  } catch {
    return { backend: 'cpu', binarySource: 'prebuilt', selectedModel: '', systemAIModel: '' };
  }
}

export function saveConfig(cfg: EngineConfig): void {
  fs.mkdirSync(getAppData(), { recursive: true });
  fs.writeFileSync(pathModule.join(getAppData(), 'config.json'), JSON.stringify(cfg, null, 2));
}

function getAppData(): string {
  return pathModule.join(
    process.platform === 'win32' ? (process.env.APPDATA || '/tmp') : (process.env.HOME || '/tmp'),
    'OpenLLMCode',
  );
}