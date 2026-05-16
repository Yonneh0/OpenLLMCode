// MCP Store — Zustand store for managing MCP server state in the UI (Phase E)
import { create } from 'zustand';
import type { MCPServerConfig, MCPServer } from '../engine/mcpManager';
import type { MCPToolName } from '../types';

interface MCPState {
  servers: Map<string, MCPServer>;
  loadingServers: boolean;
  
  // Actions — Server lifecycle
  setServers: (servers: MCPServer[]) => void;
  updateServerStatus: (serverId: string, status: 'disconnected' | 'connecting' | 'connected' | 'error', error?: string) => void;
  
  // Actions — Server operations
  connectServer: (config: Omit<MCPServerConfig, 'id'>) => Promise<void>;
   disconnectServer: (serverId: string) => Promise<boolean>;
  addServer: (config: MCPServerConfig) => void;
   removeServer: (serverId: string) => Promise<boolean>;
  
  // Actions — Loading state
  setLoadingServers: (loading: boolean) => void;
  
  // Utility
  getHealthSummary: () => { total: number; connected: number; disconnected: number; error: number };
}

export const useMCPStore = create<MCPState>((set, get) => ({
  servers: new Map(),
  loadingServers: false,
  
  // ─── Server lifecycle ──────────────
  
   // Fix: Properly merge the existing map with new servers using entries() 
   setServers: (servers) => {
     set((s) => {
       const merged = new Map([...s.servers.entries()]);
       for (const srv of servers) {
         if (srv.id !== undefined) {
           merged.set(srv.id, srv);
         }
       }
       return { ...s, servers: merged };
     });
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
    // Generate a unique ID for the new server since we're omitting 'id' from the config
    const id = `mcp-${Date.now()}`;
    
    set((s) => ({ loadingServers: true }));
    
    try {
      const mcpManager = await import('../engine/mcpManager');
      const server = await mcpManager.connectServer({ ...config, id });
      
      // Add the newly connected server to the store
      set((s) => ({ 
        servers: new Map([...s.servers.entries(), [server.id, server]]),
        loadingServers: false,
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // Add as error state if not already added by mcpManager
      set((s) => ({ 
        servers: new Map([...s.servers.entries(), [id, {
          id,
          name: config.name,
          transport: config.transport,
          status: 'error' as const,
          error: errorMessage,
          tools: [],
          config: { ...config, id },
        }]]),
        loadingServers: false,
      }));
    }
  },
  
  disconnectServer: async (serverId) => {
    // Attempt actual disconnection via mcpManager first
    let success = false;
    try {
      const mcpManager = await import('../engine/mcpManager');
      success = await mcpManager.disconnectServer(serverId);
    } catch (err) {
      console.warn(`Failed to disconnect MCP server "${serverId}":`, err);
      success = false;
    }
    
    // Update store regardless of success — always show disconnected state if the call fails
    if (!success) {
      set((s) => ({ 
        servers: new Map([...s.servers.entries()].map(([id, srv]) => 
          id === serverId ? [id, { ...srv, status: 'error' as const, error: `Failed to disconnect MCP server "${serverId}"` }] : [id, srv]
        ))
      }));
    } else {
      set((s) => ({ 
        servers: new Map([...s.servers.entries()].map(([id, srv]) => 
          id === serverId ? [id, { ...srv, status: 'disconnected' as const, tools: [], error: undefined }] : [id, srv]
        ))
      }));
    }
    
    return success;
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
  
   removeServer: async (serverId) => {
     set((s) => ({ 
       servers: new Map([...s.servers.entries()].filter(([id]) => id !== serverId))
     }));
     
     // Actually remove the server via mcpManager
     try {
       const mcpManager = await import('../engine/mcpManager');
       return await mcpManager.removeServer(serverId);
     } catch (err) {
       console.warn(`Failed to remove MCP server "${serverId}":`, err);
       return false;
     }
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

/**
 * Discover and load MCP servers from the project root's .openllmcode-mcp config.
 */
export async function discoverAndLoadServers(projectRoot: string): Promise<MCPServer[]> {
  const mcpManager = await import('../engine/mcpManager');
  
  // Discover local configs from .openllmcode-mcp file
  const discoveredConfigs = await mcpManager.discoverLocalServers(projectRoot);
  
  useMCPStore.setState({ loadingServers: true });
  
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
    
    // Update store with all discovered servers (connected or not) — merge with existing map using entries()
    useMCPStore.setState({ 
      servers: new Map([...useMCPStore.getState().servers.entries(), ...servers.map(s => [s.id, s] as const)]),
      loadingServers: false,
    });
    
    return servers;
  } catch {
    useMCPStore.setState({ loadingServers: false });
    return [];
  }
}

/**
 * Save all non-builtin MCP server configs to the project's .openllmcode-mcp file.
 */
export async function saveMCPConfigs(projectRoot: string): Promise<void> {
  const mcpManager = await import('../engine/mcpManager');
  await mcpManager.saveMCPConfigs(projectRoot);
}

/**
 * Get all available MCP tool names for display in the UI.
 */
export function getAllMCPToolNames(): string[] {
  // Use mcpManager's live state for accuracy
  return getMCPToolNamesFromStore();
}

/** Get all available MCP tool names from the store's server state (synchronous). */
function getMCPToolNamesFromStore(): string[] {
  const servers = useMCPStore.getState().servers;
  const names: string[] = [];
  
  for (const server of servers.values()) {
    if (server.status !== 'connected') continue;
    
    for (const tool of server.tools) {
      const mcpToolName = `${server.id}:${tool.name}`;
      // Only add unique names (avoid duplicates from stale state)
      if (!names.includes(mcpToolName)) {
        names.push(mcpToolName);
      }
    }
  }
  
  return names;
}

/**
 * Execute an MCP tool call — returns the normalized result (string or JSON).
 */
export async function executeMCPToolCall(serverToolName: string, params?: Record<string, unknown>): Promise<any> {
  const mcpManager = await import('../engine/mcpManager');
  return mcpManager.callMCPTool(serverToolName, params);
}

/**
 * Register all MCP tools with the agent's tool registry.
 * Centralized parameter schema builder to avoid duplication across store and mcpManager.ts.
 */
export async function ensureMCPToolsRegistered(): Promise<void> {
  const mcpManager = await import('../engine/mcpManager');
  
  // Re-register all tools in case some were missed during connection
  for (const server of useMCPStore.getState().servers.values()) {
    if (server.status !== 'connected') continue;
    
    for (const tool of server.tools) {
      const mcpToolName = `${server.id}:${tool.name}`;
      
      // Check if already registered to avoid duplicates
      const allNames = getAllMCPToolNames();
      if (allNames.includes(mcpToolName)) {
        continue;
      }
      
      // Build the parameter schema using shared logic (avoid duplication with mcpManager.ts)
      const parameters: Record<string, { type: string; required: boolean; description?: string }> = {};
      const schema = tool.inputSchema as any;
      if (schema?.properties) {
        for (const [paramName, paramDef] of Object.entries(schema.properties)) {
          const p = paramDef as any;
          parameters[paramName] = {
            type: p.type || 'string',
            required: schema.required?.includes(paramName) ?? false,
            description: p.description || '',
          };
        }
      }
      
      // Register with the agent's tool registry using the same format as built-in tools
      try {
        const toolRegistry = await import('../engine/toolRegistry');
        if (toolRegistry.registerTool) {
           toolRegistry.registerTool({
             name: mcpToolName as MCPToolName,  // MCP tools use "id:name" format — not assignable to ToolType directly
            description: `[${server.name}] ${tool.description}`,
            parameters,
            defaultApproval: 'require', // MCP tools require approval by default (user must trust the server)
          });
        }
      } catch {
        console.warn(`Failed to register MCP tool "${mcpToolName}" with tool registry from UI context`);
      }
    }
  }
}
