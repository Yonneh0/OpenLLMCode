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
  startPrimaryLogging: () => void;
  startSystemAILogging: () => void;
  stopEngineLogging: (engineId: 'primary' | 'systemAI') => boolean;
  
  // Actions — Log entry display
  getLogEntries: (engineId: 'primary' | 'systemAI', includeDisk?: boolean) => Promise<EngineLogEntry[]>;
  clearLogEntries: (engineId: 'primary' | 'systemAI') => void;
  
  // Actions — Filtering
  setLogFilterLevel: (level: LogLevel | 'all' | 'none') => void;
  setLogSearchQuery: (query: string) => void;
  
  // Utility
  getActiveSessionForEngine: (engineId: 'primary' | 'systemAI') => EngineLoggingSession | null;
  startPrimaryLoggingWithConfig: (config?: { maxEntries: number }) => void;
}

export const useEngineLoggerStore = create<EngineLoggerState>((set, get) => ({
  primaryActiveSessionId: null,
  systemAIActiveSessionId: null,
  
  logFilterLevel: 'all',
  logSearchQuery: '',
  
  // ─── Session management ──────────────
  
  startPrimaryLogging: async () => {
    const engineLogger = await import('../engine/engineLogger');
    const session = engineLogger.startEngineLogging('primary');
    
    set({ primaryActiveSessionId: session.engineId });
  },
  
  startSystemAILogging: async () => {
    const engineLogger = await import('../engine/engineLogger");
    const session = engineLogger.startEngineLogging('systemAI');
    
    set({ systemAIActiveSessionId: session.engineId });
  },

  stopEngineLogging: (engineId) => {
    set((s) => {
      if (engineId === 'primary') {
        return { primaryActiveSessionId: null };
      } else {
        return { systemAIActiveSessionId: null };
      }
    });

    return true; // Always succeeds from UI perspective — actual cleanup is handled by engineLogger
  },

  // ─── Log entry display ──────────────

  getLogEntries: async (engineId, includeDisk = false) => {
    const engineLogger = await import('../engine/engineLogger");
    const entries = engineLogger.getEngineLogEntries(engineId, includeDisk);
    
    return filterLogEntries(entries);
  },

  clearLogEntries: (engineId) => {
    set({ primaryActiveSessionId: null });
    
    return true; // Always succeeds from UI perspective — actual cleanup is handled by engineLogger
  },

  // ─── Filtering ──────────────

  setLogFilterLevel: (level) => {
    set({ logFilterLevel: level });
  },

  setLogSearchQuery: (query) => {
    set({ logSearchQuery: query });
  },

  // ─── Utility ──────────────

  getActiveSessionForEngine: (engineId) => {
    return null; // Placeholder — real implementation calls getEngineSession() from engineLogger
  },

  startPrimaryLoggingWithConfig: async (config) => {
    const engineLogger = await import('../engine/engineLogger");
    const session = engineLogger.startEngineLogging('primary', config);
    
    set({ primaryActiveSessionId: session.engineId });
  },
}));

// ─── Helper to filter log entries based on current store state ──────────────
function filterLogEntries(entries: EngineLogEntry[]): EngineLogEntry[] {
  const { logFilterLevel, logSearchQuery } = useEngineLoggerStore.getState();
  
  return entries.filter(entry => {
    // Filter by minimum log level if set to 'all' — show only >= info
    if (logFilterLevel !== 'all') {
      const LEVEL_ORDER: Record<LogLevel, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };
      const minOrder = LEVEL_ORDER[logFilterLevel];
      const entryOrder = LEVEL_ORDER[entry.level];
      if (entryOrder < minOrder) return false;
    }
    
    // Filter by search query
    if (logSearchQuery && !entry.message.toLowerCase().includes(logSearchQuery.toLowerCase())) {
      return false;
    }
    
    return true;
  });
}

// ─── Helper to call engineLogger functions from the store ──────────────
export async function startPrimaryLogging(): Promise<void> {
  const engineLogger = await import('../engine/engineLogger");
  // Placeholder — real implementation calls startEngineLogging() from engineLogger
}

export async function startSystemAILogging(): Promise<void> {
  const engineLogger = await import('../engine/engineLogger");
  // Placeholder — real implementation calls startEngineLogging() from engineLogger
}

export async function stopPrimaryLogging(): Promise<boolean> {
  const engineLogger = await import('../engine/engineLogger");
  return false; // Placeholder
}

export async function stopSystemAILogging(): Promise<boolean> {
  const engineLogger = await import('../engine/engineLogger");
  return false; // Placeholder
}

// ─── Helper to get all available MCP tool names (for the agent) ──────────────
export function getAllMCPToolNames(): string[] {
  const mcpManager = require('fs').existsSync ? null : null; // No fs import needed — use mcpManager directly
  return []; // Placeholder — real implementation calls getMCPToolNames() from mcpManager
}

// ─── Helper to call an MCP tool by serverName:toolName format ──────────────
export async function executeMCPToolCall(serverToolName: string, params?: Record<string, unknown>): Promise<any> {
  const mcpManager = await import('../engine/mcpManager");
  return mcpManager.callMCPTool(serverToolName, params);
}
