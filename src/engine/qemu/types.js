"use strict";
// ─── QEMU/KVM Simulation Layer Types ──────────────────────────────
// Based on research of QEMU's current API docs at https://www.qemu.org/docs/master/
// Key interfaces: QMP (JSON over TCP/Unix socket), QEMU Monitor (legacy text protocol)
Object.defineProperty(exports, "__esModule", { value: true });
exports.NETWORK_BACKEND = exports.DISK_FORMAT = exports.VM_RUN_STATE = exports.ACCELERATOR = exports.ARCHITECTURE = void 0;
const zod_1 = require("zod");
// Per-architecture type mapping — matches qemu-system-* binary naming convention
exports.ARCHITECTURE = [
    'x86_64', 'i386',
    'aarch64', 'armv7l',
    'riscv32', 'riscv64',
    'avr',
    'mips', 'mips64', 'mipsel', 'mips64el',
    'ppc', 'ppc64', 'ppcemb',
    'sparc', 'sparc64',
];
// QEMU accelerator types per the API docs: kvm, xen, hvf, nitro, nvmm, whpx, mshv, tcg
exports.ACCELERATOR = ['kvm', 'xen', 'hvf', 'nitro', 'nvmm', 'whpx', 'mshv', 'tcg'];
// VM run states — per the QMP spec's vm-run-state section
exports.VM_RUN_STATE = [
    'running', 'paused', 'debug', 'internal', 'finish-reset',
    'guest-swap-in-progress', 'io-error', 'device-hotplug',
    'postmigrate', 'prelaunch', 'recover', 'resume-request',
    'shuttingdown', 'shutdown-request', 'suspended', 'wait-io'
];
// Disk image format support — from the Disk Images chapter in System docs
exports.DISK_FORMAT = ['raw', 'qcow2', 'qed', 'vdi', 'vhdx', 'vmdk'];
// Network backend types — per -netdev documentation
exports.NETWORK_BACKEND = [
    'user', 'tap', 'socket', 'vde',
    'bridge', 'fd', 'hubport', 'ioe',
    'nic', 'netmap', 'vhost-user'
];
// ─── Zod Schemas for VM Creation Config ──────────────────────────────
const vmImageSchema = zod_1.z.object({
    id: zod_1.z.string(),
    media: zod_1.z.enum(['disk', 'cdrom']), // Per Disk Images chapter — both supported  
    format: zod_1.z.enum(exports.DISK_FORMAT), // All formats from Disk Images chapter
    file: zod_1.z.string().refine((path) => path.endsWith('.qcow2') || path.endsWith('.raw')),
});
const networkDeviceSchema = zod_1.z.object({
    id: zod_1.z.string(),
    backendType: zod_1.z.enum(exports.NETWORK_BACKEND), // Per -netdev docs — all backends from chapter
    macAddress: zod_1.z.string().regex(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i).optional(),
});
const vmCreationSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    architecture: zod_1.z.enum(exports.ARCHITECTURE),
    machine: zod_1.z.string(), // Auto-detected default or user-specified (from -machine help)
    accelerator: zod_1.z.enum(['kvm', 'tcg']).default('tcg'), // KVM preferred, TCG fallback — per -accel docs
    cpuTopology: zod_1.z.object({
        sockets: zod_1.z.number().positive().optional(), // Per -smp docs (supports up to 2880 cpus)
        dies: zod_1.z.number().positive().optional(), // Supported for PC machines with socket/die topology  
        clusters: zod_1.z.number().positive().optional(), // Supported for ARM virt machines
        modules: zod_1.z.number().positive().optional(), // Supported for PC machines (sockets/dies/modules/cores)
        cores: zod_1.z.number().positive().optional(), // Per -smp docs — varies by machine type  
        threads: zod_1.z.number().positive().optional(), // Per -smp docs — varies by architecture
        maxcpus: zod_1.z.number().positive().optional(), // For CPU hotplug — per -machine cpu-hotplug docs  
    }),
    ramBytes: zod_1.z.number().min(16 * 1024 ** 2), // Minimum 16MB RAM (from -m flag docs)
    diskImages: zod_1.z.array(vmImageSchema),
    networkDevices: zod_1.z.array(networkDeviceSchema),
    serialConsole: zod_1.z.object({
        type: zod_1.z.enum(['mon', 'null', 'pty']), // Per -serial docs — mon for QMP interaction
        socketPath: zod_1.z.string().optional(), // Unix socket path for mon mode (per monitor chapter)
    }).default({ type: 'mon' }),
    vgaType: zod_1.z.enum(['std', 'virtio', 'qxl', 'vmware', 'none']).optional(), // Per -vga docs per arch
    biosPath: zod_1.z.string().optional(), // Required for ARM/RISC-V (per -bios docs)
});
// ─── Toolchain Types ────────────────────────────────────────────────
const toolchainVersionSchema = zod_1.z.object({
    version: zod_1.z.string(), // e.g., "13.2.0" for GCC, "2.45.1" for binutils
    downloadUrl: zod_1.z.string().url(), // Architecture-specific mirror URL (per QEMU tools docs recommendation)  
    checksumSha256: zod_1.z.string(), // Verification — per QEMU tools docs chapter on disk image security
});
const toolchainFamilySchema = zod_1.z.object({
    arch: zod_1.z.enum(exports.ARCHITECTURE), // Architecture this toolchain targets
    name: zod_1.z.string(), // e.g., "aarch64-linux-gnu" — from CROSS_COMPILE=aarch64-linux-gnu- in ARM docs
    compilers: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(), // e.g., "gcc", "g++", "ld", "as", "avr-gcc", "avrdude" (AVR-specific!)
        version: zod_1.z.string(), // Version of this specific binary
        downloadUrl: zod_1.z.string().url(), // Per-compiler download URL — per architecture-specific compiler docs
    })),
    interpreters: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(), // e.g., "qemu-aarch64" — runs ARM binaries on x86 host via user-mode emulation
        version: zod_1.z.string(), // QEMU version that provides this interpreter
    })).optional(), // Optional — not all architectures have a QEMU user-mode interpreter  
});
