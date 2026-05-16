export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
export interface EngineLogEntry {
    id: string;
    timestamp: number;
    level: LogLevel;
    message: string;
    source: 'primary' | 'systemAI';
}
export interface EngineLoggingSession {
    engineId: string;
    isActive: boolean;
    logEntries: EngineLogEntry[];
    logFile?: string;
    maxEntries: number;
}
export interface EngineLoggerConfig {
    enableDiskLogging: boolean;
    maxMemoryEntriesPerEngine: number;
    diskLogRotationSizeMB: number;
}
export declare function startEngineLogging(engineId: 'primary' | 'systemAI', config?: Partial<EngineLoggerConfig>): EngineLoggingSession;
export declare function stopEngineLogging(engineId: 'primary' | 'systemAI'): boolean;
export declare function getEngineSession(engineId: 'primary' | 'systemAI'): EngineLoggingSession | null;
export declare function addLogEntry(engineId: 'primary' | 'systemAI', level: LogLevel, message: string): EngineLogEntry;
export declare function getEngineLogEntries(engineId: 'primary' | 'systemAI', includeDisk?: boolean): EngineLogEntry[];
export declare function clearEngineLogEntries(engineId: 'primary' | 'systemAI'): boolean;
interface LogFilterOptions {
    minLevel?: LogLevel;
    source?: 'primary' | 'systemAI';
    searchQuery?: string;
}
export declare function filterLogEntries(engineId: 'primary' | 'systemAI', options?: LogFilterOptions): EngineLogEntry[];
export declare function getEngineLoggerConfig(): EngineLoggerConfig;
export declare function setEngineLoggerConfig(config: Partial<EngineLoggerConfig>): void;
export declare function handleEngineStdout(engineId: 'primary' | 'systemAI', data: string): void;
export declare function handleEngineStderr(engineId: 'primary' | 'systemAI', data: string): void;
export {};
