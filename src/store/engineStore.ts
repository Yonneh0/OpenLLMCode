// Engine configuration state (Phase A)
import { create } from 'zustand';
import type { Backend } from '../types';

interface EngineState {
  backend: Backend;
  binarySource: 'prebuilt' | 'compile';
  selectedModel: string;
  systemAIModel: string;
  hardwareDetected: boolean;
}

export const useEngineStore = create<EngineState>((set) => ({
  backend: 'cpu',
  binarySource: 'prebuilt',
  selectedModel: 'ibm-grok4-1b.Q8_0',
  systemAIModel: 'ibm-grok4-1b.Q8_0',
  hardwareDetected: false,

  setBackend: (backend: Backend) => set({ backend }),
}));