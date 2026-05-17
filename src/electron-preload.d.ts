// Type declaration for window.electron — mirrors IPC handlers from electron/preload.ts
// This allows renderer components to safely access Electron IPC APIs without type errors.
declare global {
  interface Window {
    // Pingu Phase 1-2: Model and binary loading
    pingu?: {
      downloadGguf: (opts: { url: string; quantization: string; onProgress: (pct: number) => void }) => Promise<{ success: boolean }>;
      loadGgufFromFile: (file: File) => Promise<{ success: boolean; quantMode: string }>;
      selectGgufFile: () => Promise<string | null>;
      
      downloadLlamaCpp: (opts?: { onProgress: (pct: number) => void }) => Promise<{ success: boolean }>;
      installLlamaCppFromZip: (file: File) => Promise<{ success: boolean }>;
      selectLlamaCppZip: () => Promise<string | null>;
      
      getHardwareInfo: () => Promise<{ platform: string; gpu?: string; ramGB: number; hasLlamaCpp?: boolean }>;
    };
    
    // SystemAI communication (PenguinHomeTile pinned dialog)
    sendSystemAIMessage: (message: string) => Promise<unknown>;
    
    // Pingu Phase 4: Inference statistics
    onInferenceStats: (callback: (stats: { tokensPerSecond?: number; contextUsed?: number; contextMax?: number; gpuMemoryUsageMB?: number; cpuThreads?: number }) => void) => () => void;
    
    // Pingu Phase 6: Model reload via prompt
    reloadModel: (opts: { backend: string; gpuLayers?: number; threads?: number; contextWindow?: number }) => Promise<{ success: boolean }>;
  }
}

// Make the module declaration valid
export {};
