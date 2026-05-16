// ─── QEMU/KVM Simulation Layer — Sidebar Panel ──────────────────────────────
// Displays running VMs with lifecycle controls (start/pause/resume/stop/delete)
// Architecture: F.1-F.3 per plan.md

import React, { useEffect } from 'react';
import type { ArchitectureType, AcceleratorType, VMRunStateType } from '../engine/qemu/types';
import { useVMStore, VMSidebarTabInfo } from '../store/vmStore';

// ─── State badge mapping ──────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any — VM state is any at runtime (per QEMU QMP spec)
const STATE_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  running:     { bg: '#4EC9B0/20', text: '#4EC9B0', label: 'Running' },
  paused:      { bg: '#DCDCAA/20', text: '#DCDCAA', label: 'Paused' },
  'shutdown-request': { bg: '#C9CB95/20', text: '#C9CB95', label: 'Shutting Down' },
  stopped:     { bg: '#F44747/20', text: '#F44747', label: 'Stopped' },
  debug:       { bg: '#6c7086/20', text: '#6c7086', label: 'Debug' },
  internal:    { bg: '#6c7086/20', text: '#6c7086', label: 'Internal' },
  finishReset:     { bg: '#6c7086/20', text: '#6c7086', label: 'Finish Reset' },
  guestSwapInProgress: { bg: '#6c7086/20', text: '#6c7086', label: 'Guest Swap In Progress' },
  ioError:       { bg: '#F44747/30', text: '#F44747', label: 'I/O Error' },
  deviceHotplug:   { bg: '#DCDCAA/20', text: '#DCDCAA', label: 'Device Hotplug' },
  postMigrate:     { bg: '#6c7086/20', text: '#6c7086', label: 'Post Migrate' },
  prelaunch:       { bg: '#6c7086/20', text: '#6c7086', label: 'Prelaunch' },
  recover:         { bg: '#DCDCAA/20', text: '#DCDCAA', label: 'Recover' },
  resumeRequest:   { bg: '#4EC9B0/20', text: '#4EC9B0', label: 'Resume Request' },
  suspended:       { bg: '#6c7086/20', text: '#6c7086', label: 'Suspended' },
  waitIo:          { bg: '#DCDCAA/20', text: '#DCDCAA', label: 'Wait I/O' },
};

// ─── Architecture display names ──────────────────────────────
const ARCH_DISPLAY: Record<ArchitectureType, string> = {
  x86_64:      'x86_64',
  i386:        'i386',
  aarch64:     'ARM/AArch64',
  armv7l:      'ARM/32-bit',
  riscv64:     'RISC-V/64-bit',
  riscv32:     'RISC-V/32-bit',
  avr:         'AVR',
  mips:        'MIPS/32',
  mips64:      'MIPS/64',
  mipsel:      'MIPS/32 (LE)',
  mips64el:    'MIPS/64 (LE)',
  ppc:         'PowerPC/32',
  ppc64:       'PowerPC/64',
  ppcemb:      'PowerPC/Embedded',
  sparc:       'SPARC/32',
  sparc64:     'SPARC/64',
};

// ─── Accelerator display names ──────────────────────────────
const ACCEL_DISPLAY: Record<AcceleratorType, string> = {
  kvm:    'KVM',
  xen:    'Xen',
  hvf:    'HVF',
  nitro:  'Nitro',
  nvmm:   'Nvmm',
  whpx:   'WHPX',
  mshv:   'MSHV',
  tcg:    'TCG',
};

// ─── Individual VM Instance Card ──────────────────────────────
interface VMInstanceCardProps {
  vm: VMSidebarTabInfo;
}

const VMInstanceCard: React.FC<VMInstanceCardProps> = ({ vm }) => {
  const startVM = useVMStore((s) => s.startVM);
  const pauseVM = useVMStore((s) => s.pauseVM);
  const resumeVM = useVMStore((s) => s.resumeVM);
  const stopVM = useVMStore((s) => s.stopVM);
  const deleteVM = useVMStore((s) => s.deleteVM);

  // Extend state type to include 'stopped' for display purposes (not in QMP enum)  
  const displayState = vm.state as any;  // eslint-disable-line @typescript-eslint/no-explicit-any — QEMU state is dynamic at runtime
  const stateConfig = STATE_CONFIG[displayState] || { bg: '#6c7086/20', text: '#6c7086', label: displayState };
  const ramMB = Math.round(vm.ramBytes / (1024 ** 2));

  return (
    <div className="bg-[#1E1E1E]/60 border border-[#404040] rounded p-2.5 space-y-1.5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#D4D4D4]">{vm.id}</span>
        <span className={`px-1.5 py-0.5 rounded text-[9px] ${stateConfig.bg} ${stateConfig.text}`}>
          {stateConfig.label}
        </span>
      </div>

      {/* Architecture & Accelerator */}
      <div className="flex items-center gap-2 text-[10px] text-[#858585]">
        <span>{ARCH_DISPLAY[vm.architecture as ArchitectureType]}</span>
        <span>•</span>
        <span>{ACCEL_DISPLAY[vm.accelerator as AcceleratorType]}</span>
        <span>•</span>
        <span>{ramMB} MB RAM</span>
      </div>

      {/* Machine type */}
      {vm.machine && (
        <div className="text-[10px] text-[#858585]">
          Machine: <code className="bg-[#3C3C3C]/60 px-1 rounded">{vm.machine}</code>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-1 pt-1 border-t border-[#404040]">
        {displayState === 'paused' && (
          <button
            onClick={() => resumeVM(vm.id)}
            className="px-2 py-0.5 rounded bg-[#4EC9B0]/20 hover:bg-[#4EC9B0]/30 text-xs transition"
          >
            ▶ Resume
          </button>
        )}

        {displayState === 'running' && (
          <>
            <button
              onClick={() => pauseVM(vm.id)}
              className="px-2 py-0.5 rounded bg-[#DCDCAA]/20 hover:bg-[#DCDCAA]/30 text-xs transition"
            >
              ⏸ Pause
            </button>
            <button
              onClick={() => stopVM(vm.id)}
              className="px-2 py-0.5 rounded bg-[#F44747]/15 hover:bg-[#F44747]/25 text-xs transition"
            >
              ⏹ Stop
            </button>
          </>
        )}

        {displayState === 'stopped' && (
          <button
            onClick={() => startVM(vm.id)}
            className="px-2 py-0.5 rounded bg-[#4EC9B0]/20 hover:bg-[#4EC9B0]/30 text-xs transition"
          >
            ▶ Start
          </button>
        )}

        {/* Delete button — always available */}
        <button
          onClick={() => { if (window.confirm(`Delete VM ${vm.id}?`)) deleteVM(vm.id); }}
          className="ml-auto px-2 py-0.5 rounded bg-[#F44747]/15 hover:bg-[#F44747]/25 text-xs transition"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

// ─── VM Panel Component (default export) ──────────────────────────────
const VMPanel: React.FC = () => {
  const instances = useVMStore((s) => s.instances);
  const loading = useVMStore((s) => s.loading);
  const setInstances = useVMStore((s) => s.setInstances);

  // Poll for running instances every 2 seconds (like TaskPanel polling pattern)
  useEffect(() => {
    async function refreshInstances() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any — qemu is exposed via preload.ts but not in Electron IPC bridge types
        const qemuApi = (window as any).api?.qemu as any;  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
        if (!qemuApi) { console.warn('QEMU API not available'); return; }
        const result = await qemuApi.listInstances();
        setInstances(result.running.map((vm: any) => ({
          id: vm.id,
          architecture: vm.architecture as ArchitectureType,
          machine: vm.machine || '',
          accelerator: vm.accelerator as AcceleratorType,
          qmpSocket: vm.qmpSocket || { type: 'tcp' },
          monSocket: vm.monSocket || { type: 'unix' },
          serialConsole: vm.serialConsole,
          state: vm.state as VMRunStateType,
          cpuTopology: vm.cpuTopology || {},
          ramBytes: vm.ramBytes || 0,
          diskImages: vm.diskImages || [],
          networkDevices: vm.networkDevices || [],
          audioConfig: undefined,
          vgaType: vm.vgaType,
          biosPath: vm.biosPath,
          bootOrder: '',
          createdAt: vm.createdAt || Date.now(),
          updatedAt: vm.updatedAt || Date.now(),
        })));
      } catch (err) { /* VM panel not initialized yet — show empty state */ console.error(err); }
    }

    refreshInstances(); // Initial load
    const interval = setInterval(refreshInstances, 2000); // Poll every 2s like TaskPanel pattern
    return () => clearInterval(interval);
  }, [setInstances]);

  if (loading) {
    return <div className="px-3 py-4 text-[11px] text-[#858585]">Loading VM instances...</div>;
  }

  const vmList = Array.from(instances.values());

  return (
    <div className="px-2 py-2 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-1 border-b border-[#404040]">
        <span className="text-xs font-semibold text-[#858585] uppercase tracking-wider flex items-center gap-1.5">
          🖥️ Virtual Machines
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#4EC9B0]/20 text-[#4EC9B0] border border-[#4EC9B0]/30">
          {vmList.length} active
        </span>
      </div>

      {/* VM list */}
      <div className="space-y-1.5 max-h-[calc(100vh-280px)] overflow-y-auto scrollbar-thin">
        {vmList.map((vm) => (
          <VMInstanceCard key={vm.id} vm={vm} />
        ))}

        {/* Empty state — no VMs running */}
        {vmList.length === 0 && (
          <div className="text-center py-4">
            <span className="text-lg opacity-50">🖥️</span>
            <p className="text-[11px] text-[#858585] mt-2">No VMs running</p>
          </div>
        )}
      </div>

      {/* Bottom toolbar — action buttons */}
      {vmList.length > 0 && (
        <div className="flex gap-1.5 px-1 pt-2 border-t border-[#404040]">
          <button
            onClick={async () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any — dialog types incomplete in Electron IPC bridge
              const result = (window as any).api?.dialog?.selectFolder?.(undefined);  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
              if (result) alert(`VM creation from ${result} — not yet implemented`);
            }}
            className="flex-1 px-2 py-1 rounded bg-[#404040] hover:bg-[#505050] text-xs transition"
          >
            + Create VM
          </button>
        </div>
      )}
    </div>
  );
};

export default VMPanel;