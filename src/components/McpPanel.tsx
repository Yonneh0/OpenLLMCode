// MCP Servers Panel — displays live server status from store (Phase E)
import React, { useEffect } from 'react';
import { useMCPStore } from '../store/mcpStore';

const STATUS_COLORS: Record<string, string> = {
  connected: 'text-[#a6e3a1]',
  disconnected: 'text-[#6c7086]',
  connecting: 'text-[#f9e2af] animate-pulse',
  error: 'text-[#f38ba8]',
};

const STATUS_ICONS: Record<string, string> = {
  connected: '✅',
  disconnected: '⬜',
  connecting: '🔄',
  error: '❌',
};

export function McpPanel() {
  const servers = useMCPStore((s) => s.servers);
  const loadingServers = useMCPStore((s) => s.loadingServers);
  const healthSummary = useMCPStore((s) => s.getHealthSummary());

  useEffect(() => {
    // Auto-discover and load MCP servers on mount (if project root is set)
    const discoverAndLoad = async () => {
      const mcpManager = await import('../engine/mcpManager');
      // Only auto-connect if there are no existing servers yet
      const currentServers = useMCPStore.getState().servers;
      if (currentServers.size === 0) {
        const projectRoot = await window.api.fs.getProjectRoot();
        if (projectRoot) {
          await mcpManager.autoConnectServers(projectRoot);
        }
      }
    };
    discoverAndLoad();
  }, []);

  return (
    <div className="px-3 py-2 border-t border-[#45475a] space-y-1.5">
      <h2 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-1 mt-1">MCP</h2>

      {loadingServers ? (
        <div className="flex items-center gap-1.5 text-sm opacity-70">
          <span className="animate-pulse">🔄 Loading...</span>
        </div>
      ) : servers.size === 0 ? (
        <div className="text-xs text-[#6c7086] italic">No MCP servers configured</div>
      ) : (
        <>
          {/* Health summary */}
          {healthSummary.total > 0 && (
            <div className="flex gap-2 text-xs opacity-70 mb-1">
              <span>{healthSummary.connected}/{healthSummary.total} connected</span>
              {healthSummary.error > 0 && <span className="text-[#f38ba8]">{healthSummary.error} error(s)</span>}
            </div>
          )}

          {/* Server list */}
          <ul className="space-y-1">
            {Array.from(servers.values()).map((server) => (
              <li key={server.id} className={`flex items-center gap-1.5 text-sm ${STATUS_COLORS[server.status] || ''} hover:opacity-100 cursor-pointer transition-opacity`}>
                <span>{STATUS_ICONS[server.status]}</span>
                <span className="truncate">{server.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}