// ─── Per-Architecture Toolchain Registry ──────────────────────────────
// Manages per-architecture toolchain download, caching, and project-specific selection
// Based on cross-compile environment variable patterns in each architecture's -cpu and -device sections
import * as fs from 'fs';
import * as pathModule from 'path';
import axios from 'axios';
async function downloadAndExtract(archiveInfo, destDir) {
    const response = await axios.get(archiveInfo.url, {
        responseType: 'arraybuffer',
        timeout: 10 * 60 * 1000 // 10 minute timeout for large toolchains
    });
    // Create destination directory if it doesn't exist
    fs.mkdirSync(destDir, { recursive: true });
    const dataBuffer = Buffer.from(response.data);
    // Detect archive type from URL extension and extract accordingly
    const urlPath = archiveInfo.url.toLowerCase();
    if (urlPath.endsWith('.tar.gz') || urlPath.endsWith('.tgz')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any — zlib types for Node.js stream APIs
        const zlib = require('zlib'); // eslint-disable-line @typescript-eslint/no-explicit-any — dynamic require for optional dependency (Node.js built-in)
        zlib.gunzip(dataBuffer, (err, decompressed) => {
            if (err)
                throw err;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any — tar-fs types for Node.js stream APIs
            const tar = require('tar-fs'); // eslint-disable-line @typescript-eslint/no-explicit-any — dynamic require for optional dependency (Node.js built-in)
            const extract = tar.extract(destDir);
            extract.on('finish', () => { }); // Extract complete
            extract.on('error', (e) => { throw e; });
            extract.write(decompressed);
            extract.end();
        });
    }
    else if (urlPath.endsWith('.zip')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any — unzip-stream types for Node.js stream APIs
        const unzip = require('unzip-stream'); // eslint-disable-line @typescript-eslint/no-explicit-any — dynamic require for optional dependency (Node.js built-in)
        await new Promise((resolve, reject) => {
            unzip.Extract({ path: destDir }).on('finish', () => resolve()).catch(reject);
            const stream = fs.createWriteStream('/tmp/toolchain-tmp.zip');
            stream.on('finish', () => {
                fs.createReadStream('/tmp/toolchain-tmp.zip').pipe(unzip.Extract({ path: destDir }));
            });
        });
    }
    else {
        // Unknown format — write raw data (likely a single binary)
        fs.writeFileSync(pathModule.join(destDir, pathModule.basename(urlPath)), dataBuffer);
    }
}
// ─── Toolchain Extraction Helper — Per-Architecture ──────────────────────────────
// Each architecture's toolchain has a specific archive URL.
const TOOLCHAIN_ARCHIVES = {
    x86_64: { url: 'https://github.com/xPack-dev-tools/gcc-x86-64/releases/download/v13.2.0-1/xpack-gcc-x86-64-13.2.0-1.tar.gz' },
    i386: { url: 'https://github.com/xPack-dev-tools/gcc-x86-64/releases/download/v13.2.0-1/xpack-gcc-x86-64-13.2.0-1.tar.gz' }, // Reuse x86_64
    aarch64: { url: 'https://github.com/xPack-dev-tools/aarch64-none-elf-gcc/releases/download/v13.2.0-1/xpack-aarch64-none-elf-gcc-13.2.0-1.tar.gz' },
    armv7l: { url: 'https://github.com/xPack-dev-tools/arm-none-eabi-gcc/releases/download/v15.2.0-1/xpack-arm-none-eabi-gcc-15.2.0-1.tar.gz' },
    riscv64: { url: 'https://github.com/riscv-collab/riscv64-gcc-gnu/releases/download/riscv64-newlib-13.2.0/riscv64-gcc-nolibc-linux-x86_64.tar.gz' },
    riscv32: { url: 'https://github.com/riscv-collab/riscv64-gcc-gnu/releases/download/riscv64-newlib-13.2.0/riscv64-gcc-nolibc-linux-x86_64.tar.gz' }, // Reuse RISC-V 64-bit
    avr: { url: 'https://github.com/xPack-dev-tools/avr-gcc-xpack/releases/download/v13.2.0-1/xpack-avr-gcc-13.2.0-1.tar.gz' },
    mips: { url: 'https://github.com/xPack-dev-tools/mips-elf-gcc/releases/download/v13.2.0-1/xpack-mips-elf-gcc-13.2.0-1.tar.gz' },
    mips64: { url: 'https://github.com/xPack-dev-tools/mips-elf-gcc/releases/download/v13.2.0-1/xpack-mips-elf-gcc-13.2.0-1.tar.gz' }, // Reuse MIPS
    mipsel: { url: 'https://github.com/xPack-dev-tools/mips-elf-gcc/releases/download/v13.2.0-1/xpack-mips-elf-gcc-13.2.0-1.tar.gz' }, // Reuse MIPS
    mips64el: { url: 'https://github.com/xPack-dev-tools/mips-elf-gcc/releases/download/v13.2.0-1/xpack-mips-elf-gcc-13.2.0-1.tar.gz' }, // Reuse MIPS
    ppc: { url: 'https://github.com/xPack-dev-tools/powerpc-unknown-elf-gcc/releases/download/v13.2.0-1/xpack-powerpc-unknown-elf-gcc-13.2.0-1.tar.gz' },
    ppc64: { url: 'https://github.com/xPack-dev-tools/powerpc-unknown-linux-gnu-gcc/releases/download/v13.2.0-1/xpack-powerpc-unknown-linux-gnu-gcc-13.2.0-1.tar.gz' },
    ppcemb: { url: 'https://github.com/xPack-dev-tools/powerpc-e500v2-gcc/releases/download/v13.2.0-1/xpack-powerpc-e500v2-gcc-13.2.0-1.tar.gz' },
    sparc: { url: 'https://github.com/xPack-dev-tools/sparc-unknown-linux-gnu-gcc/releases/download/v13.2.0-1/xpack-sparc-unknown-linux-gnu-gcc-13.2.0-1.tar.gz' },
    sparc64: { url: 'https://github.com/xPack-dev-tools/sparc64-unknown-linux-gnu-gcc/releases/download/v13.2.0-1/xpack-sparc64-unknown-linux-gnu-gcc-13.2.0-1.tar.gz' },
};
// ─── Architecture-Specific Post-Extraction Actions ──────────────────────────────
function postExtractSetup(arch, targetDir) {
    // Per architecture's -cpu and cross-compile docs — set up symlinks for expected binary names
    if (arch === 'avr') {
        const binDir = pathModule.join(targetDir, 'bin');
        try {
            if (!fs.existsSync(pathModule.join(binDir, 'avr-gcc'))) {
                // Create avr-gcc symlink to the actual binary (xPack names it avr-gcc.exe)
                fs.symlinkSync('avr-gcc.exe', pathModule.join(binDir, 'avr-gcc')); // eslint-disable-line @typescript-eslint/no-explicit-any — cross-platform symlink creation (per Node.js fs docs)
            }
        }
        catch { /* Symlink failed — not critical on Windows */ }
        // Also need avrdude for Arduino programming — download separately if needed
        const avrdudeUrl = 'https://github.com/xPack-dev-tools/avrdude-xpack/releases/download/v7.3.0-1/xpack-avrdude-7.3.0-1.tar.gz';
        try {
            const avrdudeDestDir = pathModule.join(targetDir, 'avrdude');
            if (!fs.existsSync(pathModule.join(avrdudeDestDir, 'bin', 'avrdude'))) {
                downloadAndExtract({ url: avrdudeUrl }, avrdudeDestDir);
            }
        }
        catch { /* Avrdude extraction failed — not critical for basic AVR support */ }
    }
}
// ─── Architecture-Specific Toolchain Definitions (kept for API compatibility) ──────────────────────────────
const TOOLCHAIN_FAMILIES = [
    { arch: 'x86_64', name: 'x86_64-native', compilers: [{ name: 'gcc', version: '13.2.0', downloadUrl: '' }] },
    { arch: 'aarch64', name: 'aarch64-linux-gnu-toolchain', compilers: [] },
    { arch: 'avr', name: 'avr-gcc-toolchain', compilers: [{ name: 'avr-gcc', version: '13.2.0', downloadUrl: '' }] },
    { arch: 'riscv64', name: 'riscv64-linux-gnu-toolchain', compilers: [] },
    // Add remaining architectures for API compatibility — same entries as above but with empty compiler arrays
];
// ─── Toolchain Registry Class ──────────────────────────────
class ToolchainRegistry {
    toolchainsDir;
    constructor() {
        const c = this.getPaths();
        this.toolchainsDir = pathModule.join(c.ENGINES_DIR, 'toolchains');
    }
    getPaths() {
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
    ensureToolchain(arch) {
        const family = TOOLCHAIN_FAMILIES.find(f => f.arch === arch);
        if (!family)
            throw new Error(`No toolchain available for architecture: ${arch}`);
        const cachedPath = pathModule.join(this.toolchainsDir, family.name);
        if (fs.existsSync(cachedPath))
            return Promise.resolve(family);
        // Download and extract the toolchain archive
        const archiveInfo = TOOLCHAIN_ARCHIVES[arch];
        if (!archiveInfo)
            throw new Error(`No toolchain archive available for architecture: ${arch}`);
        return downloadAndExtract(archiveInfo, cachedPath).then(() => {
            postExtractSetup(arch, cachedPath);
            return family;
        });
    }
    // Per-project toolchain selection — like .openllmcode-toolchainrc file for specifying required versions per architecture  
    async getProjectToolchains(projectDir) {
        const rcFile = pathModule.join(projectDir, '.openllmcode-toolchainrc');
        if (!fs.existsSync(rcFile))
            return {};
        const config = JSON.parse(fs.readFileSync(rcFile, 'utf-8'));
        const result = {};
        for (const vmArch of Object.keys(config.qemu || {})) {
            if (TOOLCHAIN_FAMILIES.some(f => f.arch === vmArch)) {
                const family = TOOLCHAIN_FAMILIES.find(f => f.arch === vmArch);
                result[vmArch] = family;
            }
        }
        return result;
    }
    getAvailableToolchains() {
        return TOOLCHAIN_FAMILIES;
    }
    hasToolchainForArch(arch) {
        return TOOLCHAIN_ARCHIVES.hasOwnProperty(arch);
    }
}
// ─── Singleton Export ──────────────────────────────
let _instance = null;
export function getToolchainRegistry() {
    if (!_instance)
        _instance = new ToolchainRegistry();
    return _instance;
}
