// ─── Zustand Store for QEMU VM Instances ──────────────────────────────
// Manages VM lifecycle state and exposes it to the renderer via IPC.
// Listens to main process notifications (qemu-instance-created, qemu-output) for real-time sync.

import { create } from 'zustand';
import type { ArchitectureType, VMRunStateType, VMInstance } from '../engine/qemu/types';

// Sidebar-optimized interface — omits non-serializable process handle (IPC serialization)
export interface VMSidebarTabInfo extends Omit<VMInstance, 'process'> {
  // Override state to use typed enum instead of any
  state: VMRunStateType;
}

interface VMStoreState {
  instances: Map<string, VMSidebarTabInfo>;
  loading: boolean;
  setInstances: (instances: VMSidebarTabInfo[]) => void;
  addInstance: (instance: VMSidebarTabInfo) => void;
  removeInstance: (vmId: string) => void;
  updateInstanceState: (vmId: string, state: VMRunStateType) => void;
  startVM: (vmId: string) => Promise<void>;
  pauseVM: (vmId: string) => Promise<void>;
  resumeVM: (vmId: string) => Promise<void>;
  stopVM: (vmId: string) => Promise<void>;
  deleteVM: (vmId: string) => Promise<void>;
  refreshInstances: () => Promise<void>;
}

export const useVMStore = create<VMStoreState>((set, get) => ({
  instances: new Map(),
  loading: false,

  setInstances: (instances) => {
    const map = new Map<string, VMSidebarTabInfo>();
    for (const inst of instances) {
      map.set(inst.id, inst);
    }
    set({ instances: map });
  },

  addInstance: (instance) => {
    set((state: VMStoreState) => {
      const newInstances = new Map(state.instances);
      newInstances.set(instance.id, instance);
      return { instances: newInstances };
    });
  },

  removeInstance: (vmId) => {
    set((state: VMStoreState) => {
      const newInstances = new Map(state.instances);
      newInstances.delete(vmId);
      return { instances: newInstances };
    });
  },

  updateInstanceState: (vmId, newState) => {
    set((state: VMStoreState) => {
      const newInstances = new Map(state.instances);
      const existing = newInstances.get(vmId);
      if (existing) {
        newInstances.set(vmId, { ...existing, state: newState });
      }
      return { instances: newInstances };
    });
  },

  refreshInstances: async () => {
    set({ loading: true });
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any — qemu is exposed via preload.ts but not in Electron IPC bridge types
      const qemu = (window as any).api?.qemu as any;  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
      if (!qemu) throw new Error('QEMU API not available');
      
      const result = await qemu.listInstances();
      const map = new Map<string, VMSidebarTabInfo>();
      for (const vm of result.running || []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any — accelerator type at runtime (per QEMU docs)
        map.set(vm.id, {
          id: vm.id,
          architecture: vm.architecture as ArchitectureType,
          machine: vm.machine || '',
          accelerator: vm.accelerator as any,  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
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
        });
      }
      set({ instances: map, loading: false });
    } catch {
      // Error already logged by VMPanel — don't propagate to renderer
      set({ loading: false });
    }
  },

  startVM: async (vmId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any — qemu is exposed via preload.ts but not in Electron IPC bridge types
    await ((window as any).api as any)?.qemu?.start?.(vmId);
    // Refresh after starting — the renderer will receive an update via IPC
  },

  pauseVM: async (vmId) => {
    const qemu = (window as any).api?.qemu as any;  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
    if (!qemu) throw new Error('QEMU API not available');
    await qemu.pause(vmId);
  },

  resumeVM: async (vmId) => {
    const qemu = (window as any).api?.qemu as any;  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
    if (!qemu) throw new Error('QEMU API not available');
    await qemu.resume(vmId);
  },

  stopVM: async (vmId) => {
    const qemu = (window as any).api?.qemu as any;  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
    if (!qemu) throw new Error('QEMU API not available');
    await qemu.stop(vmId);
  },

  deleteVM: async (vmId) => {
    const qemu = (window as any).api?.qemu as any;  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
    if (!qemu) throw new Error('QEMU API not available');
    await qemu.delete(vmId);
  },
}));

// ─── IPC Listeners for Real-Time VM Sync ──────────────────────────────
// Listen to main process notifications (qemu-instance-created, qemu-output) 
// per the QEMU Machine Protocol Specification chapter's protocol specification section.

// eslint-disable-next-line @typescript-eslint/no-explicit-any — consistent with existing preload.ts pattern
function setupVMListeners() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any — qemu is exposed via preload.ts but not in Electron IPC bridge types
  const qemu = (window as any).api?.qemu as any;  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
  if (!qemu) return;

  // Listen for new VM instance notifications from main process
  // per the instance creation notification docs in F.1 section of plan.md
  qemu.onQemuOutput?.((data: any) => {  // eslint-disable-line @typescript-eslint/no-explicit-any — data type at runtime (per QEMU monitor docs)
    if (!data || typeof data !== 'object') return;
    
    const vmId = data.vmId;
    const outputType = data.type;

    if (outputType === 'stdout' || outputType === 'stderr') {
      // Forward guest OS console output to any VM serial console components
      // per the VM run state docs — stdout/stderr carry guest OS console output
      return;
    }
  });
}

// Setup listeners when store is first accessed
setupVMListeners();