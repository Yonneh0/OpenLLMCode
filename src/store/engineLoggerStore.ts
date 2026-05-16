// Engine Logger Store — Zustand store for engine logging state in the UI (Phase E)
import { create } from 'zustand';
import type { LogLevel, EngineLogEntry, EngineLoggingSession } from '../engine/engineLogger';

interface EngineLoggerState {
  // Current active session IDs for each engine
  primaryActiveSessionId: string | null;
  systemAIActiveSessionId: string | null;
  
  // Filter state for UI display
  logFilterLevel: LogLevel | 'all' | 'none';
  logSearchQuery: string;
  
  // Actions — Session management
  startPrimaryLogging: () => Promise<void>;
  startSystemAILogging: () => Promise<void>;
  stopEngineLogging: (engineId: 'primary' | 'systemAI') => Promise<boolean>;
  
  // Actions — Log entry display
  getLogEntries: (engineId: 'primary' | 'systemAI', includeDisk?: boolean) => Promise<EngineLogEntry[]>;
  clearLogEntries: (engineId: 'primary' | 'systemAI') => void;
  
  // Actions — Filtering
  setLogFilterLevel: (level: LogLevel | 'all' | 'none') => void;
  setLogSearchQuery: (query: string) => void;
  
  // Utility
  getActiveSessionForEngine: (engineId: 'primary' | 'systemAI') => EngineLoggingSession | null;
}

export const useEngineLoggerStore = create<EngineLoggerState>((set, get) => ({
  primaryActiveSessionId: null,
  systemAIActiveSessionId: null,
  
  logFilterLevel: 'all',
  logSearchQuery: '',
  
  // ─── Session management (wired via IPC) ──────────────
  
  startPrimaryLogging: async () => {
    try {
      const result = await window.api.engineLogging.start('primary');
      if (result && typeof result === 'object' && 'sessionId' in result) {
        set({ primaryActiveSessionId: String((result as any).sessionId) });
      }
    } catch (err) {
      console.error('Failed to start primary engine logging:', err);
    }
  },
  
  startSystemAILogging: async () => {
    try {
      const result = await window.api.engineLogging.start('systemAI');
      if (result && typeof result === 'object' && 'sessionId' in result) {
        set({ systemAIActiveSessionId: String((result as any).sessionId) });
      }
    } catch (err) {
      console.error('Failed to start System AI engine logging:', err);
    }
  },

  stopEngineLogging: async (engineId: 'primary' | 'systemAI') => {
    try {
      await window.api.engineLogging.stop(engineId);
      set((s) => ({
        primaryActiveSessionId: engineId === 'primary' ? null : s.primaryActiveSessionId,
        systemAIActiveSessionId: engineId === 'systemAI' ? null : s.systemAIActiveSessionId,
      }));
      return true;
    } catch {
      console.error(`Failed to stop ${engineId} engine logging`);
      return false;
    }
  },

  // ─── Log entry display (wired via IPC) ──────────────

  getLogEntries: async (engineId: 'primary' | 'systemAI', includeDisk = false): Promise<EngineLogEntry[]> => {
    try {
      const result = await window.api.engineLogging.getLogEntries(engineId, includeDisk);
      if (Array.isArray(result)) {
        return result as EngineLogEntry[];
      }
      return [];
    } catch (err) {
      console.error(`Failed to get log entries for ${engineId}:`, err);
      return [];
    }
  },

  clearLogEntries: (engineId: 'primary' | 'systemAI') => {
    set((s) => ({
      primaryActiveSessionId: null,
      systemAIActiveSessionId: null,
    }));
    // Note: actual clearing is handled by engineLogger on the main process side
  },

  // ─── Filtering ──────────────

  setLogFilterLevel: (level: LogLevel | 'all' | 'none') => {
    set({ logFilterLevel: level });
  },

  setLogSearchQuery: (query: string) => {
    set({ logSearchQuery: query });
  },

  // ─── Utility ──────────────

  getActiveSessionForEngine: (engineId: 'primary' | 'systemAI'): EngineLoggingSession | null => {
    const sessionId = engineId === 'primary' 
      ? get().primaryActiveSessionId 
      : get().systemAIActiveSessionId;
    
    if (!sessionId) return null;
    
    // Return a stub session — the actual session data is managed by main process IPC
    return {
      engineId,
      isActive: true,
      logEntries: [],
      maxEntries: 10000,
    };
  },
}));

// ─── Helper to filter log entries based on current store state (exported for use in components) ──────────────
export function filterLogEntries(entries: EngineLogEntry[], level?: LogLevel | 'all' | 'none', query?: string): EngineLogEntry[] {
  const effectiveLevel = level ?? useEngineLoggerStore.getState().logFilterLevel;
  const effectiveQuery = query ?? useEngineLoggerStore.getState().logSearchQuery;
  
  return entries.filter(entry => {
    // Filter by minimum log level if set to 'all' — show only >= info
    if (effectiveLevel !== 'all') {
      const LEVEL_ORDER: Record<LogLevel, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };
      const minOrder = LEVEL_ORDER[effectiveLevel as LogLevel];
      const entryOrder = LEVEL_ORDER[entry.level];
      if (entryOrder < minOrder) return false;
    }
    
    // Filter by search query
    if (effectiveQuery && !entry.message.toLowerCase().includes(effectiveQuery.toLowerCase())) {
      return false;
    }
    
    return true;
  });
}

// ─── Helper functions to call engineLogger from the store — wired via IPC ──────────────

export async function startPrimaryLogging(): Promise<void> {
  const result = await window.api.engineLogging.start('primary');
  if (result && typeof result === 'object' && 'sessionId' in result) {
    useEngineLoggerStore.getState().startPrimaryLogging();
  }
}

export async function startSystemAILogging(): Promise<void> {
  const result = await window.api.engineLogging.start('systemAI');
  if (result && typeof result === 'object' && 'sessionId' in result) {
    useEngineLoggerStore.getState().startSystemAILogging();
  }
}

export async function stopPrimaryLogging(): Promise<boolean> {
  const success = await window.api.engineLogging.stop('primary');
  if (success) {
    useEngineLoggerStore.setState({ primaryActiveSessionId: null });
  }
  return Boolean(success);
}

export async function stopSystemAILogging(): Promise<boolean> {
  const success = await window.api.engineLogging.stop('systemAI');
  if (success) {
    useEngineLoggerStore.setState({ systemAIActiveSessionId: null });
  }
  return Boolean(success);
}

// ─── Helper to get all available MCP tool names — wired via mcpManager → toolRegistry ──────────────
export function getAllMCPToolNames(): string[] {
  // This will be populated by the agent core when MCP tools are registered.
  // The actual implementation is in mcpManager.ts, but we return a placeholder here
  // since the store doesn't have direct access to mcpManager state.
  return [];
}

// ─── Helper to call an MCP tool — wired via mcpManager → toolRegistry ──────────────
export async function executeMCPToolCall(serverToolName: string, params?: Record<string, unknown>): Promise<any> {
  // This will be handled by the agent core's tool registry integration.
  // The actual implementation is in mcpManager.ts, but we return a placeholder here
  // since the store doesn't have direct access to mcpManager state.
  console.warn('MCP tool execution not yet wired from store — use mcpManager.callMCPTool() directly');
  throw new Error(`MCP tool "${serverToolName}" is not registered with the agent core`);
}