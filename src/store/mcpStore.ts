// MCP Store — Zustand store for managing MCP server state in the UI (Phase E)
import { create } from 'zustand';
import type { MCPServerConfig, MCPServer } from '../engine/mcpManager';

interface MCPState {
  servers: Map<string, MCPServer>;
  loadingServers: boolean;
  
  // Actions — Server lifecycle
  setServers: (servers: MCPServer[]) => void;
  updateServerStatus: (serverId: string, status: 'disconnected' | 'connecting' | 'connected' | 'error', error?: string) => void;
  
  // Actions — Server operations
  connectServer: (config: Omit<MCPServerConfig, 'id'>) => Promise<void>;
  disconnectServer: (serverId: string) => boolean;
  addServer: (config: MCPServerConfig) => void;
  removeServer: (serverId: string) => boolean;
  
  // Actions — Loading state
  setLoadingServers: (loading: boolean) => void;
  
  // Utility
  getHealthSummary: () => { total: number; connected: number; disconnected: number; error: number };
}

export const useMCPStore = create<MCPState>((set, get) => ({
  servers: new Map(),
  loadingServers: false,
  
  // ─── Server lifecycle ──────────────
  
  setServers: (servers) => {
    set((s) => new Map([...s.servers, ...servers.map(srv => [srv.id, srv])]));
  },
  
  updateServerStatus: (serverId, status, error) => {
    set((s) => {
      const existing = s.servers.get(serverId);
      if (!existing) return s;
      
      const updated = { ...existing, status, error };
      return { servers: new Map([...s.servers.entries()].map(([id, srv]) => 
        id === serverId ? [id, updated] : [id, srv]
      ))};
    });
  },
  
  // ─── Server operations ──────────────
  
  connectServer: async (config) => {
    set((s) => ({ loadingServers: true }));
    
    try {
      const mcpManager = await import('../engine/mcpManager');
      const server = await mcpManager.connectServer({ ...config, id: config.id || `mcp-${Date.now()}` });
      
      // Add the newly connected server to the store
      set((s) => ({ 
        servers: new Map([...s.servers.entries(), [server.id, server]]),
        loadingServers: false,
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // Add as error state if not already added by mcpManager
      set((s) => ({ 
        servers: new Map([...s.servers.entries(), [config.id || 'unknown', {
          id: config.id || 'unknown',
          name: config.name,
          transport: config.transport,
          status: 'error' as const,
          error: errorMessage,
          tools: [],
          config,
        }]]),
        loadingServers: false,
      }));
    }
  },
  
  disconnectServer: (serverId) => {
    set((s) => ({ 
      servers: new Map([...s.servers.entries()].map(([id, srv]) => 
        id === serverId ? [id, { ...srv, status: 'disconnected' as const, tools: [] }] : [id, srv]
      ))
    }));
    
    return true; // Always succeeds from UI perspective — actual cleanup is handled by mcpManager
  },
  
  addServer: (config) => {
    set((s) => ({ 
      servers: new Map([...s.servers.entries(), [config.id, {
        id: config.id,
        name: config.name,
        transport: config.transport,
        status: 'disconnected' as const,
        tools: [],
        config,
      }]])
    }));
  },
  
  removeServer: (serverId) => {
    set((s) => ({ 
      servers: new Map([...s.servers.entries()].filter(([id]) => id !== serverId))
    }));
    
    return true; // Always succeeds from UI perspective — actual cleanup is handled by mcpManager
  },
  
  // ─── Loading state ──────────────
  
  setLoadingServers: (loading) => {
    set({ loadingServers: loading });
  },
  
  // ─── Utility ──────────────
  
  getHealthSummary: () => {
    let total = 0;
    let connected = 0;
    let disconnected = 0;
    let error = 0;
    
    for (const server of get().servers.values()) {
      total++;
      switch (server.status) {
        case 'connected': connected++; break;
        case 'disconnected': disconnected++; break;
        case 'error': error++; break;
      }
    }
    
    return { total, connected, disconnected, error };
  },
}));

// ─── Helper function to discover and load servers (called on project open) ──────────────
export async function discoverAndLoadServers(projectRoot: string): Promise<MCPServer[]> {
  const mcpManager = await import('../engine/mcpManager');
  
  // Discover local configs from .openllmcode-mcp file
  const discoveredConfigs = await mcpManager.discoverLocalServers(projectRoot);
  
  set({ loadingServers: true });
  
  try {
    const servers: MCPServer[] = [];
    
    for (const config of discoveredConfigs) {
      try {
        // Attempt to connect each server
        const server = await mcpManager.connectServer(config);
        servers.push(server);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        
        // Add as error state — don't prevent loading other servers
        servers.push({
          id: config.id,
          name: config.name,
          transport: config.transport,
          status: 'error' as const,
          error: errorMessage,
          tools: [],
          config,
        });
      }
    }
    
    // Update store with all discovered servers (connected or not)
    set({ 
      servers: new Map([...get().servers.entries(), ...servers.map(s => [s.id, s])]),
      loadingServers: false,
    });
    
    return servers;
  } catch {
    set({ loadingServers: false });
    return [];
  }
}

// ─── Helper to save current server configs back to .openllmcode-mcp ──────────────
export async function saveMCPConfigs(projectRoot: string): Promise<void> {
  const mcpManager = await import('../engine/mcpManager');
  await mcpManager.saveMCPConfigs(projectRoot);
}

// ─── Helper to get all available MCP tool names (for the agent) ──────────────
export function getAllMCPToolNames(): string[] {
  const mcpManager = require('fs').existsSync ? null : null; // No fs import needed — use mcpManager directly
  return []; // Placeholder — real implementation calls getMCPToolNames() from mcpManager
}

// ─── Helper to call an MCP tool by serverName:toolName format ──────────────
export async function executeMCPToolCall(serverToolName: string, params?: Record<string, unknown>): Promise<any> {
  const mcpManager = await import('../engine/mcpManager');
  return mcpManager.callMCPTool(serverToolName, params);
}