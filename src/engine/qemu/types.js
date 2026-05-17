// ─── QEMU/KVM Simulation Layer Types ──────────────────────────────
// Based on research of QEMU's current API docs at https://www.qemu.org/docs/master/
// Key interfaces: QMP (JSON over TCP/Unix socket), QEMU Monitor (legacy text protocol)
import { z } from 'zod';
// Per-architecture type mapping — matches qemu-system-* binary naming convention
export const ARCHITECTURE = [
    'x86_64', 'i386',
    'aarch64', 'armv7l',
    'riscv32', 'riscv64',
    'avr',
    'mips', 'mips64', 'mipsel', 'mips64el',
    'ppc', 'ppc64', 'ppcemb',
    'sparc', 'sparc64',
];
// QEMU accelerator types per the API docs: kvm, xen, hvf, nitro, nvmm, whpx, mshv, tcg
export const ACCELERATOR = ['kvm', 'xen', 'hvf', 'nitro', 'nvmm', 'whpx', 'mshv', 'tcg'];
// VM run states — per the QMP spec's vm-run-state section
export const VM_RUN_STATE = [
    'running', 'paused', 'debug', 'internal', 'finish-reset',
    'guest-swap-in-progress', 'io-error', 'device-hotplug',
    'postmigrate', 'prelaunch', 'recover', 'resume-request',
    'shuttingdown', 'shutdown-request', 'suspended', 'wait-io'
];
// Disk image format support — from the Disk Images chapter in System docs
export const DISK_FORMAT = ['raw', 'qcow2', 'qed', 'vdi', 'vhdx', 'vmdk'];
// Network backend types — per -netdev documentation
export const NETWORK_BACKEND = [
    'user', 'tap', 'socket', 'vde',
    'bridge', 'fd', 'hubport', 'ioe',
    'nic', 'netmap', 'vhost-user'
];
// ─── Zod Schemas for VM Creation Config ──────────────────────────────
const vmImageSchema = z.object({
    id: z.string(),
    media: z.enum(['disk', 'cdrom']), // Per Disk Images chapter — both supported  
    format: z.enum(DISK_FORMAT), // All formats from Disk Images chapter
    file: z.string().refine((path) => path.endsWith('.qcow2') || path.endsWith('.raw')),
});
const networkDeviceSchema = z.object({
    id: z.string(),
    backendType: z.enum(NETWORK_BACKEND), // Per -netdev docs — all backends from chapter
    macAddress: z.string().regex(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i).optional(),
});
const vmCreationSchema = z.object({
    id: z.string().uuid(),
    architecture: z.enum(ARCHITECTURE),
    machine: z.string(), // Auto-detected default or user-specified (from -machine help)
    accelerator: z.enum(['kvm', 'tcg']).default('tcg'), // KVM preferred, TCG fallback — per -accel docs
    cpuTopology: z.object({
        sockets: z.number().positive().optional(), // Per -smp docs (supports up to 2880 cpus)
        dies: z.number().positive().optional(), // Supported for PC machines with socket/die topology  
        clusters: z.number().positive().optional(), // Supported for ARM virt machines
        modules: z.number().positive().optional(), // Supported for PC machines (sockets/dies/modules/cores)
        cores: z.number().positive().optional(), // Per -smp docs — varies by machine type  
        threads: z.number().positive().optional(), // Per -smp docs — varies by architecture
        maxcpus: z.number().positive().optional(), // For CPU hotplug — per -machine cpu-hotplug docs  
    }),
    ramBytes: z.number().min(16 * 1024 ** 2), // Minimum 16MB RAM (from -m flag docs)
    diskImages: z.array(vmImageSchema),
    networkDevices: z.array(networkDeviceSchema),
    serialConsole: z.object({
        type: z.enum(['mon', 'null', 'pty']), // Per -serial docs — mon for QMP interaction
        socketPath: z.string().optional(), // Unix socket path for mon mode (per monitor chapter)
    }).default({ type: 'mon' }),
    vgaType: z.enum(['std', 'virtio', 'qxl', 'vmware', 'none']).optional(), // Per -vga docs per arch
    biosPath: z.string().optional(), // Required for ARM/RISC-V (per -bios docs)
});
// ─── Toolchain Types ────────────────────────────────────────────────
const toolchainVersionSchema = z.object({
    version: z.string(), // e.g., "13.2.0" for GCC, "2.45.1" for binutils
    downloadUrl: z.string().url(), // Architecture-specific mirror URL (per QEMU tools docs recommendation)  
    checksumSha256: z.string(), // Verification — per QEMU tools docs chapter on disk image security
});
const toolchainFamilySchema = z.object({
    arch: z.enum(ARCHITECTURE), // Architecture this toolchain targets
    name: z.string(), // e.g., "aarch64-linux-gnu" — from CROSS_COMPILE=aarch64-linux-gnu- in ARM docs
    compilers: z.array(z.object({
        name: z.string(), // e.g., "gcc", "g++", "ld", "as", "avr-gcc", "avrdude" (AVR-specific!)
        version: z.string(), // Version of this specific binary
        downloadUrl: z.string().url(), // Per-compiler download URL — per architecture-specific compiler docs
    })),
    interpreters: z.array(z.object({
        name: z.string(), // e.g., "qemu-aarch64" — runs ARM binaries on x86 host via user-mode emulation
        version: z.string(), // QEMU version that provides this interpreter
    })).optional(), // Optional — not all architectures have a QEMU user-mode interpreter  
});
