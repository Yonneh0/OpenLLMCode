import { z } from 'zod';
export declare const ARCHITECTURE: readonly ["x86_64", "i386", "aarch64", "armv7l", "riscv32", "riscv64", "avr", "mips", "mips64", "mipsel", "mips64el", "ppc", "ppc64", "ppcemb", "sparc", "sparc64"];
export type ArchitectureType = typeof ARCHITECTURE[number];
export declare const ACCELERATOR: readonly ["kvm", "xen", "hvf", "nitro", "nvmm", "whpx", "mshv", "tcg"];
export type AcceleratorType = typeof ACCELERATOR[number];
export declare const VM_RUN_STATE: readonly ["running", "paused", "debug", "internal", "finish-reset", "guest-swap-in-progress", "io-error", "device-hotplug", "postmigrate", "prelaunch", "recover", "resume-request", "shuttingdown", "shutdown-request", "suspended", "wait-io"];
export type VMRunStateType = typeof VM_RUN_STATE[number];
export declare const DISK_FORMAT: readonly ["raw", "qcow2", "qed", "vdi", "vhdx", "vmdk"];
export type DiskFormatType = typeof DISK_FORMAT[number];
export declare const NETWORK_BACKEND: readonly ["user", "tap", "socket", "vde", "bridge", "fd", "hubport", "ioe", "nic", "netmap", "vhost-user"];
export type NetworkBackendType = typeof NETWORK_BACKEND[number];
export interface MachineInfo {
    name: string;
    desc: string;
    isDefault?: boolean;
}
export interface VMInstance {
    id: string;
    architecture: ArchitectureType;
    machine: string;
    accelerator: AcceleratorType;
    process: ReturnType<typeof import('child_process').spawn>;
    qmpSocket: {
        type: 'tcp' | 'unix';
        address?: string;
        port?: number;
    };
    monSocket: {
        type: 'tcp' | 'unix';
        address?: string;
        port?: number;
    };
    serialConsole: {
        type: 'mon' | 'null' | 'pty' | 'vc';
        socketPath?: string;
    };
    state: VMRunStateType;
    cpuTopology: {
        sockets?: number;
        dies?: number;
        clusters?: number;
        modules?: number;
        cores?: number;
        threads?: number;
        maxcpus?: number;
    };
    ramBytes: number;
    diskImages: VMImageConfig[];
    networkDevices: NetworkDevice[];
    audioConfig?: AudioDeviceConfig;
    vgaType?: string;
    biosPath?: string;
    bootOrder: string;
    createdAt: number;
    updatedAt: number;
}
export interface VMImageConfig {
    id: string;
    media: 'disk' | 'cdrom';
    format: DiskFormatType;
    file: string;
    readOnly?: boolean;
    snapshot?: boolean;
    aioMode?: 'threads' | 'native';
}
export interface NetworkDevice {
    id: string;
    backendType: NetworkBackendType;
    macAddress?: string;
    model?: string;
}
export interface AudioDeviceConfig {
    backend: string;
    device?: string;
}
declare const vmCreationSchema: z.ZodObject<{
    id: z.ZodString;
    architecture: z.ZodEnum<{
        x86_64: "x86_64";
        i386: "i386";
        aarch64: "aarch64";
        armv7l: "armv7l";
        riscv32: "riscv32";
        riscv64: "riscv64";
        avr: "avr";
        mips: "mips";
        mips64: "mips64";
        mipsel: "mipsel";
        mips64el: "mips64el";
        ppc: "ppc";
        ppc64: "ppc64";
        ppcemb: "ppcemb";
        sparc: "sparc";
        sparc64: "sparc64";
    }>;
    machine: z.ZodString;
    accelerator: z.ZodDefault<z.ZodEnum<{
        kvm: "kvm";
        tcg: "tcg";
    }>>;
    cpuTopology: z.ZodObject<{
        sockets: z.ZodOptional<z.ZodNumber>;
        dies: z.ZodOptional<z.ZodNumber>;
        clusters: z.ZodOptional<z.ZodNumber>;
        modules: z.ZodOptional<z.ZodNumber>;
        cores: z.ZodOptional<z.ZodNumber>;
        threads: z.ZodOptional<z.ZodNumber>;
        maxcpus: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    ramBytes: z.ZodNumber;
    diskImages: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        media: z.ZodEnum<{
            disk: "disk";
            cdrom: "cdrom";
        }>;
        format: z.ZodEnum<{
            raw: "raw";
            qcow2: "qcow2";
            qed: "qed";
            vdi: "vdi";
            vhdx: "vhdx";
            vmdk: "vmdk";
        }>;
        file: z.ZodString;
    }, z.core.$strip>>;
    networkDevices: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        backendType: z.ZodEnum<{
            user: "user";
            tap: "tap";
            socket: "socket";
            vde: "vde";
            bridge: "bridge";
            fd: "fd";
            hubport: "hubport";
            ioe: "ioe";
            nic: "nic";
            netmap: "netmap";
            "vhost-user": "vhost-user";
        }>;
        macAddress: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    serialConsole: z.ZodDefault<z.ZodObject<{
        type: z.ZodEnum<{
            mon: "mon";
            null: "null";
            pty: "pty";
        }>;
        socketPath: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    vgaType: z.ZodOptional<z.ZodEnum<{
        std: "std";
        virtio: "virtio";
        qxl: "qxl";
        vmware: "vmware";
        none: "none";
    }>>;
    biosPath: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type VMCreationConfig = z.infer<typeof vmCreationSchema>;
declare const toolchainVersionSchema: z.ZodObject<{
    version: z.ZodString;
    downloadUrl: z.ZodString;
    checksumSha256: z.ZodString;
}, z.core.$strip>;
declare const toolchainFamilySchema: z.ZodObject<{
    arch: z.ZodEnum<{
        x86_64: "x86_64";
        i386: "i386";
        aarch64: "aarch64";
        armv7l: "armv7l";
        riscv32: "riscv32";
        riscv64: "riscv64";
        avr: "avr";
        mips: "mips";
        mips64: "mips64";
        mipsel: "mipsel";
        mips64el: "mips64el";
        ppc: "ppc";
        ppc64: "ppc64";
        ppcemb: "ppcemb";
        sparc: "sparc";
        sparc64: "sparc64";
    }>;
    name: z.ZodString;
    compilers: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
        downloadUrl: z.ZodString;
    }, z.core.$strip>>;
    interpreters: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type ToolchainVersion = z.infer<typeof toolchainVersionSchema>;
export type ToolchainFamily = z.infer<typeof toolchainFamilySchema>;
export {};
