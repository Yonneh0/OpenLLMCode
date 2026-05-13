import { create } from 'zustand';
import type { Backend, EngineConfig, ModelInfo } from '../types';

interface EngineState {
  config: EngineConfig;
  models: ModelInfo[];
  loading: boolean;
  setConfig: (config: Partial<EngineConfig>) => void;
  selectBackend: (backend: Backend) => void;
  loadModel: (modelId: string) => Promise<void>;
}

export const useEngineStore = create<EngineState>((set) => ({
  config: { backend: 'cpu', binarySource: 'prebuilt', selectedModel: '', systemAIModel: '' },
  models: [],
  loading: false,

  setConfig: (config) => set((state) => ({ config: { ...state.config, ...config } })),

  selectBackend: (backend) => set({ config: { ...useEngineStore.getState().config, backend } }),

  loadModel: async (modelId) => {
    set({ loading: true });
    try { await window.api.chat.start({ model: modelId }); } catch {}
    set((state) => ({
      models: state.models.map(m => m.id === modelId ? { ...m, loaded: true } : m),
      config: { ...state.config, selectedModel: modelId },
      loading: false,
    }));
  },
}));