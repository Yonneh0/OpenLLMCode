// ─── Zustand Store for QEMU VM Instances ──────────────────────────────
// Manages VM lifecycle state and exposes it to the renderer via IPC.

import { create } from 'zustand';
import type { ArchitectureType, VMRunStateType, VMInstance } from '../engine/qemu/types';

// Sidebar-optimized interface — omits non-serializable process handle (IPC serialization)
export interface VMSidebarTabInfo extends Omit<VMInstance, 'process' | 'state'> {
  // Override state to use typed enum instead of any
  state: VMRunStateType;
}

interface VMStoreState {
  instances: Map<string, VMSidebarTabInfo>;
  loading: boolean;
  setInstances: (instances: VMSidebarTabInfo[]) => void;
  startVM: (vmId: string) => Promise<void>;
  pauseVM: (vmId: string) => Promise<void>;
  resumeVM: (vmId: string) => Promise<void>;
  stopVM: (vmId: string) => Promise<void>;
  deleteVM: (vmId: string) => Promise<void>;
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

  startVM: async (vmId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any — qemu is exposed via preload.ts but not in Electron IPC bridge types
    await ((window as any).api as any)?.qemu?.start?.(vmId);
    // Refresh after starting — the renderer will receive an update via IPC
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any — qemu is exposed via preload.ts but not in Electron IPC bridge types
  pauseVM: async (vmId) => {
    const qemu = (window as any).api?.qemu as any;  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
    if (!qemu) throw new Error('QEMU API not available');
    await qemu.pause(vmId);
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any — qemu is exposed via preload.ts but not in Electron IPC bridge types
  resumeVM: async (vmId) => {
    const qemu = (window as any).api?.qemu as any;  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
    if (!qemu) throw new Error('QEMU API not available');
    await qemu.resume(vmId);
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any — qemu is exposed via preload.ts but not in Electron IPC bridge types
  stopVM: async (vmId) => {
    const qemu = (window as any).api?.qemu as any;  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
    if (!qemu) throw new Error('QEMU API not available');
    await qemu.stop(vmId);
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any — qemu is exposed via preload.ts but not in Electron IPC bridge types
  deleteVM: async (vmId) => {
    const qemu = (window as any).api?.qemu as any;  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
    if (!qemu) throw new Error('QEMU API not available');
    await qemu.delete(vmId);
  },
}));