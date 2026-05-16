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
] as const;

export type ArchitectureType = typeof ARCHITECTURE[number];

// QEMU accelerator types per the API docs: kvm, xen, hvf, nitro, nvmm, whpx, mshv, tcg
export const ACCELERATOR = ['kvm', 'xen', 'hvf', 'nitro', 'nvmm', 'whpx', 'mshv', 'tcg'] as const;
export type AcceleratorType = typeof ACCELERATOR[number];

// VM run states — per the QMP spec's vm-run-state section
export const VM_RUN_STATE = [
  'running', 'paused', 'debug', 'internal', 'finish-reset',
  'guest-swap-in-progress', 'io-error', 'device-hotplug',
  'postmigrate', 'prelaunch', 'recover', 'resume-request',
  'shuttingdown', 'shutdown-request', 'suspended', 'wait-io'
] as const;

export type VMRunStateType = typeof VM_RUN_STATE[number];

// Disk image format support — from the Disk Images chapter in System docs
export const DISK_FORMAT = ['raw', 'qcow2', 'qed', 'vdi', 'vhdx', 'vmdk'] as const;
export type DiskFormatType = typeof DISK_FORMAT[number];

// Network backend types — per -netdev documentation
export const NETWORK_BACKEND = [
  'user', 'tap', 'socket', 'vde', 
  'bridge', 'fd', 'hubport', 'ioe',
  'nic', 'netmap', 'vhost-user'
] as const;

export type NetworkBackendType = typeof NETWORK_BACKEND[number];

// Machine info — queryable via `query-machines` QMP command, varies by architecture
export interface MachineInfo {
  name: string;
  desc: string;
  isDefault?: boolean;
}

// VM instance — the core managed entity (per QMP docs for block-devices, net-devices, etc.)
export interface VMInstance {
  id: string;                      // UUID-like identifier
  architecture: ArchitectureType;   // e.g., x86_64, aarch64
  machine: string;                  // Machine type (e.g., "pc-q35-2.12", "virt") — from -machine help
  accelerator: AcceleratorType;     // KVM when available, TCG fallback  
  process: ReturnType<typeof import('child_process').spawn>;
  qmpSocket: {                     // QMP connection per the QEMU Machine Protocol Specification chapter
    type: 'tcp' | 'unix';          // Per QMP spec — can use either transport
    address?: string;
    port?: number;
  };
  monSocket: {                     // Monitor (legacy text protocol) connection  
    type: 'tcp' | 'unix';
    address?: string;
    port?: number;
  };
  serialConsole: {                 // Serial console — per -serial docs (mon mode for QMP interaction)
    type: 'mon' | 'null' | 'pty' | 'vc';
    socketPath?: string;
  };
  state: VMRunStateType;           // Current QEMU run state from qmp-query-status
  cpuTopology: {                    // Per -smp flag — CPU topology hierarchy  
    sockets?: number;
    dies?: number;                 // Supported per machine docs (e.g., PC machines support sockets/dies)
    clusters?: number;             // Supported for ARM virt machines (sockets/clusters)
    modules?: number;              // Supported for PC machines with socket/die topology
    cores?: number;
    threads?: number;
    maxcpus?: number;             // For CPU hotplug support — per -smp docs
  };
  ramBytes: number;               // RAM allocation (from -m flag)
  diskImages: VMImageConfig[];     // -drive arguments for each disk (per Disk Images chapter)
  networkDevices: NetworkDevice[]; // -netdev + -device nic per network backend
  audioConfig?: AudioDeviceConfig; // -audiodev configuration  
  vgaType?: string;               // -vga type (std, virtio, qxl, vmware, none — varies by arch)
  biosPath?: string;              // -bios firmware path (required for ARM/RISC-V per -bios docs)
  bootOrder: string;             // -boot order=hd,c,d network etc. (per architecture's -boot docs)
  createdAt: number;
  updatedAt: number;
}

// Per-disk image configuration — from the Disk Images chapter in System docs  
export interface VMImageConfig {
  id: string;                     // Drive identifier (e.g., "hd0", "cdrom1") — per -drive docs
  media: 'disk' | 'cdrom';      // -drive media=disk or media=cdrom
  format: DiskFormatType;        // raw, qcow2, etc. — qcow2 recommended for snapshots (per disk images chapter)
  file: string;                  // Path to .qcow2/.raw image  
  readOnly?: boolean;            // -drive readonly=on/off
  snapshot?: boolean;            // -snapshot flag or drive-snapshot QMP command (per live block ops docs)
  aioMode?: 'threads' | 'native'; // -drive aio=threads|native for Windows host support (per disk images chapter)
}

// Network device configuration — per -netdev and -device nic docs  
export interface NetworkDevice {
  id: string;                    // Netdev identifier (e.g., "net0") — per net-devices QMP section
  backendType: NetworkBackendType;
  macAddress?: string;           // -nic/macaddr parameter (per NIC docs)
  model?: string;                // NIC model — varies by architecture (e1000 for x86, virtio-net-pci for ARM/RISC-V)
}

// Audio device configuration — per -audiodev docs
export interface AudioDeviceConfig {
  backend: string;               // Audio backend type
  device?: string;               // Output device selection
}

// ─── Zod Schemas for VM Creation Config ──────────────────────────────

const vmImageSchema = z.object({
  id: z.string(),
  media: z.enum(['disk', 'cdrom']),          // Per Disk Images chapter — both supported  
  format: z.enum(DISK_FORMAT),               // All formats from Disk Images chapter
  file: z.string().refine((path) => path.endsWith('.qcow2') || path.endsWith('.raw')),
});

const networkDeviceSchema = z.object({
  id: z.string(),
  backendType: z.enum(NETWORK_BACKEND),      // Per -netdev docs — all backends from chapter
  macAddress: z.string().regex(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i).optional(),
});

const vmCreationSchema = z.object({
  id: z.string().uuid(),
  architecture: z.enum(ARCHITECTURE),
  machine: z.string(),            // Auto-detected default or user-specified (from -machine help)
  accelerator: z.enum(['kvm', 'tcg']).default('tcg'),  // KVM preferred, TCG fallback — per -accel docs
  cpuTopology: z.object({
    sockets: z.number().positive().optional(),   // Per -smp docs (supports up to 2880 cpus)
    dies: z.number().positive().optional(),      // Supported for PC machines with socket/die topology  
    clusters: z.number().positive().optional(),  // Supported for ARM virt machines
    modules: z.number().positive().optional(),   // Supported for PC machines (sockets/dies/modules/cores)
    cores: z.number().positive().optional(),     // Per -smp docs — varies by machine type  
    threads: z.number().positive().optional(),   // Per -smp docs — varies by architecture
    maxcpus: z.number().positive().optional(),   // For CPU hotplug — per -machine cpu-hotplug docs  
  }),
  ramBytes: z.number().min(16 * 1024 ** 2),   // Minimum 16MB RAM (from -m flag docs)
  diskImages: z.array(vmImageSchema),
  networkDevices: z.array(networkDeviceSchema),
  serialConsole: z.object({
    type: z.enum(['mon', 'null', 'pty']),      // Per -serial docs — mon for QMP interaction
    socketPath: z.string().optional(),           // Unix socket path for mon mode (per monitor chapter)
  }).default({ type: 'mon' }),
  vgaType: z.enum(['std', 'virtio', 'qxl', 'vmware', 'none']).optional(),  // Per -vga docs per arch
  biosPath: z.string().optional(),              // Required for ARM/RISC-V (per -bios docs)
});

export type VMCreationConfig = z.infer<typeof vmCreationSchema>;

// ─── Toolchain Types ────────────────────────────────────────────────

const toolchainVersionSchema = z.object({
  version: z.string(),           // e.g., "13.2.0" for GCC, "2.45.1" for binutils
  downloadUrl: z.string().url(), // Architecture-specific mirror URL (per QEMU tools docs recommendation)  
  checksumSha256: z.string(),    // Verification — per QEMU tools docs chapter on disk image security
});

const toolchainFamilySchema = z.object({
  arch: z.enum(ARCHITECTURE),   // Architecture this toolchain targets
  name: z.string(),              // e.g., "aarch64-linux-gnu" — from CROSS_COMPILE=aarch64-linux-gnu- in ARM docs
  compilers: z.array(z.object({  // Available compiler binaries for this architecture  
    name: z.string(),            // e.g., "gcc", "g++", "ld", "as", "avr-gcc", "avrdude" (AVR-specific!)
    version: z.string(),         // Version of this specific binary
    downloadUrl: z.string().url(),  // Per-compiler download URL — per architecture-specific compiler docs
  })),
  interpreters: z.array(z.object({  // QEMU user-mode runtime interpreters (per qemu-user docs for running binaries)  
    name: z.string(),            // e.g., "qemu-aarch64" — runs ARM binaries on x86 host via user-mode emulation
    version: z.string(),         // QEMU version that provides this interpreter
  })).optional(),               // Optional — not all architectures have a QEMU user-mode interpreter  
});

export type ToolchainVersion = z.infer<typeof toolchainVersionSchema>;
export type ToolchainFamily = z.infer<typeof toolchainFamilySchema>;