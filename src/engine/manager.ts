// Engine Manager — backend selection + GitHub binary download for llama.cpp
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

export type Backend = 'cpu' | 'cuda' | 'metal' | 'vulkan' | 'rocm';

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/ggerganov/llama.cpp/releases/latest';

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
      const { execSync } = require('child_process');
      const out = execSync('wmic path win32_VideoController get name', { encoding: 'utf-8' });
      gpu = out.split('\n').filter(Boolean)[1]?.trim() || undefined;
    } catch {}
  }

  let ramGB = 16; // default guess
  try {
    if (process.platform === 'win32') {
      const memTotal = require('child_process').execSync(
        'wmic OS get TotalVisibleMemorySize', { encoding: 'utf-8' }
      );
      ramGB = Math.round(parseInt(memTotal.split('\n')[1]?.trim()) / 1048576);
    } else if (process.platform === 'darwin') {
      const out = require('child_process').execSync('sysctl hw.memsize', { encoding: 'utf-8' });
      ramGB = Math.round(parseInt(out.trim().split(' ')[1]) / 1048576);
    } else {
      const out = require('child_process').execSync('cat /proc/meminfo | grep MemTotal', { encoding: 'utf-8' });
      ramGB = Math.round(parseInt(out.split(':')[1].trim()) / 1024 / 1024);
    }
  } catch {}

  return { platform, gpu, ramGB };
}

// ─── Backend selection ──────────────────────
export function getRecommendedBackend(hardware: ReturnType<typeof detectHardware>): Backend {
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
  const dir = path.dirname(destPath);
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

  const destPath = path.join(
    process.env.APPDATA || '/tmp',
    'OpenLLMCode/engines',
    matched.name
  );

  await downloadBinary(matched.browser_download_url, destPath);
  return destPath;
}

// ─── Config persistence ──────────────────────
export function loadConfig(): { backend: Backend; binarySource: 'prebuilt' | 'compile'; selectedModel: string } {
  try {
    const data = fs.readFileSync(path.join(getAppData(), 'config.json'), 'utf-8');
    return JSON.parse(data);
  } catch {
    return { backend: 'cpu', binarySource: 'prebuilt', selectedModel: '' };
  }
}

export function saveConfig(cfg: ReturnType<typeof loadConfig>): void {
  fs.mkdirSync(getAppData(), { recursive: true });
  fs.writeFileSync(path.join(getAppData(), 'config.json'), JSON.stringify(cfg, null, 2));
}

function getAppData(): string {
  return path.join(
    process.platform === 'win32' ? process.env.APPDATA! : (process.env.HOME || '/tmp'),
    'OpenLLMCode',
  );
}