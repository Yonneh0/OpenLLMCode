// Model Settings Store — manages per-model inference settings (context window, GPU layers, threads)
// Persisted in modelSettings.json alongside model metadata on disk
import { create } from 'zustand';
import type { ModelSettings, ModelInfo } from '../types';

interface ModelSettingsState {
  // Map of model path -> settings override. When empty, uses auto-detect defaults.
  settings: Record<string, Partial<ModelSettings>>;
  
  // Actions — CRUD for individual models
  getSettingsForModel: (modelPath: string) => Partial<ModelSettings>;
  updateSettingsForModel: (modelPath: string, overrides: Partial<ModelSettings>) => void;
  resetSettingsForModel: (modelPath: string) => void;
  
  // Actions — batch operations
  loadAllModels: (models: ModelInfo[]) => void;
  saveToDisk: () => Promise<void>;
  loadFromDisk: () => Promise<void>;
}

// Default settings for each model type — based on GGUF header detection or sensible defaults
function getDefaultSettings(): Partial<ModelSettings> {
  return {
    contextWindow: 0, // 0 = auto-detect from GGUF header
    gpuLayers: -1,   // -1 = all layers to GPU (default), use 0 for CPU-only, N for specific layer count
    threads: -1,     // -1 = auto-detect based on CPU cores
  };
}

// Path where model settings are stored — same directory as model metadata
function getSettingsFilePath(): string {
  const appDataDir = process.platform === 'win32' 
    ? (process.env.APPDATA || '/tmp') 
    : (process.env.HOME || '/tmp');
  return `${appDataDir}/OpenLLMCode/modelSettings.json`;
}

export const useModelSettingsStore = create<ModelSettingsState>((set, get) => ({
  settings: {}, // Empty — loaded from disk on mount
  
  getSettingsForModel: (modelPath: string): Partial<ModelSettings> => {
    const stored = get().settings[modelPath];
    if (!stored) return getDefaultSettings();
    // Merge with defaults so partial overrides don't lose default behavior
    return { ...getDefaultSettings(), ...stored };
  },
  
  updateSettingsForModel: (modelPath: string, overrides: Partial<ModelSettings>) => {
    set((s) => ({
      settings: {
        ...s.settings,
        [modelPath]: { ...s.settings[modelPath] || getDefaultSettings(), ...overrides }
      }
    }));
  },
  
  resetSettingsForModel: (modelPath: string) => {
    set((s) => ({
      settings: {
        ...s.settings,
        [modelPath]: getDefaultSettings()
      }
    }));
  },
  
  loadAllModels: (models: ModelInfo[]) => {
    // Load settings from disk for each model — merge with defaults
    const loadedSettings = get().settings;
    
    for (const model of models) {
      if (!loadedSettings[model.path]) {
        // No stored settings — use auto-detect defaults based on model size/backend
        let defaultGpuLayers = -1;
        
        // Adjust GPU layers based on backend and model size
        if (model.backend === 'cpu') {
          defaultGpuLayers = 0; // CPU-only models get no GPU layers
        } else if (model.sizeMB > 8000) {
          // Large models (>8GB) — reduce GPU layers to avoid OOM on smaller VRAM systems
          defaultGpuLayers = -1; // Still use all, but user should manually adjust if they see issues
        }
        
        const currentState = get().settings;
        set({ settings: { ...currentState, [model.path]: { contextWindow: ((model as any).settings?.contextWindow ?? 0) as number | undefined, gpuLayers: defaultGpuLayers, threads: -1 } } });
      } else if ((model as any).settings) {
        // Model metadata includes embedded settings — merge them in
        const currentState = get().settings;
        set({ settings: { ...currentState, [model.path]: (model as any).settings } });
      }
    }
  },
  
  saveToDisk: async () => {
    const filePath = getSettingsFilePath();
    
    try {
      // Only save models that have non-default settings (non-zero values)
      const toSave: Record<string, Partial<ModelSettings>> = {};
      
      for (const [path, settings] of Object.entries(get().settings)) {
        if (Object.values(settings).some(v => v !== 0 && v !== -1)) {
          // Has non-default value — save it
          toSave[path] = settings;
        } else if (Object.keys(settings).length > 0) {
          // User has explicitly set some values but they're all defaults — still save
          toSave[path] = settings;
        }
      }
      
      const fs = await import('fs');
      const dir = process.platform === 'win32' 
        ? (process.env.APPDATA || '/tmp')
        : (process.env.HOME || '/tmp');
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, JSON.stringify(toSave, null, 2));
    } catch (err) {
      console.warn('Failed to save model settings to disk:', err);
    }
  },
  
  loadFromDisk: async () => {
    const filePath = getSettingsFilePath();
    
    try {
      const fs = await import('fs');
      
      if (!fs.existsSync(filePath)) return; // No saved settings — use defaults
      
      const raw = fs.readFileSync(filePath, 'utf-8');
      const loaded: Record<string, Partial<ModelSettings>> = JSON.parse(raw);
      
      set({ settings: loaded });
    } catch (err) {
      console.warn('Failed to load model settings from disk:', err);
    }
  },
}));

// ─── IPC Event Handler for when main process loads models from disk ──────────────
export function handleModelsLoaded(models: ModelInfo[]): void {
  useModelSettingsStore.getState().loadAllModels(models);
}