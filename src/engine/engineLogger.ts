// Engine Logger — real-time monitoring of llama.cpp instances during reasoning blocks (Phase E)
import * as fs from 'fs';
import * as pathModule from 'path';

// Log levels for engine logging
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

// A single log entry from an engine
export interface EngineLogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  source: 'primary' | 'systemAI'; // Which engine produced this log
}

// State for a single engine's logging session
export interface EngineLoggingSession {
  engineId: string; // "primary" or "systemAI"
  isActive: boolean;
  logEntries: EngineLogEntry[];
  logFile?: string; // Path to the on-disk log file (if enabled)
  maxEntries: number; // Maximum entries in memory before trimming oldest
}

// Configuration for engine logging
export interface EngineLoggerConfig {
  // Enable disk logging (writes logs to .log files alongside activity.log)
  enableDiskLogging: boolean;
  
  // Maximum log entries to keep in memory per engine
  maxMemoryEntriesPerEngine: number;
  
  // Log rotation size in MB — when a log file exceeds this, it's rotated
  diskLogRotationSizeMB: number;
}

const DEFAULT_CONFIG: EngineLoggerConfig = {
  enableDiskLogging: true,
  maxMemoryEntriesPerEngine: 10000,
  diskLogRotationSizeMB: 5, // 5 MB per log file before rotation
};

// Global state for all engine logging sessions
let primarySession: EngineLoggingSession | null = null;
let systemAISession: EngineLoggingSession | null = null;
let loggerConfig = DEFAULT_CONFIG;
let sessionIdCounter = Date.now();

// ─── Session Management ──────────────

// Start a new logging session for an engine
export function startEngineLogging(
  engineId: 'primary' | 'systemAI',
  config?: Partial<EngineLoggerConfig>,
): EngineLoggingSession {
  const existing = getEngineSession(engineId);
  
  // If there's already an active session, stop it first and rotate the log file
  if (existing && existing.isActive) {
    stopEngineLogging(engineId);
  }

  const maxEntries = config?.maxMemoryEntriesPerEngine || DEFAULT_CONFIG.maxMemoryEntriesPerEngine;
  
  let logFile: string | undefined;
  if (config?.enableDiskLogging ?? loggerConfig.enableDiskLogging) {
    // Create a timestamped log file in the app data directory
    const appDataDir = getAppDataDir();
    const logsDir = pathModule.join(appDataDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -1); // "2026-05-14T12:30-00" format
    logFile = pathModule.join(logsDir, `engine-${engineId}-${timestamp}.log`);
    
    fs.writeFileSync(logFile, `[${timestamp}] Engine logging started for ${engineId}\n`);
  }

  const session: EngineLoggingSession = {
    engineId,
    isActive: true,
    logEntries: [],
    logFile,
    maxEntries,
  };

  if (engineId === 'primary') {
    primarySession = session;
  } else {
    systemAISession = session;
  }

  return session;
}

// Stop an engine logging session and finalize the log file
export function stopEngineLogging(engineId: 'primary' | 'systemAI'): boolean {
  const existing = getEngineSession(engineId);
  
  if (!existing || !existing.isActive) {
    return false; // Already stopped or doesn't exist
  }

  // Write final entry to disk log file (if enabled)
  if (existing.logFile) {
    try {
      const timestamp = new Date().toISOString();
      fs.appendFileSync(existing.logFile, `\n[${timestamp}] Engine logging stopped for ${engineId}\n`);
      
      // Rotate log file if it exceeds the configured size limit
      rotateLogFileIfNecessary(existing.logFile);
    } catch {} // Ignore disk errors silently — memory is still available
  }

  existing.isActive = false;
  
  if (engineId === 'primary') {
    primarySession = null;
  } else {
    systemAISession = null;
  }

  return true;
}

// Get the current logging session for an engine
export function getEngineSession(engineId: 'primary' | 'systemAI'): EngineLoggingSession | null {
  if (engineId === 'primary') return primarySession;
  return systemAISession;
}

// ─── Log Entry Management ──────────────

// Add a log entry to an engine's session
export function addLogEntry(
  engineId: 'primary' | 'systemAI',
  level: LogLevel,
  message: string,
): EngineLogEntry {
  const session = getEngineSession(engineId);
  
  if (!session) {
    // No active session — return entry anyway for potential UI display (ephemeral logging)
    const entry: EngineLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      level,
      message,
      source: engineId,
    };
    // Could emit to IPC for real-time UI display without session
    return entry;
  }

  const entry: EngineLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    level,
    message,
    source: engineId,
  };

  // Add to memory (with size limit enforcement)
  session.logEntries.push(entry);
  
  // Trim oldest entries if we exceed the configured maximum
  while (session.logEntries.length > session.maxEntries) {
    session.logEntries.shift();
  }

  // Write to disk log file if enabled
  if (session.logFile) {
    try {
      const timestamp = new Date().toISOString();
      fs.appendFileSync(session.logFile, `[${timestamp}] [${level.toUpperCase()}] ${message}\n`);
      
      // Rotate log file if it exceeds the configured size limit
      rotateLogFileIfNecessary(session.logFile);
    } catch {} // Ignore disk errors silently — memory is still available
  }

  return entry;
}

// Get all log entries for an engine (memory + optionally disk)
export function getEngineLogEntries(
  engineId: 'primary' | 'systemAI',
  includeDisk: boolean = false,
): EngineLogEntry[] {
  const session = getEngineSession(engineId);
  
  if (!session) return [];
  
  // If we want disk entries too, read and parse the log file
  let diskEntries: EngineLogEntry[] = [];
  if (includeDisk && session.logFile && fs.existsSync(session.logFile)) {
    try {
      const lines = fs.readFileSync(session.logFile, 'utf-8').split('\n');
      
      for (const line of lines) {
        // Parse log entries in format: [timestamp] [LEVEL] message
        const match = line.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+)\]\s*\[([A-Z]+)\]\s*(.+)/);
        if (match) {
          diskEntries.push({
            id: `disk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, // Unique ID for disk entries
            timestamp: Date.parse(match[1]),
            level: match[2].toLowerCase() as LogLevel,
            message: match[3],
            source: engineId,
          });
        }
      }
    } catch {}
  }
  
  return [...session.logEntries, ...diskEntries];
}

// Clear the log entries for an engine (without stopping the session)
export function clearEngineLogEntries(engineId: 'primary' | 'systemAI'): boolean {
  const session = getEngineSession(engineId);
  
  if (!session || !session.isActive) return false;
  
  // Also truncate the disk log file
  if (session.logFile && fs.existsSync(session.logFile)) {
    try {
      fs.writeFileSync(session.logFile, '');
    } catch {}
  }
  
  session.logEntries = [];
  return true;
}

// ─── Log Filtering ──────────────

interface LogFilterOptions {
  minLevel?: LogLevel; // Show entries at this level and above (trace < debug < info < warn < error)
  source?: 'primary' | 'systemAI';
  searchQuery?: string; // Case-insensitive substring match against message content
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

export function filterLogEntries(
  engineId: 'primary' | 'systemAI',
  options?: LogFilterOptions,
): EngineLogEntry[] {
  const entries = getEngineLogEntries(engineId);
  
  return entries.filter(entry => {
    // Filter by source if specified
    if (options?.source && entry.source !== options.source) return false;
    
    // Filter by minimum log level
    if (options?.minLevel) {
      const minOrder = LEVEL_ORDER[options.minLevel];
      const entryOrder = LEVEL_ORDER[entry.level];
      if (entryOrder < minOrder) return false;
    }
    
    // Filter by search query
    if (options?.searchQuery && !entry.message.toLowerCase().includes(options.searchQuery.toLowerCase())) {
      return false;
    }
    
    return true;
  });
}

// ─── Disk Log Rotation ──────────────

// Check if a log file needs rotation and rotate it if so
function rotateLogFileIfNecessary(logFilePath: string): void {
  const config = loggerConfig;
  
  if (!logFilePath) return;
  
  try {
    const stats = fs.statSync(logFilePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    if (fileSizeMB >= config.diskLogRotationSizeMB) {
      // Rotate the log file: rename current to .1, .2, etc.
      let rotationIndex = 1;
      while (fs.existsSync(logFilePath + `.${rotationIndex}`)) {
        rotationIndex++;
      }
      
      fs.renameSync(logFilePath, logFilePath + `.${rotationIndex}`);
      
      // Create a fresh log file with current session info
      const timestamp = new Date().toISOString();
      fs.writeFileSync(logFilePath, `[${timestamp}] Log file rotated — previous ${fileSizeMB.toFixed(1)} MB log moved to .${rotationIndex}\n`);
    }
  } catch {} // Ignore rotation errors silently
}

// ─── Configuration ──────────────

export function getEngineLoggerConfig(): EngineLoggerConfig {
  return { ...loggerConfig };
}

export function setEngineLoggerConfig(config: Partial<EngineLoggerConfig>): void {
  loggerConfig = { ...loggerConfig, ...config };
  
  // Update existing session's max entries if changed
  const needsPrimaryUpdate = config.maxMemoryEntriesPerEngine !== undefined;
    
  for (const [id, session] of [['primary', primarySession], ['systemAI', systemAISession]] as const) {
    if (session && config.maxMemoryEntriesPerEngine !== undefined) {
      session.maxEntries = config.maxMemoryEntriesPerEngine;
    }
  }
}

// ─── Utility ──────────────

function getEngineLoggingDir(): string {
  return pathModule.join(getAppDataDir(), 'logs');
}

function getAppDataDir(): string {
  return pathModule.join(
    process.platform === 'win32' ? (process.env.APPDATA || '/tmp') : (process.env.HOME || '/tmp'),
    'OpenLLMCode',
  );
}

// ─── IPC Event Handlers (called from main process when engine outputs) ──────────────

// Called by the Electron main process when a llama.cpp instance writes to stdout/stderr
export function handleEngineStdout(engineId: 'primary' | 'systemAI', data: string): void {
  try {
    // Try to parse as JSON (llama-server streaming output)
    const lines = data.split('\n').filter(Boolean);
    
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        
        if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta?.content) {
          // Token content — trace level logging
          addLogEntry(engineId, 'trace', `Token: ${JSON.stringify(parsed.choices[0].delta.content)}`);
        } else if (parsed.usage) {
          // Usage stats — info level logging
          const usage = parsed.usage;
          const msg = `Usage: prompt=${usage.prompt_tokens || 0}, completion=${usage.completion_tokens || 0}`;
          addLogEntry(engineId, 'info', msg);
        } else if (parsed.error) {
          // Error from engine — error level logging
          addLogEntry(engineId, 'error', `Engine error: ${JSON.stringify(parsed.error)}`);
        }
      } catch {
        // Non-JSON output — treat as debug-level raw log line
        addLogEntry(engineId, 'debug', `Raw: ${line.slice(0, 200)}${line.length > 200 ? '...' : ''}`);
      }
    }
  } catch {} // Silently ignore parsing errors
}

// Called by the Electron main process when a llama.cpp instance writes to stderr
export function handleEngineStderr(engineId: 'primary' | 'systemAI', data: string): void {
  try {
    const trimmed = data.toString().trim();
    
    if (trimmed) {
      // Stderr is always error/warn level — don't log normal stdout warnings
      addLogEntry(engineId, 'warn', `stderr: ${trimmed.slice(0, 500)}${trimmed.length > 500 ? '...' : ''}`);
    }
  } catch {}
}