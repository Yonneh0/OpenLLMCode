// Engine configuration state (Phase A + B fixes)
import { create } from 'zustand';
import type { Backend, EngineConfig } from '../types';

interface EngineState extends Omit<EngineConfig, 'backend'> {
  backend: Backend;
  hardwareDetected: boolean;
}

export const useEngineStore = create<EngineState>((set) => ({
  backend: 'cpu',
  binarySource: 'prebuilt',
  selectedModel: 'ibm-grok4-1b.Q8_0',
  systemAIModel: 'ibm-grok4-1b.Q8_0',
  hardwareDetected: false,

  // Fix #3: Added missing actions for model selection and config management
  setBackend: (backend: Backend) => set({ backend }),

  setSelectedModel: (selectedModel: string) => set({ selectedModel }),

  setSystemAIModel: (systemAIModel: string) => set({ systemAIModel }),

  setBinarySource: (binarySource: 'prebuilt' | 'compile') => set({ binarySource }),

  updateConfig: (partialConfig: Partial<EngineConfig>) => set((state) => ({
    ...state,
    ...partialConfig,
  })),

  setHardwareDetected: (hardwareDetected: boolean) => set({ hardwareDetected }),
}));
