// Engine Logging Panel — real-time monitoring of both engines during reasoning blocks (Phase E)
import React, { useEffect, useRef, useState } from 'react';
import type { LogLevel } from '../engine/engineLogger';

// Log level color mapping for catppuccin theme
const LEVEL_COLORS: Record<LogLevel | string, string> = {
  trace: 'text-[#89dceb]', // cyan — lowest priority
  debug: 'text-[#b4f9f8]', // light cyan
  info: 'text-[#a6e3a1]', // green
  warn: 'text-[#f9e2af]', // yellow
  error: 'text-[#f38ba8]', // red — highest priority
};

const LEVEL_ICONS: Record<LogLevel | string, string> = {
  trace: '🔬',
  debug: '🐛',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
};

interface EngineLoggingPanelProps {
  // Called when user wants to start/stop logging for an engine
  onStartPrimary?: () => void;
  onStopPrimary?: () => void;
  onStartSystemAI?: () => void;
  onStopSystemAI?: () => void;
}

export const EngineLoggingPanel: React.FC<EngineLoggingPanelProps> = ({
  onStartPrimary,
  onStopPrimary,
  onStartSystemAI,
  onStopSystemAI,
}) => {
  // State per engine tab
  interface TabState {
    activeTab: 'primary' | 'systemAI';
    filterLevel: LogLevel | 'all' | 'none';
    searchQuery: string;
  }

  const [tab, setTab] = useState<TabState>({
    activeTab: 'primary',
    filterLevel: 'all',
    searchQuery: '',
  });

  // Log entries per engine
  interface EntryState {
    primaryEntries: Array<{ id: string; timestamp: number; level: LogLevel; message: string }>;
    systemAIEntries: Array<{ id: string; timestamp: number; level: LogLevel; message: string }>;
  }

  const [entries, setEntries] = useState<EntryState>({
    primaryEntries: [],
    systemAIEntries: [],
  });

  // Session states per engine (whether logging is currently active)
  interface SessionState {
    primaryActive: boolean;
    systemAIActive: boolean;
  }

  const [sessions, setSessions] = useState<SessionState>({
    primaryActive: false,
    systemAIActive: false,
  });

  // Refs for IPC listeners (to avoid stale closures)
  const entriesRef = useRef(entries);
  const sessionsRef = useRef(sessions);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // ─── IPC Event Listeners (Phase E) ──────────────

  // Listen for real-time log entries from engine stderr/stdout
  useEffect(() => {
    const cleanupEngineData = window.api?.engineLogging?.onEngineData((data: unknown) => {
      try {
        if (!data || typeof data !== 'object') return;
        const event = data as Record<string, unknown>;

        // Only process engine-logging-log events (not raw stdout forwarding)
        if (event.type === 'engine-logging-log' && typeof event.level === 'string' && typeof event.message === 'string') {
          const entry: EntryState[keyof EntryState][number] = {
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: Date.now(),
            level: (event.level as LogLevel),
            message: event.message.toString(),
          };

          setEntries((prev) => ({
            ...prev,
            [`${event.engineId}Entries`]: [...prev[`${event.engineId}Entries`], entry].slice(-10000), // Cap at 10K entries per engine
          }));
        }
      } catch { /* ignore parsing errors */ }
    });

    return () => { cleanupEngineData?.(); };
  }, []);

  // ─── Handler functions ──────────────

  const handleStartLogging = (engineId: 'primary' | 'systemAI') => async () => {
    try {
      await window.api.engineLogging.start(engineId);
      setSessions((prev) => ({ ...prev, [`${engineId}Active`]: true }));
    } catch {}
  };

  const handleStopLogging = (engineId: 'primary' | 'systemAI') => async () => {
    try {
      await window.api.engineLogging.stop(engineId);
      setSessions((prev) => ({ ...prev, [`${engineId}Active`]: false }));
    } catch {}
  };

  const handleClearEntries = (engineId: 'primary' | 'systemAI') => () => {
    setEntries((prev) => ({ ...prev, [`${engineId}Entries`]: [] }));
  };

  // Filter entries based on current filter level and search query
  const getFilteredEntries = (rawEntries: typeof entries.primaryEntries): typeof entries.primaryEntries => {
    if (!tab.filterLevel || tab.filterLevel === 'all') return rawEntries;

    const filtered = rawEntries.filter(entry => {
      // Filter by log level
      const LEVEL_ORDER: Record<LogLevel, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };
      if (tab.filterLevel !== 'all' && tab.filterLevel !== 'none') {
        const minOrder = LEVEL_ORDER[tab.filterLevel as LogLevel];
        const entryOrder = LEVEL_ORDER[entry.level];
        if (entryOrder < minOrder) return false;
      }

      // Filter by search query
      if (tab.searchQuery && !entry.message.toLowerCase().includes(tab.searchQuery.toLowerCase())) {
        return false;
      }

      return true;
    });

    // Sort by timestamp descending (newest first)
    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  };

  const currentEntries = getFilteredEntries(entries[`${tab.activeTab}Entries`]);

  // ─── Render ──────────────

  return (
    <div className="bg-[#181825] border-b border-[#45475a]">
      {/* Tab bar */}
      <div className="flex items-center bg-[#1e1e2e]/50 px-3 py-1.5 gap-2">
        <span className="text-xs font-semibold text-[#6c7086] uppercase tracking-wider mr-1">Engine</span>

        {/* Engine tabs */}
        {(['primary', 'systemAI'] as const).map((engineId) => (
          <button
            key={engineId}
            onClick={() => setTab((t) => ({ ...t, activeTab: engineId }))}
            className={`
              flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded cursor-pointer transition-colors border
              ${tab.activeTab === engineId
                ? 'bg-[#313244] text-[#cdd6f4] border-[#cba6f7]/40'
                : 'text-[#6c7086] hover:bg-[#313244] hover:text-[#a6adc8] border-transparent'
              }
            `}
          >
            {engineId === 'primary' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-[#cba6f7]" />
                Primary
                {sessions.primaryActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a6e3a1] animate-pulse" />
                )}
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-[#89b4fa]" />
                System AI
                {sessions.systemAIActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a6e3a1] animate-pulse" />
                )}
              </>
            )}
          </button>
        ))}

        {/* Filter bar */}
        <div className="ml-auto flex items-center gap-2">
          {/* Log level filter */}
          <select
            value={tab.filterLevel}
            onChange={(e) => setTab((t) => ({ ...t, filterLevel: e.target.value as LogLevel | 'all' | 'none' }))}
            className="bg-[#1e1e2e] border border-[#45475a] rounded px-1.5 py-0.5 text-xs"
          >
            <option value="all">All Levels</option>
            <option value="info">Info+</option>
            <option value="warn">Warn+</option>
            <option value="error">Errors Only</option>
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder="Search logs..."
            value={tab.searchQuery}
            onChange={(e) => setTab((t) => ({ ...t, searchQuery: e.target.value }))}
            className="bg-[#1e1e2e] border border-[#45475a] rounded px-2 py-0.5 text-xs w-32"
          />

          {/* Clear */}
          <button onClick={handleClearEntries(tab.activeTab)} className="text-xs opacity-60 hover:opacity-100 transition-opacity">
            🗑️ Clear
          </button>

          {/* Start/Stop logging */}
          {!sessions[`${tab.activeTab}Active`] ? (
            <button onClick={handleStartLogging(tab.activeTab)} className="px-2 py-0.5 rounded bg-[#313244] hover:bg-[#45475a] text-xs transition">
              ▶ Start Logging
            </button>
          ) : (
            <button onClick={handleStopLogging(tab.activeTab)} className="px-2 py-0.5 rounded bg-[#f38ba8]/20 hover:bg-[#f38ba8]/40 text-xs transition">
              ⏹ Stop Logging
            </button>
          )}
        </div>
      </div>

      {/* Log entries area */}
      <div className="h-36 overflow-y-auto bg-[#1e1e2e] border-t border-[#45475a]">
        {currentEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-[#6c7086]">
            No log entries — start logging or adjust your filter.
          </div>
        ) : (
          <div className="py-1 px-2 space-y-0.5">
            {currentEntries.map((entry) => (
              <div key={entry.id} className={`flex items-center gap-2 py-0.5 text-xs hover:bg-[#313244]/40 transition-colors`}>
                {/* Timestamp */}
                <span className="text-[#6c7086] flex-shrink-0 font-mono w-20">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>

                {/* Level icon + label */}
                <span className={`${LEVEL_COLORS[entry.level]} flex items-center gap-1 flex-shrink-0 w-16`}>
                  <span>{LEVEL_ICONS[entry.level]}</span>
                  <span className="uppercase tracking-wider">{entry.level}</span>
                </span>

                {/* Message */}
                <span className="text-[#a6adc8] truncate font-mono">
                  {entry.message.length > 200 ? entry.message.slice(0, 197) + '...' : entry.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};