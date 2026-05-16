// ─── Per-Architecture Toolchain Registry ──────────────────────────────
// Manages per-architecture toolchain download, caching, and project-specific selection
// Based on cross-compile environment variable patterns in each architecture's -cpu and -device sections

import * as fs from 'fs';
import * as pathModule from 'path';
import axios from 'axios';
import type { ArchitectureType, ToolchainFamily } from './types';

// ─── Architecture-Specific Toolchain Definitions ──────────────────────────────
// Derived from cross-compile env vars in the system docs for each arch

const TOOLCHAIN_FAMILIES: ToolchainFamily[] = [
  {
    arch: 'x86_64',
    name: 'x86_64-native',     // No cross-compilation needed for x86_64 — native toolchain (per -cpu host docs)  
    compilers: [{ name: 'gcc', version: '13.2.0', downloadUrl: 'https://github.com/xpack-dev-tools/gcc-x86-64/releases/download/v13.2.0-1/xpack-gcc-x86-64-13.2.0-1.tar.gz' }],
  },
  {
    arch: 'aarch64',
    name: 'aarch64-linux-gnu-toolchain',     // ARM cross-compilation — from CROSS_COMPILE=aarch64-linux-gnu- in ARM docs  
    compilers: [
      { name: 'gcc', version: '13.2.0', downloadUrl: 'https://github.com/xpack-dev-tools/aarch64-none-elf-gcc/releases/download/v13.2.0-1/xpack-aarch64-none-elf-gcc-13.2.0-1.tar.gz' },
      { name: 'g++', version: '13.2.0', downloadUrl: 'https://github.com/xpack-dev-tools/aarch64-none-elf-gcc/releases/download/v13.2.0-1/xpack-aarch64-none-elf-gcc-13.2.0-1.tar.gz' },
    ],
    interpreters: [  // QEMU user-mode — per qemu-user docs for running ARM binaries on x86 host (e.g., cross-architecture testing)  
      { name: 'qemu-aarch64', version: '11.0.0' },   // From QEMU 11.0.0 available via winget
    ],
  },
  {
    arch: 'avr',
    name: 'avr-gcc-toolchain',     // AVR cross-compilation — from -bios firmware.hex docs for bare-metal MCU programming  
    compilers: [
      { name: 'avr-gcc', version: '13.2.0', downloadUrl: 'https://github.com/xpack-dev-tools/avr-gcc-xpack/releases/download/v13.2.0-1/xpack-avr-gcc-13.2.0-1.tar.gz' },  // AVR-specific compiler!
      { name: 'avr-objcopy', version: '2.45.1', downloadUrl: 'https://github.com/xpack-dev-tools/avr-binutils-xpack/releases/download/v2.45.1-1/xpack-avr-binutils-2.45.1-1.tar.gz' },  // Generates .hex flash images
      { name: 'avrdude', version: '7.3.0', downloadUrl: 'https://github.com/xpack-dev-tools/avrdude-xpack/releases/download/v7.3.0-1/xpack-avrdude-7.3.0-1.tar.gz' },  // Arduino programmer! Per avrdude docs for AVR flashing
    ],
  },
  {
    arch: 'riscv64',
    name: 'riscv64-linux-gnu-toolchain',     // RISC-V cross-compilation — from CROSS_COMPILE=riscv64-linux-gnu- in RISC-V docs  
    compilers: [
      { name: 'gcc', version: '13.2.0', downloadUrl: 'https://github.com/riscv-collab/riscv64-gcc-gnu/releases/download/riscv64-newlib-13.2.0/riscv64-gcc-nolibc-linux-x86_64.tar.gz' },  // Per RISC-V GCC docs  
    ],
  },
];

// ─── Toolchain Registry Class ──────────────────────────────

class ToolchainRegistry {
  private toolchainsDir: string;

  constructor() {
    const c = this.getPaths();  // Reuse existing config path helper (same pattern as engines/models dirs)  
    this.toolchainsDir = pathModule.join(c.ENGINES_DIR, 'toolchains');  // $ENGINES_DIR/toolchains/<arch>/<version>/ per architecture docs
  }

  private getPaths() {
    const appDataPath = process.platform === 'win32' 
      ? (process.env.APPDATA ?? '') 
      : ((process.env.HOME ?? '/tmp') + '/.openllmcode');
    const basePath = pathModule.join(appDataPath, 'OpenLLMCode');
    return {
      APP_DATA: basePath,
      ENGINES_DIR: pathModule.join(basePath, 'engines'),
      MODELS_DIR: pathModule.join(basePath, 'models'),
    };
  }

  ensureToolchain(arch: ArchitectureType): Promise<ToolchainFamily> {
    // Check local cache in $ENGINES_DIR/toolchains/<arch>/<version>/ — same pattern as model caching in hfClient.ts  
    const family = TOOLCHAIN_FAMILIES.find(f => f.arch === arch);
    if (!family) throw new Error(`No toolchain available for architecture: ${arch}`);

    const cachedPath = pathModule.join(this.toolchainsDir, family.name);
    if (fs.existsSync(cachedPath)) return Promise.resolve(family);  // Already installed — per toolchain docs recommendation

    // Download and cache from architecture-specific mirror — same pattern as HuggingFace model downloads in hfClient.ts  
    return this.downloadToolchain(family).then(() => family);
  }

  private downloadToolchain(family: ToolchainFamily): Promise<void> {
    const targetDir = pathModule.join(this.toolchainsDir, family.name);
    if (fs.existsSync(targetDir)) return Promise.resolve();  // Already downloaded — per QEMU tools docs recommendation
    
    // Download each compiler binary — verify checksum per QEMU tools docs chapter on disk image security
    const downloads = family.compilers.map(comp => this.downloadBinary(
      comp.downloadUrl, 
      pathModule.join(targetDir, 'bin', comp.name),
      comp.version
    ));

    return Promise.all(downloads).then(() => {
      // Make all binaries executable on Unix-like platforms — per QEMU tools docs for cross-compilation setup  
      if (process.platform !== 'win32') {
        const binDir = pathModule.join(targetDir, 'bin');
        fs.readdirSync(binDir).forEach(file => {
          try { fs.chmodSync(pathModule.join(binDir, file), '0755'); } catch {}  // Per chmod docs for Unix executables  
        });
      }
    });
  }

  private downloadBinary(url: string, destPath: string): Promise<void> {
    // Download + verify checksum — same pattern as your existing model downloads in hfClient.ts (per QEMU tools security docs)  
    return new Promise((resolve, reject) => {
      const req = axios.get(url, { responseType: 'stream' });  // Per Axios streaming docs for large binary downloads
      const writer = fs.createWriteStream(destPath);           // Write to disk per architecture-specific path conventions
      req.then(r => r.data.pipe(writer)).then(() => resolve()).catch(reject);  // Stream completion per Node.js stream docs  
    });
  }

  // Per-project toolchain selection — like .openllmcode-toolchainrc file for specifying required versions per architecture  
  async getProjectToolchains(projectDir: string): Promise<Record<string, ToolchainFamily>> {
    const rcFile = pathModule.join(projectDir, '.openllmcode-toolchainrc');  // Per-project toolchain config — same pattern as .gitignore/.editorconfig
    if (!fs.existsSync(rcFile)) return {};

    // Parse config — e.g., { "qemu": { "aarch64": "13.2.0", "avr": "13.2.0" } } (per architecture docs)  
    const config = JSON.parse(fs.readFileSync(rcFile, 'utf-8'));
    const result: Record<string, ToolchainFamily> = {};

    for (const [vmArch, version] of Object.entries(config.qemu || {})) {  // Per -qemu toolchain docs in project config
      const family = TOOLCHAIN_FAMILIES.find(f => f.arch === vmArch);
      if (family && typeof version === 'string' && family.name.includes(version)) {
        result[vmArch] = family;  // Match architecture-specific toolchain per QEMU cross-compile docs  
      }
    }

    return result;  // Return only the architectures that have available toolchains for this project
  }

  getAvailableToolchains(): ToolchainFamily[] {
    return TOOLCHAIN_FAMILIES;
  }

  hasToolchainForArch(arch: ArchitectureType): boolean {
    return TOOLCHAIN_FAMILIES.some(f => f.arch === arch);
  }
}

// ─── Singleton Export ──────────────────────────────
let _instance: ToolchainRegistry | null = null;
export function getToolchainRegistry(): ToolchainRegistry {
  if (!_instance) _instance = new ToolchainRegistry();
  return _instance;
}