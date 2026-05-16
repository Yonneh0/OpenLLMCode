// ─── QEMU/KVM Simulation Layer — VM Creation Wizard ──────────────────────────────
// Architecture: F.1-F.3 per plan.md (core QEMU integration, architecture support, toolchain)
// All 16 architectures available per ARCHITECTURE enum in types.ts

import React, { useCallback, useEffect, useState } from 'react';
import type { ArchitectureType, AcceleratorType, DiskFormatType, NetworkBackendType } from '../engine/qemu/types';
import { DISK_FORMAT, NETWORK_BACKEND, ARCHITECTURE } from '../engine/qemu/types';

// ─── UI Types for Wizard State ──────────────────────────────

interface VMCreationForm {
  // Identification
  name: string;
  
  // Architecture selection (F.2) — all 16 architectures available
  architecture: ArchitectureType;
  machine?: string;           // Auto-selected default
  
  // Acceleration (F.1)
  accelerator: 'kvm' | 'tcg'; // KVM preferred, TCG fallback
  
  // CPU topology — per -smp docs
  cpuSockets: number;
  cpuCores: number;
  cpuThreads: number;
  
  // RAM — per -m flag docs (in MB)
  ramMB: number;
  
  // Disk images — per the Disk Images chapter in System docs  
  diskImages: VMImageEntry[];
  
  // Network devices — per -netdev docs in Network Devices section  
  networkDevices: VMNetworkEntry[];
}

interface VMImageEntry {
  id: string;
  media: 'disk' | 'cdrom';
  format: DiskFormatType;
  path: string;              // Path to .qcow2/.raw image (or "Create New" option)
  isNew: boolean;            // Whether this is a new disk to be created
}

interface VMNetworkEntry {
  id: string;
  backendType: NetworkBackendType;
  macAddress?: string;       // Auto-generated if not provided
}

// ─── Constants for Wizard Defaults ──────────────────────────────

const ALL_ARCHITECTURES = ARCHITECTURE as unknown as ArchitectureType[];

// Architectures that support KVM acceleration (from -enable-kvm and kernel-irqchip docs)
const KVM_ARCHITECTURES: Set<ArchitectureType> = new Set(['x86_64', 'i386']);

function getDefaultAccelerator(arch: ArchitectureType): 'kvm' | 'tcg' {
  return KVM_ARCHITECTURES.has(arch) ? 'kvm' : 'tcg';
}

const DEFAULT_RAM_MAP: Record<ArchitectureType, number> = {
  x86_64: 2048, i386: 1024, aarch64: 2048, armv7l: 512,
  riscv64: 1024, riscv32: 512, avr: 0, // AVR doesn't use -m (MCU)
  mips: 64, mips64: 256, mipsel: 64, mips64el: 256,
  ppc: 128, ppc64: 512, ppcemb: 32,
  sparc: 64, sparc64: 256,
};

const DEFAULT_CPU_MAP: Record<ArchitectureType, { sockets: number; cores: number; threads: number }> = {
  x86_64: { sockets: 1, cores: 2, threads: 1 }, i386: { sockets: 1, cores: 2, threads: 1 },
  aarch64: { sockets: 1, cores: 2, threads: 1 }, armv7l: { sockets: 1, cores: 1, threads: 1 },
  riscv64: { sockets: 1, cores: 1, threads: 1 }, riscv32: { sockets: 1, cores: 1, threads: 1 },
  avr: { sockets: 0, cores: 0, threads: 0 }, // AVR doesn't use -smp (MCU)
  mips: { sockets: 1, cores: 1, threads: 1 }, mips64: { sockets: 1, cores: 1, threads: 1 },
  mipsel: { sockets: 1, cores: 1, threads: 1 }, mips64el: { sockets: 1, cores: 1, threads: 1 },
  ppc: { sockets: 1, cores: 1, threads: 1 }, ppc64: { sockets: 1, cores: 2, threads: 1 },
  ppcemb: { sockets: 0, cores: 0, threads: 0 }, // PPC embedded doesn't use -smp
  sparc: { sockets: 1, cores: 1, threads: 1 }, sparc64: { sockets: 1, cores: 2, threads: 1 },
};

const DEFAULT_DISK_FORMAT_MAP: Record<ArchitectureType, 'raw' | 'qcow2'> = {
  x86_64: 'qcow2', i386: 'qcow2', aarch64: 'qcow2', armv7l: 'qcow2',
  riscv64: 'raw', // eMMC on microvm — raw only (per -device loader docs)
  riscv32: 'qcow2', avr: 'raw', // No disk images for MCU (per -bios firmware.hex docs)
  mips: 'qcow2', mips64: 'qcow2', mipsel: 'qcow2', mips64el: 'qcow2',
  ppc: 'qcow2', ppc64: 'qcow2', ppcemb: 'raw', // Raw for embedded board (per -device loader docs)
  sparc: 'qcow2', sparc64: 'qcow2',
};

const DEFAULT_NET_BACKEND_MAP: Record<ArchitectureType, NetworkBackendType> = {
  x86_64: 'user', i386: 'user', aarch64: 'user', armv7l: 'user',
  riscv64: 'user', riscv32: 'user', avr: 'user', // AVR uses user mode for debugging
  mips: 'user', mips64: 'user', mipsel: 'user', mips64el: 'user',
  ppc: 'user', ppc64: 'user', ppcemb: 'user',
  sparc: 'user', sparc64: 'user',
};

const BIOS_REQUIRED_ARCHITECTURES: Set<ArchitectureType> = new Set(['aarch64', 'riscv64']);
const NO_DISK_NETWORK_ARCHITECTURES: Set<ArchitectureType> = new Set(['avr']); // AVR is bare-metal MCU

// ─── Main Wizard Component ──────────────────────────────

interface VMCreationWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VMCreationWizard: React.FC<VMCreationWizardProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  
  const [step, setStep] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Persist form state across renders — defaults based on first architecture (x86_64)
  const defaultArch = ARCHITECTURE[0] as ArchitectureType;
  const defaultRam = DEFAULT_RAM_MAP[defaultArch] || 1024;

  const [form, setForm] = useState<VMCreationForm>({
    name: `vm-${Date.now().toString(36)}`,
    architecture: defaultArch,
    
    accelerator: getDefaultAccelerator(defaultArch),
    
    cpuSockets: DEFAULT_CPU_MAP[defaultArch]?.sockets || 1,
    cpuCores: DEFAULT_CPU_MAP[defaultArch]?.cores || 2,
    cpuThreads: DEFAULT_CPU_MAP[defaultArch]?.threads || 1,
    
    ramMB: defaultRam,
    
    diskImages: NO_DISK_NETWORK_ARCHITECTURES.has(defaultArch) ? [] : [{ id: 'hd0', media: 'disk', format: DEFAULT_DISK_FORMAT_MAP[defaultArch] || 'qcow2', path: '', isNew: true }],
    networkDevices: NO_DISK_NETWORK_ARCHITECTURES.has(defaultArch) ? [] : [
      { 
        id: 'net0', 
        backendType: DEFAULT_NET_BACKEND_MAP[defaultArch] as NetworkBackendType
      }
    ],
  });
  
  const [availableMachines, setAvailableMachines] = useState<string[]>([]);
  const [availableCPUs, setAvailableCPUs] = useState<string[]>(['host']);
  const [kvmAvailable, setKvmAvailable] = useState<boolean>(false);

  // Check KVM availability for current architecture
  useEffect(() => {
    async function checkKVM() {
      try {
        const kvmOk = await ((window as any).api?.qemu?.checkKVM()); // eslint-disable-line @typescript-eslint/no-explicit-any — qemu is exposed via preload.ts but not in Electron IPC bridge types
        setKvmAvailable(!!kvmOk);
      } catch { /* ignore */ }
    }
    checkKVM();
  }, [form.architecture]);

  // Fetch available machine types for current architecture per -machine help docs
  useEffect(() => {
    async function fetchMachines() {
      try {
        const machines = await ((window as any).api?.qemu?.getAvailableMachines(form.architecture)); // eslint-disable-line @typescript-eslint/no-explicit-any — qemu is exposed via preload.ts but not in Electron IPC bridge types
        if (Array.isArray(machines)) setAvailableMachines((machines as any[]).map((m: any) => m.name)); // eslint-disable-line @typescript-eslint/no-explicit-any — machine type at runtime (per QEMU docs)
      } catch { /* ignore */ }
    }
    fetchMachines();
  }, [form.architecture]);

  // Fetch available CPU models for current architecture per -cpu help docs
  useEffect(() => {
    async function fetchCPUs() {
      try {
        const cpus = await ((window as any).api?.qemu?.getAvailableCPUs(form.architecture)); // eslint-disable-line @typescript-eslint/no-explicit-any — qemu is exposed via preload.ts but not in Electron IPC bridge types
        if (Array.isArray(cpus)) setAvailableCPUs(cpus);
      } catch { /* ignore */ }
    }
    fetchCPUs();
  }, [form.architecture]);

  // Auto-detect KVM availability for current architecture on mount
  useEffect(() => {
    if (KVM_ARCHITECTURES.has(form.architecture)) {
      ((window as any).api?.qemu?.checkKVM())?.then((kvmOk: boolean) => { // eslint-disable-line @typescript-eslint/no-explicit-any — qemu is exposed via preload.ts but not in Electron IPC bridge types
        setKvmAvailable(!!kvmOk);
        if (kvmOk && form.accelerator !== 'kvm') {
          setForm(f => ({ ...f, accelerator: 'kvm' }));
        }
      });
    } else {
      setKvmAvailable(false);
      if (form.accelerator === 'kvm') {
        setForm(f => ({ ...f, accelerator: 'tcg' }));
      }
    }
  }, [form.architecture]);

  // Handle architecture change — reset form for new arch defaults
  const handleArchChange = useCallback((arch: ArchitectureType) => {
    setForm(f => ({
      ...f,
      architecture: arch,
      accelerator: getDefaultAccelerator(arch),
      cpuSockets: DEFAULT_CPU_MAP[arch]?.sockets || f.cpuSockets,
      cpuCores: DEFAULT_CPU_MAP[arch]?.cores || f.cpuCores,
      cpuThreads: DEFAULT_CPU_MAP[arch]?.threads || f.cpuThreads,
      ramMB: DEFAULT_RAM_MAP[arch] || f.ramMB,
    }));
  }, []);

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    setErrorMessage('');
    
    try {
      for (const disk of form.diskImages) {
        if (!disk.isNew && !disk.path.trim()) {
          throw new Error(`Disk image ${disk.id} requires a valid path`);
        }
      }

      const ramBytes = form.ramMB * 1024 ** 2;

      const qemuDiskImages = NO_DISK_NETWORK_ARCHITECTURES.has(form.architecture) ? [] : 
        form.diskImages.map((disk: VMImageEntry) => ({
          id: disk.id,
          media: disk.media,
          format: disk.format,
          file: disk.path || '',
          readOnly: false,
        }));

      const qemuNetworkDevices = NO_DISK_NETWORK_ARCHITECTURES.has(form.architecture) ? [] : 
        form.networkDevices.map((nic: VMNetworkEntry) => ({
          id: nic.id,
          backendType: nic.backendType as any, // eslint-disable-line @typescript-eslint/no-explicit-any — accelerator type at runtime (per QEMU docs)
          macAddress: nic.macAddress,
        }));

      const config = {
        id: form.name.replace(/\s+/g, '-').toLowerCase(),
        architecture: form.architecture as any, // eslint-disable-line @typescript-eslint/no-explicit-any — accelerator type at runtime (per QEMU docs)
        machine: form.machine || '',
        accelerator: form.accelerator as any, // eslint-disable-line @typescript-eslint/no-explicit-any — accelerator type at runtime (per QEMU docs)
        cpuTopology: {
          sockets: form.cpuSockets,
          cores: form.cpuCores,
          threads: form.cpuThreads,
        },
        ramBytes,
        diskImages: qemuDiskImages,
        networkDevices: qemuNetworkDevices,
        serialConsole: { type: 'mon' as const },
      };

      await ((window as any).api?.qemu?.create(config)); // eslint-disable-line @typescript-eslint/no-explicit-any — qemu is exposed via preload.ts but not in Electron IPC bridge types
      
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  }, [form, onClose]);

  const addDiskImage = useCallback(() => {
    const id = `hd${form.diskImages.length}`;
    setForm(f => ({
      ...f,
      diskImages: [...f.diskImages, { id, media: 'disk', format: DEFAULT_DISK_FORMAT_MAP[f.architecture] || 'qcow2', path: '', isNew: true }],
    }));
  }, [form.diskImages.length]);

  const removeDiskImage = useCallback((id: string) => {
    setForm(f => ({
      ...f,
      diskImages: f.diskImages.filter(d => d.id !== id),
    }));
  }, []);

  const addNetworkDevice = useCallback(() => {
    const id = `net${form.networkDevices.length}`;
    setForm(f => ({
      ...f,
      networkDevices: [...f.networkDevices, { id, backendType: DEFAULT_NET_BACKEND_MAP[f.architecture] as NetworkBackendType }],
    }));
  }, [form.networkDevices.length]);

  const removeNetworkDevice = useCallback((id: string) => {
    setForm(f => ({
      ...f,
      networkDevices: f.networkDevices.filter(n => n.id !== id),
    }));
  }, []);

  const steps = [
    { label: 'Architecture', icon: '\u{1F3E0}' },
    { label: 'Hardware', icon: '\u{2699}' },
    { label: 'Disk Images', icon: '\u{1F4BE}' },
    { label: 'Network', icon: '\u{1F310}' },
    { label: 'Review', icon: '\u{2705}' },
  ];

  if (isCreating) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-[#1e1e2e] rounded-xl p-8 w-full max-w-md border border-[#313244]" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-semibold text-[#cdd6f4] mb-4">Creating VM...</h2>
          
          <div className="flex items-center justify-center py-8">
            <div className="w-10 h-10 border-3 border-[#89b4fa]/30 border-t-[#89b4fa] rounded-full animate-spin" />
          </div>
          
          {errorMessage && (
            <p className="text-sm text-[#F44747] mt-2">{errorMessage}</p>
          )}
        </div>
      </div>
    );
  }

  if (step === steps.length - 1) {
    return (
      <ReviewStep
        form={form}
        kvmAvailable={kvmAvailable}
        ramMB={form.ramMB}
        cpuSockets={form.cpuSockets}
        cpuCores={form.cpuCores}
        cpuThreads={form.cpuThreads}
        diskImages={form.diskImages}
        networkDevices={form.networkDevices}
        onBack={() => setStep(step - 1)}
        onCreate={handleCreate}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-[#1e1e2e] rounded-xl w-full max-w-2xl border border-[#313244] overflow-hidden" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 bg-gradient-to-r from-[#89b4fa]/10 to-transparent">
          <h2 className="text-xl font-bold text-[#cdd6f4] flex items-center gap-3">
            {'\u{1F5A5}'} Create Virtual Machine
          </h2>
          
          <div className="flex items-center gap-2 mt-3">
            {steps.map((s, i) => (
              <React.Fragment key={i}>
                <button
                  onClick={() => setStep(i)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    i === step 
                      ? 'bg-[#89b4fa] text-[#1e1e2e]' 
                      : i <= step 
                        ? 'bg-[#89b4fa]/20 text-[#89b4fa]' 
                        : 'bg-[#313244] text-[#6c7086]'
                  }`}
                >
                  {s.icon} {s.label}
                </button>
                {i < steps.length - 1 && (
                  <div className={`w-4 h-px ${i < step ? 'bg-[#89b4fa]/50' : 'bg-[#313244]'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          {step === 0 && (
            <ArchitectureStep 
              form={form} 
              setForm={setForm}
              kvmAvailable={kvmAvailable}
              availableMachines={availableMachines}
              allArchitectures={ALL_ARCHITECTURES}
              handleArchChange={handleArchChange}
            />
          )}
          
          {step === 1 && (
            <HardwareStep 
              form={form} 
              setForm={setForm}
              ramOptions={RAM_OPTIONS}
              cpuModels={availableCPUs}
            />
          )}
          
          {step === 2 && !NO_DISK_NETWORK_ARCHITECTURES.has(form.architecture) && (
            <DiskImagesStep 
              form={form} 
              setForm={setForm}
              addDiskImage={addDiskImage}
              removeDiskImage={removeDiskImage}
            />
          )}
          
          {step === 3 && !NO_DISK_NETWORK_ARCHITECTURES.has(form.architecture) && (
            <NetworkStep 
              form={form} 
              setForm={setForm}
              addNetworkDevice={addNetworkDevice}
              removeNetworkDevice={removeNetworkDevice}
            />
          )}

          {/* Skip disk/network steps for MCU architectures — jump to review */}
          {NO_DISK_NETWORK_ARCHITECTURES.has(form.architecture) && step === 2 && (
            <div className="text-center py-8">
              <span className="text-3xl opacity-50">{'\u{1F4EB}'}</span>
              <p className="text-sm text-[#6c7086] mt-2">MCU architectures don't use disk images or network devices</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-[#181825]/80 flex items-center justify-between border-t border-[#313244]">
          <button
            onClick={() => setStep(step - 1)}
            disabled={step === 0}
            className="px-4 py-2 bg-[#313244] text-[#cdd6f4] rounded-lg hover:bg-[#585b70] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {'\u{2190}'} Back
          </button>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-[#313244] text-[#cdd6f4] rounded-lg hover:bg-[#313244] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={step === steps.length - 1 ? handleCreate : () => setStep(step + 1)}
              className="px-6 py-2 bg-[#89b4fa] hover:bg-[#74c7ec] text-[#1e1e2e] font-medium rounded-lg transition-colors"
            >
              {step === steps.length - 1 ? 'Create VM' : `Next {'\u{2192}'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Constants for Wizard Defaults (kept for backward compat) ──────────────────────────────

const RAM_OPTIONS = [256, 512, 1024, 2048, 4096, 8192, 16384];
const DEFAULT_DISK_FORMAT: DiskFormatType = 'qcow2';

// ─── Step 0: Architecture Selection (F.2) — all 16 architectures ──────────────────────────────

interface ArchitectureStepProps {
  form: VMCreationForm;
  setForm: React.Dispatch<React.SetStateAction<VMCreationForm>>;
  kvmAvailable: boolean;
  availableMachines: string[];
  allArchitectures: ArchitectureType[];
  handleArchChange: (arch: ArchitectureType) => void;
}

const ArchitectureStep: React.FC<ArchitectureStepProps> = ({ form, setForm, kvmAvailable, availableMachines, allArchitectures, handleArchChange }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-[#9399b2] mb-2 font-medium uppercase tracking-wider">Acceleration</label>
        <p className="text-xs text-[#6c7086] mb-2">Choose the hypervisor for this VM — KVM provides near-native performance, TCG is always available</p>
        <div className="flex gap-3">
          <button
            onClick={() => setForm(f => ({ ...f, accelerator: 'kvm' as const }))}
            className={`flex-1 p-4 rounded-lg border transition-colors text-left ${
              form.accelerator === 'kvm' 
                ? 'bg-[#89b4fa]/10 border-[#89b4fa] text-[#89b4fa]' 
                : 'bg-[#181825] border-[#313244] hover:bg-[#313244]'
            } ${!kvmAvailable || !KVM_ARCHITECTURES.has(form.architecture) ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!kvmAvailable || !KVM_ARCHITECTURES.has(form.architecture)}
          >
            <div className="text-lg font-semibold">KVM</div>
            <div className="text-xs opacity-75 mt-1">Near-native performance</div>
            {(!kvmAvailable || !KVM_ARCHITECTURES.has(form.architecture)) && (
              <div className="text-xs text-[#F44747] mt-2">{!KVM_ARCHITECTURES.has(form.architecture) ? 'Not available for this architecture — TCG will be used' : 'KVM not detected — TCG will be used instead'}</div>
            )}
          </button>
          
          <button
            onClick={() => setForm(f => ({ ...f, accelerator: 'tcg' as const }))}
            className={`flex-1 p-4 rounded-lg border transition-colors text-left ${
              form.accelerator === 'tcg' 
                ? 'bg-[#89b4fa]/10 border-[#89b4fa] text-[#89b4fa]' 
                : 'bg-[#181825] border-[#313244] hover:bg-[#313244]'
            }`}
          >
            <div className="text-lg font-semibold">TCG</div>
            <div className="text-xs opacity-75 mt-1">Software emulation (always available)</div>
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm text-[#9399b2] mb-2 font-medium uppercase tracking-wider">Architecture</label>
        <p className="text-xs text-[#6c7086] mb-2">Select the target CPU architecture for this VM — each requires specific firmware and NIC models (per -machine help docs)</p>
        <div className="grid grid-cols-4 gap-2">
          {allArchitectures.map((arch) => (
            <button
              key={arch}
              onClick={() => handleArchChange(arch)}
              className={`p-3 rounded-lg border transition-colors text-left ${
                form.architecture === arch 
                  ? 'bg-[#89b4fa]/10 border-[#89b4fa] text-[#89b4fa]' 
                  : 'bg-[#181825] border-[#313244] hover:bg-[#313244]'
              }`}
            >
              <div className="text-sm font-semibold">{arch}</div>
              {KVM_ARCHITECTURES.has(arch) && kvmAvailable && <div className="text-[10px] opacity-75 mt-1">KVM available</div>}
              {BIOS_REQUIRED_ARCHITECTURES.has(arch) && <div className="text-[10px] opacity-75 mt-1">Requires firmware</div>}
              {NO_DISK_NETWORK_ARCHITECTURES.has(arch) && <div className="text-[10px] opacity-75 mt-1">MCU (no disk/net)</div>}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm text-[#9399b2] mb-2 font-medium uppercase tracking-wider">Machine Type</label>
        <p className="text-xs text-[#6c7086] mb-2">The hardware platform the VM emulates — varies by architecture (from -machine help)</p>
        {availableMachines.length > 0 ? (
          <select
            value={form.machine || ''}
            onChange={(e) => setForm(f => ({ ...f, machine: e.target.value }))}
            className="w-full px-3 py-2 bg-[#181825] border border-[#313244] rounded-lg text-sm text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
          >
            <option value="">Auto (default for {form.architecture})</option>
            {availableMachines.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        ) : (
          <div className="text-xs text-[#6c7086]">Loading available machine types for {form.architecture}...</div>
        )}
      </div>

      <div>
        <label className="block text-sm text-[#9399b2] mb-1 font-medium uppercase tracking-wider">VM Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder={`vm-${form.architecture}-${Date.now().toString(36).slice(-4)}`}
          className="w-full px-3 py-2 bg-[#181825] border border-[#313244] rounded-lg text-sm text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
        />
      </div>

      {/* Architecture-specific notes */}
      <div className="bg-[#181825]/60 border border-[#313244] rounded-lg p-3">
        {BIOS_REQUIRED_ARCHITECTURES.has(form.architecture) && (
          <p className="text-xs text-[#F44747] mb-1">⚠️ This architecture requires UEFI/SBI firmware — download from EDK2 project before creating VM.</p>
        )}
        {NO_DISK_NETWORK_ARCHITECTURES.has(form.architecture) && (
          <p className="text-xs text-[#DCDCAA] mb-1">ℹ️ This is a bare-metal MCU architecture — no disk images or network devices required (per -bios firmware.hex docs).</p>
        )}
      </div>
    </div>
  );
};

// ─── Step 1: Hardware Configuration (F.1) ──────────────────────────────

interface HardwareStepProps {
  form: VMCreationForm;
  setForm: React.Dispatch<React.SetStateAction<VMCreationForm>>;
  ramOptions: number[];
  cpuModels: string[];
}

const HardwareStep: React.FC<HardwareStepProps> = ({ form, setForm, ramOptions, cpuModels }) => {
  const handleRamChange = useCallback((mb: number) => {
    setForm(f => ({ ...f, ramMB: mb }));
  }, [setForm]);

  // Skip hardware step for MCU architectures — no RAM/CPU to configure
  if (NO_DISK_NETWORK_ARCHITECTURES.has(form.architecture)) {
    return (
      <div className="text-center py-8">
        <span className="text-3xl opacity-50">{'\u{1F4EB}'}</span>
        <p className="text-sm text-[#6c7086] mt-2">MCU architectures don't require hardware configuration — RAM and CPU are fixed per chip</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-[#9399b2] mb-1 font-medium uppercase tracking-wider">RAM</label>
        <p className="text-xs text-[#6c7086] mb-2">Minimum 16MB (from -m flag docs in QEMU System chapter)</p>
        <div className="grid grid-cols-4 gap-2">
          {ramOptions.map((mb) => (
            <button
              key={mb}
              onClick={() => handleRamChange(mb)}
              className={`px-3 py-2 rounded-lg border transition-colors text-sm font-medium ${
                form.ramMB === mb 
                  ? 'bg-[#89b4fa]/10 border-[#89b4fa] text-[#89b4fa]' 
                  : 'bg-[#181825] border-[#313244] hover:bg-[#313244]'
              }`}
            >
              {mb >= 1024 ? `${mb / 1024}GB` : `${mb}MB`}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#181825]/60 border border-[#313244] rounded-lg p-4 space-y-3">
        <label className="block text-sm text-[#9399b2] font-medium uppercase tracking-wider">CPU Topology</label>
        <p className="text-xs text-[#6c7086]">Per -smp docs — total CPUs = sockets x cores x threads (varies by architecture)</p>
        
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[#6c7086] mb-1">Sockets</label>
            <input
              type="number"
              min={1}
              max={2880}  // Per -smp docs (supports up to 2880 cpus)
              value={form.cpuSockets}
              onChange={(e) => setForm(f => ({ ...f, cpuSockets: parseInt(e.target.value) || 1 }))}
              className="w-full px-3 py-2 bg-[#181825] border border-[#313244] rounded-lg text-sm text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
            />
          </div>
          
          <div>
            <label className="block text-xs text-[#6c7086] mb-1">Cores</label>
            <input
              type="number"
              min={1}
              max={24}  // Per -smp docs — varies by machine type (from -machine help)
              value={form.cpuCores}
              onChange={(e) => setForm(f => ({ ...f, cpuCores: parseInt(e.target.value) || 1 }))}
              className="w-full px-3 py-2 bg-[#181825] border border-[#313244] rounded-lg text-sm text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
            />
          </div>
          
          <div>
            <label className="block text-xs text-[#6c7086] mb-1">Threads</label>
            <input
              type="number"
              min={1}
              max={2}  // Per -smp docs — varies by architecture (usually 1 or 2 for HT)
              value={form.cpuThreads}
              onChange={(e) => setForm(f => ({ ...f, cpuThreads: parseInt(e.target.value) || 1 }))}
              className="w-full px-3 py-2 bg-[#181825] border border-[#313244] rounded-lg text-sm text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
            />
          </div>
        </div>
        
        <div className="text-xs text-[#6c7086]">
          Total CPUs: <span className="font-mono">{form.cpuSockets * form.cpuCores * form.cpuThreads}</span> x {cpuModels[0] || 'host'}
        </div>
      </div>

      <div className="bg-[#181825]/60 border border-[#313244] rounded-lg p-4 space-y-3">
        <label className="block text-sm text-[#9399b2] font-medium uppercase tracking-wider">CPU Model</label>
        <p className="text-xs text-[#6c7086]">Per -cpu help for this architecture — "host" uses host CPU passthrough (KVM only)</p>
        
        <select
          value={cpuModels[0] || 'host'}
          onChange={(e) => setForm(f => ({ ...f }))}
          className="w-full px-3 py-2 bg-[#181825] border border-[#313244] rounded-lg text-sm text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
        >
          <option value="host">Host (passthrough — KVM only)</option>
          {cpuModels.filter(c => c !== 'host').map(model => (
            <option key={model} value={model}>{model}</option>
          ))}
          <option value="">Auto (default for this architecture)</option>
        </select>
      </div>
    </div>
  );
};

// ─── Step 2: Disk Image Management (F.1 — per Disk Images chapter) ──────────────────────────────

interface DiskImagesStepProps {
  form: VMCreationForm;
  setForm: React.Dispatch<React.SetStateAction<VMCreationForm>>;
  addDiskImage: () => void;
  removeDiskImage: (id: string) => void;
}

const DiskImagesStep: React.FC<DiskImagesStepProps> = ({ form, setForm, addDiskImage, removeDiskImage }) => {
  const handleAddExistingDisk = useCallback(() => {
    // Open file picker for existing disk — using dialog from preload.ts  
    (window as any).api?.dialog?.selectFile().then((path: string | null) => { // eslint-disable-line @typescript-eslint/no-explicit-any — qemu is exposed via preload.ts but not in Electron IPC bridge types
      if (!path) return;
      
      // Auto-detect format based on extension per Disk Images chapter
      const ext = path.split('.').pop()?.toLowerCase() || '';
      let format: DiskFormatType = 'raw';  // Default to raw for unknown formats (per disk images chapter)
      const formatMap: Record<string, DiskFormatType> = {
        qcow2: 'qcow2', qed: 'qed', vdi: 'vdi', vhdx: 'vhdx', vmdk: 'vmdk',
      };
      if (ext in formatMap) format = formatMap[ext];
      
      const id = `hd${form.diskImages.length}`;
      setForm(f => ({
        ...f,
        diskImages: [...f.diskImages, { id, media: 'disk', format, path, isNew: false }],
      }));
    });
  }, [addDiskImage, form.diskImages.length]);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-[#9399b2] mb-2 font-medium uppercase tracking-wider">Disk Images</label>
        <p className="text-xs text-[#6c7086] mb-3">Per the Disk Images chapter in System docs — qcow2 recommended for snapshot support on slow TCG VMs, raw for speed (per disk images chapter)</p>
        
        {form.diskImages.length === 0 ? (
          <div className="text-center py-4 border border-dashed border-[#313244] rounded-lg">
            <span className="text-2xl opacity-50">{'\u{1F4BE}'}</span>
            <p className="text-sm text-[#6c7086] mt-2">No disk images added yet</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
            {form.diskImages.map((disk) => (
              <div key={disk.id} className="flex items-center gap-3 p-3 bg-[#181825]/60 border border-[#313244] rounded-lg">
                <span className="text-lg">{'\u{1F4BF}'}</span>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#cdd6f4]">{disk.id}</span>
                    {disk.isNew && (
                      <span className="px-1.5 py-0.5 rounded bg-[#89b4fa]/20 text-[#89b4fa] text-[10px]">NEW</span>
                    )}
                  </div>
                  
                  {/* Format selector */}
                  <select
                    value={disk.format}
                    onChange={(e) => setForm(f => ({ ...f, diskImages: f.diskImages.map(d => d.id === disk.id ? { ...d, format: e.target.value as DiskFormatType } : d) }))}
                    className="mt-1 px-2 py-0.5 bg-[#1e1e2e] border border-[#313244] rounded text-xs text-[#cdd6f4]"
                  >
                    {DISK_FORMAT.map(f => (
                      <option key={f} value={f}>{f.toUpperCase()}</option>
                    ))}
                  </select>
                  
                  {/* Path display or input for new disks */}
                  {disk.path && !disk.isNew ? (
                    <div className="text-xs text-[#6c7086] truncate mt-1">{disk.path}</div>
                  ) : disk.isNew ? (
                    <input
                      type="text"
                      value={disk.path}
                      onChange={(e) => setForm(f => ({ ...f, diskImages: f.diskImages.map(d => d.id === disk.id ? { ...d, path: e.target.value } : d) }))}
                      placeholder="Click + to add a new disk..."
                      className="mt-1 px-2 py-0.5 bg-[#1e1e2e] border border-[#313244] rounded text-xs text-[#cdd6f4]"
                    />
                  ) : null}
                </div>
                
                {/* Media type */}
                <select
                  value={disk.media}
                  onChange={(e) => setForm(f => ({ ...f, diskImages: f.diskImages.map(d => d.id === disk.id ? { ...d, media: e.target.value as 'disk' | 'cdrom' } : d) }))}
                  className="px-2 py-1 bg-[#1e1e2e] border border-[#313244] rounded text-xs text-[#cdd6f4]"
                >
                  <option value="disk">Disk</option>
                  <option value="cdrom">CD-ROM</option>
                </select>
                
                {/* Delete button */}
                {form.diskImages.length > 1 && (
                  <button
                    onClick={() => removeDiskImage(disk.id)}
                    className="p-1 rounded hover:bg-[#F44747]/20 text-[#6c7086] transition-colors"
                  >
                    {'\u{2715}'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleAddExistingDisk}
          disabled={!form.diskImages.every(d => d.isNew || d.path)}  // Can only add if existing disks have paths
          className="px-3 py-1.5 rounded bg-[#404040] hover:bg-[#505050] text-xs transition-colors disabled:opacity-50"
        >
          + Add Existing Disk
        </button>
        <button
          onClick={addDiskImage}
          className="px-3 py-1.5 rounded bg-[#89b4fa]/20 hover:bg-[#89b4fa]/30 text-xs transition-colors"
        >
          + Create New Disk ({DEFAULT_DISK_FORMAT_MAP[form.architecture] || 'qcow2'})
        </button>
      </div>

      <p className="text-xs text-[#6c7086]">
        {'\u{1F4A1}'} Tip: Use {'<code>'}qcow2{'</code>'} for snapshot support (important on slow TCG VMs), or {'<code>'}raw{'</code>'} for maximum speed.
      </p>
    </div>
  );
};

// ─── Step 3: Network Configuration (F.1 — per -netdev docs in Network Devices section) ──────────────────────────────

interface NetworkStepProps {
  form: VMCreationForm;
  setForm: React.Dispatch<React.SetStateAction<VMCreationForm>>;
  addNetworkDevice: () => void;
  removeNetworkDevice: (id: string) => void;
}

const NetworkStep: React.FC<NetworkStepProps> = ({ form, setForm, addNetworkDevice, removeNetworkDevice }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-[#9399b2] mb-2 font-medium uppercase tracking-wider">Network Devices</label>
        <p className="text-xs text-[#6c7086] mb-3">Per -netdev docs in Network Devices section — user mode networking (default) allows guest to reach host at 192.168.x.1</p>
        
        {form.networkDevices.length === 0 ? (
          <div className="text-center py-4 border border-dashed border-[#313244] rounded-lg">
            <span className="text-2xl opacity-50">{'\u{1F310}'}</span>
            <p className="text-sm text-[#6c7086] mt-2">No network devices added yet</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
            {form.networkDevices.map((nic) => (
              <div key={nic.id} className="flex items-center gap-3 p-3 bg-[#181825]/60 border border-[#313244] rounded-lg">
                <span className="text-lg">{'\u{1F310}'}</span>
                
                <div className="flex-1 min-w-0 space-y-1">
                  {/* Backend type selector — per -netdev docs */}
                  <select
                    value={nic.backendType}
                    onChange={(e) => setForm(f => ({ ...f, networkDevices: f.networkDevices.map(n => n.id === nic.id ? { ...n, backendType: e.target.value as NetworkBackendType } : n) }))}
                    className="px-2 py-0.5 bg-[#1e1e2e] border border-[#313244] rounded text-xs text-[#cdd6f4]"
                  >
                    {NETWORK_BACKEND.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  
                  {/* MAC address — per NIC/macaddr docs */}
                  <input
                    type="text"
                    value={nic.macAddress || ''}
                    onChange={(e) => setForm(f => ({ ...f, networkDevices: f.networkDevices.map(n => n.id === nic.id ? { ...n, macAddress: e.target.value } : n) }))}
                    placeholder="MAC address (optional)"
                    className="px-2 py-0.5 bg-[#1e1e2e] border border-[#313244] rounded text-xs text-[#cdd6f4]"
                  />
                </div>
                
                {/* Delete button */}
                {form.networkDevices.length > 1 && (
                  <button
                    onClick={() => removeNetworkDevice(nic.id)}
                    className="p-1 rounded hover:bg-[#F44747]/20 text-[#6c7086] transition-colors"
                  >
                    {'\u{2715}'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={addNetworkDevice}
        className="px-3 py-1.5 rounded bg-[#89b4fa]/20 hover:bg-[#89b4fa]/30 text-xs transition-colors"
      >
        + Add Network Device
      </button>

      {/* Per-architecture NIC info — from archPrompts.ts knownIssues */}
      <div className="bg-[#181825]/60 border border-[#313244] rounded-lg p-3">
        <p className="text-xs text-[#9399b2] mb-1">Architecture-Specific NIC Info</p>
        {form.architecture === 'x86_64' && (
          <div className="text-xs text-[#6c7086] space-y-0.5">
            <span className="font-medium">Default NIC:</span> e1000 (per Intel E1000 device docs)
          </div>
        )}
        {(form.architecture === 'aarch64' || form.architecture === 'riscv64') && (
          <div className="text-xs text-[#6c7086] space-y-0.5">
            <span className="font-medium">Default NIC:</span> virtio-net-pci (paravirtualized — per device-emulation docs)
          </div>
        )}
        {form.architecture === 'avr' && (
          <div className="text-xs text-[#6c7086] space-y-0.5">
            <span className="font-medium">Default NIC:</span> lan9118 (embedded — per -device lan9118 docs for microcontroller)
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Step 4: Review & Create ──────────────────────────────

interface ReviewStepProps {
  form: VMCreationForm;
  kvmAvailable: boolean;
  ramMB: number;
  cpuSockets: number;
  cpuCores: number;
  cpuThreads: number;
  diskImages: VMImageEntry[];
  networkDevices: VMNetworkEntry[];
  onBack: () => void;
  onCreate: () => void;
}

const ReviewStep: React.FC<ReviewStepProps> = ({ 
  form, kvmAvailable, ramMB, cpuSockets, cpuCores, cpuThreads, diskImages, networkDevices, onBack, onCreate 
}) => {
  const totalCPUs = NO_DISK_NETWORK_ARCHITECTURES.has(form.architecture) ? 1 : cpuSockets * cpuCores * cpuThreads; // MCU always has single core
  
  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="bg-gradient-to-r from-[#89b4fa]/10 to-transparent border border-[#313244] rounded-lg p-4">
        <h3 className="text-sm font-semibold text-[#cdd6f4] mb-2">VM Summary</h3>
        
        {/* Name and Architecture */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
          <span className="text-[#9399b2]">Name:</span>
          <span className="font-mono text-[#cdd6f4]">{form.name}</span>
          
          <span className="text-[#9399b2]">Architecture:</span>
          <span className="text-[#89b4fa] font-semibold">{form.architecture}</span>
          
          <span className="text-[#9399b2]">Acceleration:</span>
          <span className={kvmAvailable && form.accelerator === 'kvm' ? 'text-[#a6e3a1]' : 'text-[#858585]'}>
            {form.accelerator === 'kvm' ? (kvmAvailable ? 'KVM {' + '\u{2714}' + '}' : 'TCG fallback') : 'TCG'}
          </span>
        </div>
      </div>

      {/* Hardware details */}
      {NO_DISK_NETWORK_ARCHITECTURES.has(form.architecture) ? (
        <div className="bg-[#181825]/60 border border-[#313244] rounded-lg p-4 space-y-2">
          <h4 className="text-xs text-[#9399b2] font-medium uppercase tracking-wider">Hardware (MCU — fixed)</h4>
          <p className="text-xs text-[#6c7086]">MCU architectures don't require hardware configuration</p>
        </div>
      ) : (
        <div className="bg-[#181825]/60 border border-[#313244] rounded-lg p-4 space-y-2">
          <h4 className="text-xs text-[#9399b2] font-medium uppercase tracking-wider">Hardware</h4>
          
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
            <span className="text-[#6c7086]">RAM:</span>
            <span className="font-mono">{ramMB >= 1024 ? `${ramMB / 1024}GB` : `${ramMB}MB`}</span>
            
            <span className="text-[#6c7086]">CPUs:</span>
            <span className="font-mono">{totalCPUs} ({cpuSockets}s x {cpuCores}c x {cpuThreads}t)</span>
          </div>
        </div>
      )}

      {/* Disk images */}
      {diskImages.length > 0 && (
        <div className="bg-[#181825]/60 border border-[#313244] rounded-lg p-4 space-y-2">
          <h4 className="text-xs text-[#9399b2] font-medium uppercase tracking-wider">Disk Images ({diskImages.length})</h4>
          
          {diskImages.map((disk) => (
            <div key={disk.id} className="flex items-center gap-2 text-xs">
              <span>{'\u{1F4BF}'}</span>
              <span className="font-mono">{disk.id}</span>
              <span className="text-[#6c7086]">{disk.format.toUpperCase()}</span>
              <span className="text-[#6c7086]">{'\u{00B7}'}</span>
              {disk.isNew ? (
                <span className="text-[#89b4fa]">New disk — will be created on VM start</span>
              ) : (
                <span className="font-mono text-[#6c7086] truncate max-w-xs">{disk.path}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Network */}
      {networkDevices.length > 0 && (
        <div className="bg-[#181825]/60 border border-[#313244] rounded-lg p-4 space-y-2">
          <h4 className="text-xs text-[#9399b2] font-medium uppercase tracking-wider">Network ({networkDevices.length})</h4>
          
          {networkDevices.map((nic) => (
            <div key={nic.id} className="flex items-center gap-2 text-xs">
              <span>{'\u{1F310}'}</span>
              <span className="font-mono">{nic.id}</span>
              <span className="text-[#6c7086]">{nic.backendType}</span>
            </div>
          ))}
        </div>
      )}

      {/* Warning for TCG */}
      {form.accelerator === 'tcg' && (
        <p className="text-xs text-[#F44747]">{'\u{26A0}'} TCG emulation will be slow — consider enabling KVM if available</p>
      )}
      
      {/* Warning for ARM/RISC-V on x86 host */}
      {['aarch64', 'riscv64'].includes(form.architecture) && (
        <p className="text-xs text-[#F44747]">{'\u{26A0}'} Cross-architecture emulation — this will be very slow with TCG</p>
      )}

      {/* Firmware requirement warning */}
      {BIOS_REQUIRED_ARCHITECTURES.has(form.architecture) && (
        <p className="text-xs text-[#DCDCAA]">{'\u{2139}'} This architecture requires UEFI/SBI firmware — download from EDK2 project before creating VM.</p>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-2 border-t border-[#313244]">
        <button
          onClick={onBack}
          className="px-4 py-2 bg-[#313244] text-[#cdd6f4] rounded-lg hover:bg-[#585b70] transition-colors"
        >
          {'\u{2190}'} Back
        </button>
        <button
          onClick={onCreate}
          className="flex-1 px-6 py-2 bg-[#a6e3a1] hover:bg-[#94e2b5] text-[#1e1e2e] font-medium rounded-lg transition-colors"
        >
          {'\u{2705}'} Create VM
        </button>
      </div>
    </div>
  );
};

export default VMCreationWizard;