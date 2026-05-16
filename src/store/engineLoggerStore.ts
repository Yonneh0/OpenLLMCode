// Engine Logger Store — Zustand store for engine logging state in the UI (Phase E)
import { create } from 'zustand';
import type { LogLevel, EngineLogEntry, EngineLoggingSession } from '../engine/engineLogger';

interface EngineLoggerState {
  // Current active session IDs for each engine
  primaryActiveSessionId: string | null;
  systemAIActiveSessionId: string | null;
  
  // Local state for real-time log entry display — populated by IPC events during streaming
  primaryLogEntries: EngineLogEntry[];
  systemAILogEntries: EngineLogEntry[];
  
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
  
  // Real-time log entries stored locally from IPC events
  primaryLogEntries: [],
  systemAILogEntries: [],
  
  logFilterLevel: 'all',
  logSearchQuery: '',
  
  // ─── Session management (wired via IPC) ──────────────
  
  startPrimaryLogging: async () => {
    try {
      const result = await window.api.engineLogging.start('primary');
      if (result && typeof result === 'object' && 'sessionId' in result) {
        set({ primaryActiveSessionId: String((result as any).sessionId), primaryLogEntries: [] });
      }
    } catch (err) {
      console.error('Failed to start primary engine logging:', err);
    }
  },
  
  startSystemAILogging: async () => {
    try {
      const result = await window.api.engineLogging.start('systemAI');
      if (result && typeof result === 'object' && 'sessionId' in result) {
        set({ systemAIActiveSessionId: String((result as any).sessionId), systemAILogEntries: [] });
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
        // Keep log entries even after stopping — user can still review them
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
      // Return local cache if IPC fails
      return engineId === 'primary' ? get().primaryLogEntries : get().systemAILogEntries;
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

// ─── IPC Event Handler for real-time log data from main process ──────────────
// Called when the main process emits 'engine-logging-data' events during streaming
export function handleEngineDataEvent(engineId: 'primary' | 'systemAI', _data: unknown): void {
  // The raw data is forwarded by the main process — we parse it as JSON to extract log entries
  try {
    const rawData = typeof _data === 'string' ? _data : (typeof _data === 'object' && _data !== null) 
      ? JSON.stringify(_data) 
      : '';
    
    // Try parsing as a JSON log entry first
    let logEntry: EngineLogEntry | null = null;
    try {
      const parsed = typeof _data === 'string' ? JSON.parse(_data) : _data;
      if (parsed && typeof parsed === 'object') {
        logEntry = {
          id: String(parsed.id || `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
          timestamp: Number(parsed.timestamp || Date.now()),
          level: (String(parsed.level || 'info').toLowerCase()) as LogLevel,
          message: String(parsed.message || ''),
          source: engineId,
        };
      }
    } catch {
      // Not a JSON log entry — try parsing as raw text from stdout/stderr handler
      const content = typeof _data === 'string' ? _data : (typeof _data === 'object' && _data !== null) 
        ? JSON.stringify(_data) 
        : '';
      
      if (content.trim()) {
        // Infer log level from content patterns — stderr is always warn/error
        const inferredLevel = content.startsWith('stderr:') || content.startsWith('error') || content.includes('Error') || content.includes('ERROR')
          ? 'warn' as LogLevel 
          : ('debug' as LogLevel);
        
        logEntry = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
          level: inferredLevel,
          message: content.slice(0, 500), // Truncate very long lines
          source: engineId,
        };
      }
    }
    
    if (logEntry && logEntry.message.trim()) {
      setEngineLogEntries(engineId, prev => [...prev, logEntry!]);
    }
  } catch {
    // Silently ignore malformed data — IPC transport may send non-log events
  }
}

// Helper to safely update the local store state for engine log entries
function setEngineLogEntries(
  engineId: 'primary' | 'systemAI', 
  updater: (prev: EngineLogEntry[]) => EngineLogEntry[]
): void {
  const current = engineId === 'primary' 
    ? useEngineLoggerStore.getState().primaryLogEntries 
    : useEngineLoggerStore.getState().systemAILogEntries;
  
  const updated = updater(current);
  
  // Enforce max entries limit (trim oldest)
  const MAX_ENTRIES = 10000;
  while (updated.length > MAX_ENTRIES) {
    updated.shift();
  }
  
  if (engineId === 'primary') {
    useEngineLoggerStore.setState({ primaryLogEntries: updated });
  } else {
    useEngineLoggerStore.setState({ systemAILogEntries: updated });
  }
}

// ─── Helper to get all available MCP tool names — wired via mcpManager → toolRegistry ──────────────
export function getAllMCPToolNames(): string[] {
  // This will be populated by the agent core when MCP tools are registered.
  const mcpManager = require('../engine/mcpManager.js');
  if (mcpManager && typeof mcpManager.getMCPToolNames === 'function') {
    return mcpManager.getMCPToolNames();
  }
  // Fallback: empty list means no MCP tools are available yet
  console.warn('MCP manager not loaded — cannot get tool names');
  return [];
}

// ─── Helper to call an MCP tool — wired via mcpManager → toolRegistry ──────────────
export async function executeMCPToolCall(serverToolName: string, params?: Record<string, unknown>): Promise<any> {
  const mcpManager = require('../engine/mcpManager.js');
  if (mcpManager && typeof mcpManager.callMCPTool === 'function') {
    return mcpManager.callMCPTool(serverToolName, params);
  }
  throw new Error(`MCP tool "${serverToolName}" is not available — MCP manager not loaded`);
}

// ─── Register the IPC event handler for engine data during app initialization ──────────────
export function registerEngineDataHandler(): void {
  if (typeof window === 'undefined') return; // Only on renderer
  
  const handlePrimary = handleEngineDataEvent.bind(null, 'primary');
  const handleSystemAI = handleEngineDataEvent.bind(null, 'systemAI');
  
  try {
    (window as any).api.engineLogging.onEngineData(handlePrimary);
    // Also listen for systemAI — the main process sends same event type but with engineId field
    (window as any).api.engineLogging.onLogEntry(handleSystemAI);
  } catch (err) {
    console.warn('Failed to register engine data handler:', err);
  }
}