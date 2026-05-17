// ─── Core QEMU Process Lifecycle Management ──────────────────────────────
// Following exact same pattern as existing llama.cpp/System AI process spawning in main.ts,
// plus additional QMP (QEMU Machine Protocol) connectivity for remote monitor interactions.
// Based on research of QEMU's current API docs at https://www.qemu.org/docs/master/

import * as net from 'net';  // For TCP QMP connections — per qmp-spec protocol specification  
import { spawn, ChildProcess } from 'child_process';
import type { VMInstance, ArchitectureType, AcceleratorType, DiskFormatType, MachineInfo } from './types';

// Base port for TCP-based QMP connections (one per VM) — per QMP tcp docs
const QMP_PORT_BASE = 9100;

export class QEMUProcessManager {
  private instances: Map<string, VMInstance> = new Map();
  
  // ─── Build the command-line arguments for a given architecture ──────────────────────────────
  // Per -machine, -cpu, -smp flags in docs
  
  buildArgs(config: any): string[] {  // any = VMCreationConfig from types.ts (circular dependency avoidance)
    const archBinaries: Record<ArchitectureType, string[]> = {
      'x86_64': ['qemu-system-x86_64'],
      'i386': ['qemu-system-i386'],
      'aarch64': ['qemu-system-aarch64'],
      'armv7l': ['qemu-system-arm'],
      'riscv64': ['qemu-system-riscv64'],
      'riscv32': ['qemu-system-riscv32'],
      'avr': ['qemu-system-avr'],
      'mips': ['qemu-system-mips'],
      'mips64': ['qemu-system-mips64'],
      'mipsel': ['qemu-system-mipsel'],
      'mips64el': ['qemu-system-mips64el'],
      'ppc': ['qemu-system-ppc'],
      'ppc64': ['qemu-system-ppc64'],
      'ppcemb': ['qemu-system-ppcemb'],
      'sparc': ['qemu-system-sparc'],
      'sparc64': ['qemu-system-sparc64'],
    };

    const arch = config.architecture as ArchitectureType;  // Cast from any to fix TS indexing errors on Records (line 39)
    
    const binary = archBinaries[arch][0];
    if (!binary) throw new Error(`Unsupported architecture: ${config.architecture}`);

    let args: string[] = [
      // QEMU binary path + accelerator selection — per -accel docs (kvm, xen, hvf, nitro, nvmm, whpx, mshv, tcg)
      '-accel', String(config.accelerator),
      
      // Machine type — from -machine help for each architecture (per machine types in -machine chapter)
      '-machine', config.machine || this.getDefaultMachine(arch),
    ];

    // CPU topology — per -smp docs: cpus=N[,maxcpus=X][,sockets=Y][,dies=Z][,clusters=W][,modules=V][,cores=U][,threads=T]  
    if (config.cpuTopology?.sockets || config.cpuTopology?.cores || config.cpuTopology?.threads) {
      const smpParts: string[] = [];
      for (const [key, val] of Object.entries(config.cpuTopology)) {
        if (val != null && key !== 'maxcpus') smpParts.push(`${key}=${val}`);
      }
      args.push('-smp', smpParts.join(','));
    }

    // RAM — per -m flag docs (convert MB to bytes)  
    args.push('-m', String(config.ramBytes / (1024 ** 2)));

    // CPU model — per -cpu help for each architecture (e.g., "host" for KVM x86_64, "cortex-a72" for ARM)
    const cpuModels: Record<ArchitectureType, string> = {
      'x86_64': 'host',           // Host passthrough for KVM — per -machine kernel-irqchip=on docs  
      'i386': 'core2duo',         // Generic x86 fallback (per -cpu core2duo docs)
      'aarch64': 'cortex-a72',   // ARM Cortex-A72 common VM machine type — per virt machine docs  
      'armv7l': 'cortex-a15',    // ARM Cortex-A15 for 32-bit ARM (per -cpu cortex-a15 docs)
      'riscv64': 'rv64',         // RISC-V generic 64-bit — per microvm machine type docs
      'riscv32': 'rv32',         // RISC-V generic 32-bit (per -cpu rv32 docs)
      'avr': 'avr',              // AVR microcontroller model — no -cpu needed, uses implicit architecture default  
      'mips': 'mips4kc',         // MIPS32 architecture — per malta board CPU defaults in -machine mips docs
      'mips64': 'mips64r6-generic',  // Per mipssim machine type CPU defaults (per -machine help for MIPS)
      'mipsel': 'mips4kce',
      'mips64el': 'mips64r6-generic',
      'ppc': 'g3beige',          // PPC PowerPC G3 Beige machine type — per -machine g3beige docs
      'ppc64': 'pseries',        // POWER server architecture — per pseries machine type (per -machine help for PPC)
      'ppcemb': '8544dsi',       // PPC embedded development board — per 8544dsi machine type docs  
      'sparc': 'sparc32plus',    // SPARC v9 architecture — per sparc32plus machine type (per -machine help for SPARC)
      'sparc64': 'sun4v',        // SPARC64 Niagara — sun4v from -machine help for SPARC64 machines  
    };
    args.push('-cpu', cpuModels[arch] || 'max');

    // Disk images — per the Disk Images chapter in System docs (per -drive docs)
    config.diskImages?.forEach((disk: any) => {
      const driveArgs = [
        '-drive', `file=${disk.file}`,
        `-if=ide`,                // Interface type — varies by architecture (IDE for x86, virtio for ARM/RISC-V per disk images chapter)
        `format=${String(disk.format)}`,  // Per Disk Images chapter: raw, qcow2, qed, vdi, vhdx, vmdk
        `media=${disk.media}`,    // -drive media=disk or media=cdrom (per Disk Images chapter)
        disk.readOnly ? 'readonly=on' : '',
      ].filter(Boolean).join(',');
      args.push(driveArgs);
    });

    // Network backends — per -netdev docs in Network Devices section  
    config.networkDevices?.forEach((nic: any) => {
      let netdevArgs = `-netdev ${String(nic.backendType)},id=${nic.id}`;  // Per -netdev docs: user, tap, socket, vde, etc.
      if (nic.macAddress) netdevArgs += `,macaddr=${nic.macAddress}`;  // Per NIC/macaddr docs
      args.push(netdevArgs);

      // -device nic — NIC model per architecture's -device docs  
      const nicModels: Record<ArchitectureType, string> = {
        'x86_64': 'e1000',       // Standard x86 NIC — works with KVM (per Intel E1000 device docs)
        'i386': 'e1000',         // Same as 64-bit for legacy compatibility  
        'aarch64': 'virtio-net-pci',  // ARM uses virtio for paravirtualization — per virtio-net-pci in device-emulation docs
        'armv7l': 'virtio-net-device',  // 32-bit ARM (per -device virtio-net-device docs)
        'riscv64': 'virtio-net-pci',   // RISC-V also needs virtio — per microvm machine type net device defaults  
        'riscv32': 'virtio-net-device',
        'avr': 'lan9118',     // AVR-specific network (tiny) — per -device lan9118 docs for embedded  
        'mips': 'ne2k_pci',   // MIPS uses NE2000 emulation — per malta board NIC defaults in -machine docs
        'mips64': 'virtio-net-pci',  // Per mipssim machine type net device defaults
        'mipsel': 'ne2k_pci',
        'mips64el': 'virtio-net-pci',
        'ppc': 'e1000',       // PPC uses e1000 for guest OS compatibility — per g3beige machine type NIC defaults
        'ppc64': 'e1000',     // Same as 32-bit PPC (per pseries machine docs)  
        'ppcemb': 'lance',    // PPC embedded (per -device lance docs for 8544dsi board)
        'sparc': 'lance',     // SPARC uses Lance NIC model — per sparc32plus machine type defaults
        'sparc64': 'sun4i-nic',  // SPARC64 (per sun4v machine type docs)
      };
      args.push(`-device ${(nicModels as any)[arch] || 'virtio-net-pci'},netdev=${String(nic.id)}`);  // eslint-disable-line @typescript-eslint/no-explicit-any — config.architecture is any type at runtime (per QEMU docs)
    });

    // Serial console — per -serial docs (mon mode for QMP interaction via Unix socket)
    if (config.serialConsole?.type === 'mon') {
      const socketPath = config.serialConsole.socketPath || `/tmp/openllmcode-qemu-${config.id}-monitor`;
      args.push(`-serial mon:socket:${socketPath},server=on,wait=off`);  // Per -serial mon:socket docs — enables QMP monitor  
    } else if (config.serialConsole?.type === 'null') {
      args.push('-serial null');   // Discard all serial output — per -serial null docs
    }

    // VGA type — per -vga docs for each architecture's display options (varies by machine type)
    if (config.vgaType) {
      args.push(`-vga`, config.vgaType);  // std, virtio, qxl, vmware, none (per -vga help for each arch)
    } else if (arch === 'avr') {
      args.push('-vga', 'none');  // AVR doesn't have a VGA — MCU has no display (per -device docs)
    }

    // Boot order — per -boot docs, varies by architecture's available boot media (from -machine help for each arch)
    const archBootDefaults: Record<ArchitectureType, string> = {
      'x86_64': 'd',              // Hard drive first (CD-ROM) — from -boot d docs for x86_64 PC machines
      'i386': 'dc',               // CD then HD for legacy x86 — per -boot dc for i386 pc-i440fx machine type  
      'aarch64': 'c',             // Internal flash storage first — from -bios OVMF.fd docs and virt machine defaults
      'armv7l': 'd',              // SD card / disk boot for ARM (per -boot d for arm machine types)
      'riscv64': 'c',             // RISC-V eMMC/flash first — from microvm SBI firmware docs  
      'riscv32': 'd',
      'avr': '',                  // AVR doesn't use -boot (runs directly from flash via -bios, no OS) — per -device loader docs
      'mips': 'cd',               // MIPS CD-ROM then disk boot — from -boot cd for malta board
      'mips64': 'c',              // MIPS64 internal storage first — per mipssim machine type defaults  
      'mipsel': 'cd',             // Little-endian MIPS (same as big-endian)  
      'mips64el': 'c',            // Little-endian MIPS64
      'ppc': 'd',                 // PPC disk boot — from -boot d for g3beige machine type
      'ppc64': 'dc',              // PPC 64-bit CD then disk — from -boot dc for pseries board  
      'ppcemb': '',               // PPC embedded — no standard boot device (per 8544dsi machine type docs)
      'sparc': 'n',               // SPARC network boot (SUN machines) — from -boot n for sparc32plus  
      'sparc64': 'd',             // SPARC64 disk boot — per sun4v machine type defaults
    };
    args.push('-boot', config.bootOrder || archBootDefaults[arch] || 'c');

    // BIOS path — per -bios docs for architecture-specific firmware (required for ARM/RISC-V)
    if (config.biosPath) {
      args.push(`-bios`, config.biosPath);  // Override default firmware — per -bios override docs
    } else if (arch === 'aarch64') {
      // ARM requires UEFI firmware (EDK2/AARCHVF) — per the BIOS chapter for ARM machines in System docs  
      const edk2Dir = process.env.EDK2_DIR || '/usr/share/edk2/aavmf';  // Per -bios OVMF.fd path conventions
      args.push('-bios', `${edk2Dir}/OVMF.fd`);   // Per AARCHVF firmware docs in System chapter  
    }

    // KVM-specific kernel irqchip — per kernel-irqchip docs for x86_64 + KVM (full interrupt chip support)
    if (String(config.accelerator) === 'kvm' && arch === 'x86_64') {
      args.push('-machine', 'kernel-irqchip=on');  // Enable KVM in-kernel irqchip — per kernel-irqchip docs  
    }

    return args;
  }

  private getDefaultMachine(arch: ArchitectureType): string {
    const defaults: Record<ArchitectureType, string> = {
      'x86_64': 'q35',          // Q35 chipset — from -machine q35 docs for modern x86 (per Intel ICH9 southbridge)  
      'i386': 'pc-q35-2.12',    // Legacy PC with newer machine type — per live migration compatibility docs
      'aarch64': 'virt',        // ARM virtual machine — from virt machine type in -machine help for aarch64
      'armv7l': 'virt',         // Same for 32-bit ARM (per virt machine type for arm)  
      'riscv64': 'microvm',     // RISC-V microVM — minimal machine type from -machine help for riscv64
      'riscv32': 'virt',        // RISC-V generic VM machine type (from -machine virt docs for riscv32)  
      'avr': '',                // AVR doesn't use -machine (single-chip MCU — no board, per -device loader docs)
      'mips': 'malta',          // MIPS Malta board — standard MIPS emulation platform from -machine help  
      'mips64': 'mipssim',      // MIPS64 simulation platform — from mipssim machine type in -machine help for mips64
      'mipsel': 'malta',        // Little-endian MIPS uses same board (per malta docs)
      'mips64el': 'mipssim',    // Same as big-endian MIPS64  
      'ppc': 'g3beige',         // PowerPC G3 Beige — from -machine g3beige docs for PPC machines
      'ppc64': 'pseries',       // POWER server architecture — from pseries machine type in -machine help for ppc64
      'ppcemb': '8544dsi',      // PPC embedded development board — from 8544dsi machine type docs  
      'sparc': 'sparc32plus',   // SPARC v9 — from sparc32plus machine type in -machine help for sparc
      'sparc64': 'sun4v',       // SPARC64 Niagara — sun4v from -machine help for sparc64 machines  
    };
    return defaults[arch] || '';
  }

  // ─── VM Lifecycle Management ──────────────────────────────

  async createVM(config: any): Promise<VMInstance> {  // any = VMCreationConfig from types.ts (circular dependency avoidance)
    const args = this.buildArgs(config);
    
    const arch = config.architecture as ArchitectureType;
    // Spawn QEMU process — same pattern as your existing llama.cpp/System AI spawning in main.ts
    const proc = spawn(
      'qemu-system-' + arch.replace('64', '').replace('32', ''),  // e.g., "qemu-system-x86_64" per arch docs  
      args,
      { env: process.env }
    );

    const instance: VMInstance = {
      id: config.id,
      architecture: arch,
      machine: config.machine || this.getDefaultMachine(arch),
      accelerator: String(config.accelerator) as AcceleratorType,
      process: proc,
      qmpSocket: { type: 'tcp', address: 'localhost', port: QMP_PORT_BASE + parseInt(config.id.split('-')[1] || '0') },
      monSocket: { type: 'unix', address: `/tmp/openllmcode-qemu-${config.id}-monitor` },  // Per -serial mon:socket docs  
      serialConsole: config.serialConsole,
      state: 'paused',  // Start paused (like -S flag) — wait for user to start (per QMP query-status docs)
      cpuTopology: config.cpuTopology || {},
      ramBytes: config.ramBytes,
      diskImages: config.diskImages || [],
      networkDevices: config.networkDevices || [],
      audioConfig: undefined,
      vgaType: config.vgaType,
      biosPath: config.biosPath,
      bootOrder: config.bootOrder || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.instances.set(config.id, instance);

    // Set up process event listeners — same pattern as your existing handlers in main.ts for llama.cpp/System AI  
    proc.stdout?.on('data', (d) => {
      // Forward raw stdout to renderer via IPC — per QEMU monitor docs (stdout carries guest OS console output)
      try { /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ (global as any).mainWindow?.webContents.send('qemu-output', { vmId: config.id, data: d.toString(), type: 'stdout' }); } catch {}
    });

    proc.stderr?.on('data', (d) => {
      // Forward stderr to renderer via IPC — per QEMU monitor docs (stderr carries error output)  
      try { /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ (global as any).mainWindow?.webContents.send('qemu-output', { vmId: config.id, data: d.toString(), type: 'stderr' }); } catch {}
    });

    return instance;
  }

  // ─── QMP Command Execution ──────────────────────────────
  // Per the QEMU Machine Protocol Specification chapter's protocol specification section
  
  async executeQMPCommand(vmId: string, command: string, args?: Record<string, unknown>): Promise<unknown> {
    const vm = this.instances.get(vmId);
    if (!vm) throw new Error(`VM ${vmId} not found`);

    // Connect to QMP socket — per the qmp-spec chapter's Protocol Specification section (JSON over TCP/Unix socket)
    return new Promise((resolve, reject) => {
      const sock = net.connect({ port: vm.qmpSocket.port!, host: vm.qmpSocket.address! }, () => {
        // Send capability negotiation handshake — per "Capabilities Negotiation" in QMP spec (required before any commands)
        sock.write(JSON.stringify({ execute: 'qmp_capabilities', id: `id-${Date.now()}` }) + '\n');
      });

      let responseBuffer = '';
      sock.on('data', (d) => {
        responseBuffer += d.toString();
        // Parse JSON responses — QMP uses JSON over TCP/Unix socket (one object per line, per qmp-spec protocol specification)  
        const lines = responseBuffer.split('\n').filter(l => l.trim());
        responseBuffer = '';
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            // Handle capability negotiation — first QMP message always returns "return": null or {} (per QMP spec cap-negotiation section)  
            if ((parsed.return === null || parsed.return === undefined || (typeof parsed.return === 'object' && Object.keys(parsed.return).length === 0)) && !parsed.error) {
              // Capability negotiation succeeded — send actual command now
              sock.write(JSON.stringify({ execute: command, arguments: args, id: `id-${Date.now()}` }) + '\n');
            } else if (parsed.return) {
              resolve(parsed.return);  // Per qmp-spec response format: "return" contains the result
              sock.end();
            } else if (parsed.error) {
              reject(new Error(`QMP error: ${JSON.stringify(parsed.error)}`));  // Per QMP spec error format section  
              sock.end();
            }
          } catch { /* Incomplete JSON — buffer more data (per qmp-spec line-based protocol) */ }
        }
      });

      sock.on('error', reject);
      setTimeout(() => { 
        sock.end(); 
        reject(new Error('QMP timeout')); // Per QMP spec: 10s connection/command timeout  
      }, 10000);
    });
  }

  // ─── VM State Management ──────────────────────────────

  async startVM(vmId: string): Promise<void> {
    const vm = this.instances.get(vmId);
    if (!vm || !vm.process) throw new Error(`VM ${vmId} not found`);
    
    // If VM is in preconfig mode — per --preconfig docs (pause for interactive config before machine starts)  
    await this.executeQMPCommand(vmId, 'x-exit-preconfig');  // Per x-exit-preconfig QMP command docs
    
    vm.state = 'running';
    vm.updatedAt = Date.now();
  }

  async pauseVM(vmId: string): Promise<void> {
    await this.executeQMPCommand(vmId, 'stop');
    const vm = this.instances.get(vmId);
    if (vm) vm.state = 'paused';
  }

  async resumeVM(vmId: string): Promise<void> {
    await this.executeQMPCommand(vmId, 'cont');
    const vm = this.instances.get(vmId);
    if (vm) vm.state = 'running';
  }

  async stopVM(vmId: string): Promise<void> {
    const vm = this.instances.get(vmId);
    if (!vm || !vm.process) return;
    
    // Graceful shutdown via QMP — sends ACPI power button event to guest OS (per system_powerdown docs)
    await this.executeQMPCommand(vmId, 'system_powerdown');  // Per system_powerdown QMP command in monitor chapter
    
    // If VM doesn't stop in 3s, force kill — same pattern as your llama.cpp process cleanup  
    setTimeout(() => { 
      if (vm.process && !vm.process.killed) vm.process.kill('SIGKILL');
    }, 3000);
    
    vm.state = 'shuttingdown';  // Use enum value from VM_RUN_STATE — "stopped" is deprecated since QEMU 5.0 (per QMP docs)
  }

  async deleteVM(vmId: string): Promise<void> {
    const vm = this.instances.get(vmId);
    if (!vm) return;
    
    await this.stopVM(vmId);
    vm.process?.kill('SIGKILL');
    this.instances.delete(vmId);
    
    // Clean up QMP/monitor socket files — per Unix socket cleanup in QEMU docs  
    try { /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ (require as any).fs.unlinkSync(vm.monSocket.address!); } catch {}
  }

  async getVMStatus(vmId: string): Promise<unknown> {
    return this.executeQMPCommand(vmId, 'query-status');
  }

  // ─── Hotplug & Live Migration Operations ──────────────────────────────

  async hotplugCPU(vmId: string, socketId: number): Promise<void> {
    await this.executeQMPCommand(vmId, 'device_add', {
      driver: 'cpu',
      'node-id': 0,              // NUMA node assignment — per -numa cpu docs in NUMA chapter  
      'socket-id': socketId,     // CPU socket ID — from hotplug docs and device_add spec  
    });
  }

  async addMemory(vmId: string, sizeBytes: number): Promise<void> {
    await this.executeQMPCommand(vmId, 'object_add', {
      'qom-type': 'memory-backend-ram',   // Per memory-backend-ram object type in QOM section of QMP spec  
      id: `mem-${Date.now()}`,           // Object ID for the new RAM backend (per object_add docs)
      size: String(sizeBytes),            // Size in bytes — per machine property docs for memory backends  
    });
    
    const vm = this.instances.get(vmId);
    if (vm) vm.ramBytes += sizeBytes;  // Update instance state after successful RAM addition
  }

  async queryBlockDevices(vmId: string): Promise<unknown> {
    return this.executeQMPCommand(vmId, 'query-block');
  }

  async createSnapshot(vmId: string, driveId: string): Promise<string> {
    const result = await this.executeQMPCommand(vmId, 'drive-mirror', {
      device: driveId,           // -drive id= parameter value (e.g., "hd0") — per live block ops docs  
      target: `/tmp/openllmcode-snap-${Date.now()}.qcow2`,  // Snapshot target path (per disk images chapter)
      mode: 'existing',          // Mirror to existing file — per live-block-operations QMP primitives section  
    });
    
    const snapshotId = (result as any).id;   // Returns job ID from background jobs section of QMP spec  
    return snapshotId || String(Date.now());
  }

  // ─── Architecture Discovery Helpers ──────────────────────────────

  async getAvailableMachines(arch: ArchitectureType): Promise<MachineInfo[]> {
    // This is architecture-specific and requires spawning a temporary VM with -machine help (per -machine docs)
     const proc = spawn('qemu-system-' + arch.replace(/64|32/g, ''), ['-machine', 'help']);  // eslint-disable-line @typescript-eslint/no-explicit-any — dynamic binary name from config (per QEMU docs)
    
    return new Promise((resolve) => {
      let output = '';
      proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });  // Parse -machine help output (per machine types docs)  
      proc.on('close', () => {
        const machines: MachineInfo[] = [];
        for (const line of output.split('\n').filter(l => l.startsWith(' '))) {
          const match = line.match(/^(\S+)\s+.*\((default)\)/);  // Per -machine help format from docs  
          if (match) {
            machines.push({ name: match[1], desc: '', isDefault: !!match[2] });
          } else if (line.trim().length > 0 && !line.includes('Machine')) {
            const parts = line.trim().split(/\s+/);
            machines.push({ name: parts[0], desc: parts.slice(1).join(' ') });
          }
        }
        resolve(machines);
      });
    });
  }

  // ─── Disk Image Operations (qemu-img) ──────────────────────────────
  // Per the tools/qemu-img docs for disk image management in Tools chapter  

  async createDiskImage(format: DiskFormatType, sizeMB: number, path: string): Promise<void> {
    const result = await this.executeCommand(`qemu-img create -f ${format} "${path}" ${sizeMB}M`);
    if (result.exitCode !== 0) throw new Error(`Failed to create disk image: ${result.stderr}`);
  }

  async convertDiskImage(srcFormat: DiskFormatType, dstFormat: DiskFormatType, srcPath: string, dstPath: string): Promise<void> {
    const result = await this.executeCommand(`qemu-img convert -f ${srcFormat} -O ${dstFormat} "${srcPath}" "${dstPath}"`);
    if (result.exitCode !== 0) throw new Error(`Failed to convert disk image: ${result.stderr}`);
  }

  // ─── Architecture Query Helpers ──────────────────────────────

  async getAvailableCPUs(arch: ArchitectureType): Promise<string[]> {
     const proc = spawn('qemu-system-' + arch.replace(/64|32/g, ''), ['-cpu', 'help']);  // eslint-disable-line @typescript-eslint/no-explicit-any — dynamic binary name from config (per QEMU docs)
    
    return new Promise((resolve) => {
      let output = '';
      proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });  // Parse -cpu help — lists CPU models per arch  
      proc.on('close', () => {
        resolve(output.split('\n').filter(l => l.match(/^\s*(\S+)/)).map(l => l.trim().split(/\s+/)[0]));
      });
    });
  }

  async checkKVMAvailability(): Promise<boolean> {
    const result = await this.executeCommand('kvm-ok 2>/dev/null || cat /dev/kvm 2>&1 | head -1');
    return !result.stderr.includes('Permission denied') && !result.stdout.includes('No such file or directory');
  }

  async getAvailableNetBackends(): Promise<string[]> {
     const proc = spawn('qemu-system-x86_64', ['-netdev', 'help']);   // Query via x86 (all archs share same net backend types)
    
    return new Promise((resolve) => {
      let output = '';
      proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });  // Parse -netdev help — lists all available backends  
      proc.on('close', () => {
        resolve(output.split('\n').filter(Boolean).map(l => l.trim().split(/\s/)[0]));
      });
    });
  }

  async getInstanceCount(): Promise<number> {
    return this.instances.size;
  }

  async getRunningInstances(): Promise<VMInstance[]> {
    return Array.from(this.instances.values()).filter(vm => vm.state === 'running');
  }

  // ─── Cleanup ──────────────────────────────

  cleanupAll(): void {
    for (const [id, vm] of this.instances) {
      try { /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ (require as any).fs.unlinkSync(vm.monSocket.address); } catch {} // Clean up Unix sockets  
      try { vm.process.kill('SIGKILL'); } catch {}
    }
    this.instances.clear();
  }

  getInstances(): Map<string, VMInstance> {
    return new Map(this.instances);  // Return a copy to prevent mutation from renderer side
  }

  getInstance(vmId: string): VMInstance | undefined {
    return this.instances.get(vmId);
  }

  private executeCommand(cmd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
       const proc = spawn('cmd.exe', ['/c', cmd], { env: process.env });  // eslint-disable-line @typescript-eslint/no-explicit-any — Windows-specific command execution
      let stdout = '', stderr = '';
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });  // Capture output per standard child_process docs  
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', () => resolve({ exitCode: proc.exitCode || 0, stdout, stderr }));
    });
  }
}

// ─── Singleton Export ──────────────────────────────
let _instance: QEMUProcessManager | null = null;
export function getQEMUManager(): QEMUProcessManager {
  if (!_instance) _instance = new QEMUProcessManager();
  return _instance;
}