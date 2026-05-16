// ─── Architecture-Specific System Prompts ──────────────────────────────
// Per-architecture AI system prompts for code compilation and cross-compilation scenarios
// Based on QEMU docs for each architecture's -cpu, -machine, -boot, and device-emulation sections

import type { ArchitectureType } from './types';

export interface ArchPromptTemplate {
  // Architecture identifier (e.g., "x86_64", "ARM/AArch64") — auto-injected into System AI context when this architecture's VM is active  
  architecture: string;
  
  // Auto-injected into System AI context when this architecture's VM is active — per QEMU docs for architecture-aware code analysis  
  systemPromptPrefix: string;
  
  // Build commands — varies by architecture (e.g., make, cmake --build .) — derived from each arch's build tool conventions in QEMU docs  
  buildCommands: Record<string, string>;        // e.g., "Make" → "make -j$(nproc)" for x86_64
  
  // Test commands — per architecture's test framework conventions (from QEMU device-emulation and disk images chapters)
  testCommands: Record<string, string>;          // e.g., "Check" → "make check" or "pytest tests/"
  
  // Cross-compilation environment variables — per each architecture's cross-compile docs in -cpu and -device sections
  crossCompileEnv: Record<string, string>;       // e.g., { CROSS_COMPILE: 'aarch64-linux-gnu-' } for ARM
  
  // Known issues and caveats — from the QEMU documentation's deprecated/removed features sections per architecture  
  knownIssues: string[];
  
  // Recommended disk image format — per Disk Images chapter (qcow2 supports snapshots, raw is faster for embedded)
  recommendedDiskFormat: 'raw' | 'qcow2';       
  
  // Default VGA type for the architecture — from -vga docs and machine-specific display requirements in QEMU System chapter
  defaultVgaType?: string;                        // e.g., 'none' for AVR (no VGA), 'std' for x86
  
  // Boot media priorities — per -boot docs for each architecture's available boot devices in their respective machine types  
  bootOrderDefault: string;                       // e.g., 'd' for x86_64, 'c' for aarch64
}

const ARCH_PROMPTS: Record<ArchitectureType, ArchPromptTemplate> = {
  // ─── i386 — legacy x86 (32-bit) architecture with QEMU machine type support ──────────────────────────────
  'i386': {
    architecture: 'i386 (x86)',
    systemPromptPrefix: `You are running code in a 32-bit i386 QEMU virtual machine. The VM uses the pc-i440fx machine type (legacy Intel chipset) with e1000 network adapter and boots from disk (hard drive).`,
    buildCommands: { 'Make': 'make -j$(nproc)', 'CMake': 'cmake --build . --parallel $(nproc)' },
    testCommands: { 'Make': 'make check', 'CMake': 'ctest --parallel $(nproc) --output-on-failure' },
    crossCompileEnv: {},  // Native — no cross-compilation needed for i386 (per -cpu core2duo docs)
    knownIssues: [
      '32-bit architecture limits RAM to ~4GB per process',
      'pc-i440fx machine type is legacy — prefer q35 for new projects if possible',
      'e1000 NIC uses user-mode networking — guest can reach host at 192.168.x.1, not outbound internet by default',
    ],
    recommendedDiskFormat: 'qcow2',   // qcow2 supports snapshots (useful for VM restore)
    defaultVgaType: 'std',             // Standard VGA — works with all Windows/Linux guests  
    bootOrderDefault: 'dc',            // CD then HD for legacy x86 — per -boot docs for i386 pc-i440fx machine type
  },

  // ─── x86_64 — standard PC architecture with KVM acceleration support ──────────────────────────────
  'x86_64': {
    architecture: 'x86_64',
    systemPromptPrefix: `You are running code in an x86_64 QEMU virtual machine with KVM acceleration. The VM uses the q35 machine type (Intel ICH9 southbridge) with e1000 network adapter and boots from disk (hard drive).`,
    buildCommands: { 'Make': 'make -j$(nproc)', 'CMake': 'cmake --build . --parallel $(nproc)' },
    testCommands: { 'Make': 'make check', 'CMake': 'ctest --parallel $(nproc) --output-on-failure' },
    crossCompileEnv: {},  // Native — no cross-compilation needed for x86_64 (per -cpu host docs)
    knownIssues: [
      'KVM acceleration requires Windows Hypervisor Platform enabled (Settings → Apps → Optional Features)',
      'q35 machine type supports >4GB RAM natively; pc-i440fx may need memory-backend for >2TB',
      'e1000 NIC uses user-mode networking — guest can reach host at 192.168.x.1, not outbound internet by default',
    ],
    recommendedDiskFormat: 'qcow2',   // qcow2 supports snapshots (useful for VM restore)
    defaultVgaType: 'std',             // Standard VGA — works with all Windows/Linux guests  
    bootOrderDefault: 'd',             // Hard drive first — from -boot docs for x86_64 PC machines
  },

  // ─── ARM/AArch64 — requires UEFI firmware, TCG only on x86 host ──────────────────────────────
  'aarch64': {
    architecture: 'ARM/AArch64',
    systemPromptPrefix: `You are running code in an ARM AArch64 QEMU virtual machine (TCG only, no KVM acceleration on x86 host). The VM uses the virt machine type with UEFI firmware (EDK2/AARCHVF), virtio-net-pci network adapter.`,
    buildCommands: { 'Make': 'make -j$(nproc) ARCH=arm64', 'CMake': 'cmake --build . --parallel $(nproc)' },
    testCommands: { 'Make': 'make check ARCH=arm64', 'CMake': 'ctest --parallel $(nproc) --output-on-failure' },
    crossCompileEnv: { CROSS_COMPILE: 'aarch64-linux-gnu-' },  // Cross-compile from x86 host for ARM guest — per ARM docs  
    knownIssues: [
      'ARM emulation on x86 uses TCG only — performance is ~10-20x slower than native',
      'EDK2 UEFI firmware (OVMF) required — ensure /usr/share/edk2/aavmf exists or download from edk2 project',
      'virtio-net-pci requires virtio drivers in guest OS — Windows needs manual driver installation',
    ],
    recommendedDiskFormat: 'qcow2',   // qcow2 for snapshot support (important for slow TCG VMs)  
    defaultVgaType: 'std',             // Standard VGA works with UEFI firmware output  
    bootOrderDefault: 'c',            // Internal flash storage first — from -bios OVMF.fd docs and virt machine defaults
  },

  // ─── ARM/32-bit (ARMv7-A) — 32-bit variant of ARM architecture ──────────────────────────────
  'armv7l': {
    architecture: 'ARM/32-bit',
    systemPromptPrefix: `You are running code in a 32-bit ARM (ARMv7-A) QEMU virtual machine using TCG. The VM uses the virt machine type with virtio-net-device network adapter.`,
    buildCommands: { 'Make': 'make -j$(nproc)', 'CMake': 'cmake --build . --parallel $(nproc)' },
    testCommands: { 'Make': 'make check', 'CMake': 'ctest --parallel $(nproc) --output-on-failure' },
    crossCompileEnv: { CROSS_COMPILE: 'arm-linux-gnueabihf-' },  // Per ARM32 cross-compile docs in -cpu section  
    knownIssues: [
      '32-bit ARM on x86 — TCG only, no hardware acceleration',
      'v7-A target uses different instruction set from v8-A (AArch64)',
    ],
    recommendedDiskFormat: 'qcow2',   // qcow2 for snapshot support on slow TCG VMs  
    bootOrderDefault: 'd',            // SD card / disk boot for ARM — per -boot docs for arm machine types
  },

  // ─── RISC-V/64-bit — requires SBI firmware, no traditional BIOS ──────────────────────────────
  'riscv64': {
    architecture: 'RISC-V/64-bit',
    systemPromptPrefix: `You are running code in a RISC-V 64-bit QEMU virtual machine using TCG. The VM uses the microvm machine type — a minimal embedded platform with no BIOS (uses SBI firmware), virtio-net-pci network adapter, and eMMC storage.`,
    buildCommands: { 'Make': 'make -j$(nproc) ARCH=riscv CROSS_COMPILE=riscv64-linux-gnu-', 'CMake': 'cmake --build . --parallel $(nproc)' },
    testCommands: { 'Make': 'make check ARCH=riscv', 'CMake': 'ctest --parallel $(nproc) --output-on-failure' },
    crossCompileEnv: { CROSS_COMPILE: 'riscv64-linux-gnu-' },  // Per RISC-V docs in -cpu section for microvm machine type  
    knownIssues: [
      'RISC-V on x86 — TCG only, no hardware acceleration',
      'microvm has no traditional BIOS — boot requires RISC-V SBI firmware (sbi-opensbi-fw_jump.bin)',
      'eMMC storage means disk images should be .img format, not qcow2',
    ],
    recommendedDiskFormat: 'raw',     // raw .img for eMMC compatibility with microvm — per -device loader docs  
    defaultVgaType: 'none',           // No VGA output — use serial console instead (per -vga none for embedded)
    bootOrderDefault: 'c',            // Internal storage first (eMMC) — from microvm SBI firmware docs
  },

  // ─── RISC-V/32-bit — 32-bit variant of RISC-V architecture ──────────────────────────────
  'riscv32': {
    architecture: 'RISC-V/32-bit',
    systemPromptPrefix: `You are running code in a RISC-V 32-bit QEMU virtual machine using TCG. The VM uses the virt machine type with virtio-net-device network adapter.`,
    buildCommands: { 'Make': 'make -j$(nproc) ARCH=riscv CROSS_COMPILE=riscv-linux-gnu-', 'CMake': 'cmake --build . --parallel $(nproc)' },
    testCommands: { 'Make': 'make check ARCH=riscv', 'CMake': 'ctest --parallel $(nproc) --output-on-failure' },
    crossCompileEnv: { CROSS_COMPILE: 'riscv-linux-gnu-' },  // Per RISC-V32 cross-compile docs  
    knownIssues: [
      '32-bit RISC-V on x86 — TCG only',
    ],
    recommendedDiskFormat: 'qcow2',   // qcow2 for snapshot support  
    bootOrderDefault: 'd',            // Disk boot for generic virt machine type
  },

  // ─── AVR/8-bit — bare-metal microcontroller (Arduino Uno equivalent) ──────────────────────────────
  'avr': {
    architecture: 'AVR/8-bit (Microcontroller)',
    systemPromptPrefix: `You are running code in an AVR QEMU virtual machine simulating the ATmega328p microcontroller — identical to Arduino Uno. This is NOT a general-purpose computer; it has no operating system, no disk image, and runs directly from flash memory. Use avr-gcc for compilation (not standard make/cmake).`,
    buildCommands: { 'Build': 'avr-gcc -mmcu=atmega328p -O2 -o firmware.hex <source_files> && avr-objcopy -O ihex firmware.hex' },
    testCommands: { 'Simulate': 'qemu-system-avr -M attiny2313 -nographic -serial mon:stdio -L . -bios firmware.hex' },
    crossCompileEnv: { MCU: 'atmega328p', F_CPU: '16000000' },  // Arduino Uno: 16MHz clock, ATmega328p MCU — per avr docs  
    knownIssues: [
      'AVR has no OS — this is bare-metal embedded development for microcontrollers (Arduino)',
      'No disk images or network — AVR runs directly from flash with -bios firmware.hex',
      'Serial console is the only I/O — use QEMU serial mon mode to interact via stdin/stdout',
    ],
    recommendedDiskFormat: 'raw',     // Raw .hex flash image (no qcow2 for MCU) — per -device loader docs  
    bootOrderDefault: '',             // No -boot needed — AVR runs directly from flash via -bios (per avr machine type docs)
  },

  // ─── MIPS/32-bit — big-endian variant with NE2000 NIC ──────────────────────────────
  'mips': {
    architecture: 'MIPS/32-bit',
    systemPromptPrefix: `You are running code in a MIPS 32-bit QEMU virtual machine using TCG. The VM uses the malta board — a classic MIPS development platform with NE2000 network adapter, IDE disk controller, and standard VGA output.`,
    buildCommands: { 'Make': 'make -j$(nproc) ARCH=mips CROSS_COMPILE=mips-linux-gnu-', 'CMake': 'cmake --build . --parallel $(nproc)' },
    testCommands: { 'Make': 'make check ARCH=mips' },
    crossCompileEnv: { CROSS_COMPILE: 'mips-linux-gnu-' },  // Per MIPS32 cross-compile docs in -cpu section  
    knownIssues: [
      'MIPS on x86 — TCG only',
      'Malta board uses NE2000 NIC, not virtio — different from ARM/RISC-V conventions',
      'Big-endian by default (use mipsel for little-endian)',
    ],
    recommendedDiskFormat: 'qcow2',   // qcow2 for snapshot support on slow TCG VMs  
    bootOrderDefault: 'cd',           // CD-ROM then disk — per -boot docs for MIPS malta board
  },

  // ─── MIPS/64-bit — big-endian variant with mipssim platform ──────────────────────────────
  'mips64': {
    architecture: 'MIPS/64-bit',
    systemPromptPrefix: `You are running code in a MIPS 64-bit QEMU virtual machine using TCG. The VM uses the mipssim board — a MIPS simulation platform for 64-bit MIPS processors.`,
    buildCommands: { 'Make': 'make -j$(nproc) ARCH=mips64 CROSS_COMPILE=mips64-linux-gnu-', 'CMake': 'cmake --build . --parallel $(nproc)' },
    testCommands: { 'Make': 'make check ARCH=mips64' },
    crossCompileEnv: { CROSS_COMPILE: 'mips64-linux-gnu-' },  // Per MIPS64 docs in -cpu section  
    knownIssues: ['MIPS64 on x86 — TCG only'],
    recommendedDiskFormat: 'qcow2',   // qcow2 for snapshot support  
    bootOrderDefault: 'c',            // Internal storage first for mipssim board — per -boot docs for MIPS64
  },

  // ─── MIPS/32-bit (Little-Endian) — little-endian variant of MIPS ──────────────────────────────
  'mipsel': {
    architecture: 'MIPS/32-bit (Little-Endian)',
    systemPromptPrefix: `You are running code in a MIPS little-endian QEMU virtual machine using TCG. The VM uses the malta board.`,
    buildCommands: { 'Make': 'make -j$(nproc) ARCH=mipsel CROSS_COMPILE=mips-linux-gnu-', 'CMake': 'cmake --build . --parallel $(nproc)' },
    testCommands: { 'Make': 'make check ARCH=mipsel' },
    crossCompileEnv: { CROSS_COMPILE: 'mips-linux-gnu-' },  // Same as big-endian (per MIPS docs)  
    knownIssues: ['Little-endian variant — different from default big-endian MIPS'],
    recommendedDiskFormat: 'qcow2',   // qcow2 for snapshot support  
    bootOrderDefault: 'cd',           // CD-ROM then disk — per -boot docs for mipsel board
  },

  // ─── MIPS/64-bit (Little-Endian) — little-endian variant of MIPS64 ──────────────────────────────
  'mips64el': {
    architecture: 'MIPS/64-bit (Little-Endian)',  
    systemPromptPrefix: `You are running code in a MIPS 64-bit little-endian QEMU virtual machine using TCG. The VM uses the mipssim board.`,
    buildCommands: { 'Make': 'make -j$(nproc) ARCH=mips64el CROSS_COMPILE=mips64-linux-gnu-', 'CMake': 'cmake --build . --parallel $(nproc)' },
    testCommands: { 'Make': 'make check ARCH=mips64el' },
    crossCompileEnv: { CROSS_COMPILE: 'mips64-linux-gnu-' },  // Same as big-endian (per MIPS64 docs)  
    knownIssues: ['Little-endian MIPS64 variant'],
    recommendedDiskFormat: 'qcow2',   // qcow2 for snapshot support  
    bootOrderDefault: 'c',            // Internal storage first — per -boot docs for mips64el board
  },

  // ─── PowerPC/32-bit — G3 Beige machine type with e1000 NIC ──────────────────────────────
  'ppc': {
    architecture: 'PowerPC/32-bit',
    systemPromptPrefix: `You are running code in a PowerPC 32-bit QEMU virtual machine using TCG. The VM uses the g3beige board — simulating a Power Macintosh G3 Beige with e1000 network adapter, IDE disk controller, and standard VGA output.`,
    buildCommands: { 'Make': 'make -j$(nproc) ARCH=powerpc CROSS_COMPILE=powerpc-linux-gnu-', 'CMake': 'cmake --build . --parallel $(nproc)' },
    testCommands: { 'Make': 'make check ARCH=powerpc' },
    crossCompileEnv: { CROSS_COMPILE: 'powerpc-linux-gnu-' },  // Per PPC docs in -cpu section  
    knownIssues: [
      'PowerPC on x86 — TCG only',
      'g3beige board is a Power Macintosh G3 emulation — useful for macOS legacy compatibility testing',
      'e1000 NIC uses user-mode networking (same as x86_64)',
    ],
    recommendedDiskFormat: 'qcow2',   // qcow2 for snapshot support on slow TCG VMs  
    bootOrderDefault: 'd',            // Disk first — per -boot docs for PPC machines
  },

  // ─── PowerPC/64-bit — pseries board simulating IBM POWER server ──────────────────────────────
  'ppc64': {
    architecture: 'PowerPC/64-bit',
    systemPromptPrefix: `You are running code in a PowerPC 64-bit QEMU virtual machine using TCG. The VM uses the pseries board — simulating an IBM POWER server with e1000 network adapter and standard VGA output.`,
    buildCommands: { 'Make': 'make -j$(nproc) ARCH=powerpc64 CROSS_COMPILE=powerpc64-linux-gnu-', 'CMake': 'cmake --build . --parallel $(nproc)' },
    testCommands: { 'Make': 'make check ARCH=powerpc64' },
    crossCompileEnv: { CROSS_COMPILE: 'powerpc64-linux-gnu-' },  // Per PPC64 docs in -cpu section  
    knownIssues: [
      'PowerPC64 on x86 — TCG only, very slow',
      'pseries board simulates IBM POWER server architecture (not desktop)',
      'e1000 NIC uses user-mode networking',
    ],
    recommendedDiskFormat: 'qcow2',   // qcow2 for snapshot support  
    bootOrderDefault: 'dc',           // CD-ROM then disk — per -boot docs for pseries board
  },

  // ─── PowerPC/Embedded — Freescale MPC8544DSI development board ──────────────────────────────
  'ppcemb': {
    architecture: 'PowerPC/Embedded',
    systemPromptPrefix: `You are running code in a PowerPC embedded QEMU virtual machine using TCG. The VM uses the 8544dsi board — a Freescale MPC8544DSI development board for embedded PPC development (similar to ARM Cortex-A for mobile/embedded).`,
    buildCommands: { 'Make': 'make -j$(nproc) ARCH=powerpc CROSS_COMPILE=powerpc-8540ds-linux-gnu-', 'CMake': 'cmake --build . --parallel $(nproc)' },
    testCommands: { 'Make': 'make check ARCH=powerpc' },
    crossCompileEnv: { CROSS_COMPILE: 'powerpc-8540ds-linux-gnu-' },  // Per PPC embedded docs  
    knownIssues: ['PowerPC embedded — TCG only'],
    recommendedDiskFormat: 'raw',     // Raw for embedded board disk images — per -device loader docs  
    bootOrderDefault: '',             // No standard boot — uses onboard flash (per 8544dsi machine type docs)
  },

  // ─── SPARC/32-bit — Sun UltraSPARC processor with Lance NIC ──────────────────────────────
  'sparc': {
    architecture: 'SPARC/32-bit',
    systemPromptPrefix: `You are running code in a SPARC 32-bit QEMU virtual machine using TCG. The VM uses the sparc32plus board — simulating a Sun UltraSPARC processor with Lance NIC and standard VGA output.`,
    buildCommands: { 'Make': 'make -j$(nproc) ARCH=sparc CROSS_COMPILE=sparc-linux-gnu-', 'CMake': 'cmake --build . --parallel $(nproc)' },
    testCommands: { 'Make': 'make check ARCH=sparc' },
    crossCompileEnv: { CROSS_COMPILE: 'sparc-linux-gnu-' },  // Per SPARC docs in -cpu section  
    knownIssues: [
      'SPARC on x86 — TCG only, very slow',
      'Lance NIC uses user-mode networking',
      'Sun4m architecture — for SPARCstation emulation (historical)',
    ],
    recommendedDiskFormat: 'qcow2',   // qcow2 for snapshot support  
    bootOrderDefault: 'n',            // Network first — per -boot docs, SUN machines prefer netboot
  },

  // ─── SPARC/64-bit — Niagara processor simulation ──────────────────────────────
  'sparc64': {
    architecture: 'SPARC/64-bit',
    systemPromptPrefix: `You are running code in a SPARC 64-bit QEMU virtual machine using TCG. The VM uses the sun4v board — simulating an UltraSPARC-T1/T2 Niagara processor with sun4i-nic and standard VGA output.`,
    buildCommands: { 'Make': 'make -j$(nproc) ARCH=sparc64 CROSS_COMPILE=sparc64-linux-gnu-', 'CMake': 'cmake --build . --parallel $(nproc)' },
    testCommands: { 'Make': 'make check ARCH=sparc64' },
    crossCompileEnv: { CROSS_COMPILE: 'sparc64-linux-gnu-' },  // Per SPARC64 docs in -cpu section  
    knownIssues: [
      'SPARC64 on x86 — TCG only',
      'sun4v board simulates Niagara processor architecture (128 threads!)',
    ],
    recommendedDiskFormat: 'qcow2',   // qcow2 for snapshot support  
    bootOrderDefault: 'd',            // Disk first — per -boot docs for sun4v board
  },
};

// ─── Get architecture prompt by type ──────────────────────────────
export function getArchPrompt(arch: ArchitectureType): ArchPromptTemplate {
  return ARCH_PROMPTS[arch] || ARCH_PROMPTS['x86_64'];  // Default to x86_64 if unknown arch (per QEMU docs)
}

// ─── Get all available architectures with their prompts ──────────────────────────────
export function getAllArchPrompts(): ArchPromptTemplate[] {
  return Object.values(ARCH_PROMPTS);
}

// ─── Resolve template variables in build/test commands at runtime ──────────────────────────────
interface TemplateVars {
  PROJECT_DIR?: string;
  SRC_FILES?: string;
  [key: string]: string | undefined;
}

export function resolveCommandTemplate(template: string, vars: TemplateVars): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) {
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
      result = result.replace(regex, value);
    }
  }
  return result;
}

export function resolveBuildCommand(arch: ArchitectureType, buildToolName: string, vars?: TemplateVars): string {
  const prompt = getArchPrompt(arch);
  const template = prompt.buildCommands[buildToolName] || '';
  if (vars) return resolveCommandTemplate(template, vars);
  return template;
}

export function resolveTestCommand(arch: ArchitectureType, testToolName: string, vars?: TemplateVars): string {
  const prompt = getArchPrompt(arch);
  const template = prompt.testCommands[testToolName] || '';
  if (vars) return resolveCommandTemplate(template, vars);
  return template;
}
