// MCP Server Manager — discovers, registers, and manages MCP servers at runtime (Phase E)
// Import transport types — stdio for local servers, SSE/HTTP for remote servers
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
// Client is a runtime class (not a type) — must use import, not import type
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Tool, ClientCapabilities, ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';

// Keepalive ping interval for SSE connections — prevents timeouts on idle connections
const SSE_KEEPALIVE_INTERVAL = 30_000; // 30 seconds

// Configuration for a single MCP server
export interface MCPServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http';
  // stdio config
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // http config
  url?: string;
}

// Discovered MCP server with its tools (what the agent sees)
export interface MCPServer {
  id: string;
  name: string;
  transport: 'stdio' | 'http';
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
  tools: Tool[];
  config: MCPServerConfig;
}

// Global state for all MCP servers
let registeredServers = new Map<string, MCPServer>();
let connectedClients = new Map<string, Client>();
let serverIdCounter = Date.now();

// Track SSE keepalive intervals so we can clean them up on disconnect
const sseIntervals = new Map<string, ReturnType<typeof setInterval>>();

// ─── Built-in MCP servers (always available) ──────────────
const BUILTIN_SERVERS: MCPServerConfig[] = [
  {
    id: 'builtin-git',
    name: 'Git Server',
    transport: 'stdio',
    command: process.platform === 'win32' ? 'git-server.bat' : 'git-server.sh',
    args: [],
  },
];

// ─── Discovery ──────────────

// Discover MCP servers from local config file (.openllmcode-mcp) in project root
export async function discoverLocalServers(projectRoot?: string): Promise<MCPServerConfig[]> {
  const discovered: MCPServerConfig[] = [];

  if (!projectRoot) return BUILTIN_SERVERS;

  // Read .openllmcode-mcp config file (JSON format)
  let mcpConfigs: MCPServerConfig[] = [];
  try {
    const fs = await import('fs');
    const pathModule = await import('path');
    const configPath = pathModule.join(projectRoot, '.openllmcode-mcp');
    if (fs.existsSync(configPath)) {
      mcpConfigs = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {
    // Config file doesn't exist or is invalid — continue with built-ins only
  }

  discovered.push(...BUILTIN_SERVERS);
  discovered.push(...mcpConfigs.filter(c => !discovered.some(d => d.id === c.id)));
  return discovered;
}

// ─── Server Management ──────────────

// Connect to an MCP server and discover its tools
export async function connectServer(config: MCPServerConfig): Promise<MCPServer> {
  const existing = registeredServers.get(config.id);
  if (existing && existing.status === 'connected') {
    return existing; // Already connected
  }

  const server: MCPServer = {
    id: config.id,
    name: config.name,
    transport: config.transport,
    status: 'connecting',
    tools: [],
    config,
  };

  registeredServers.set(config.id, server);

  try {
    let client: Client;

    if (config.transport === 'stdio' && config.command) {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: (config.env !== undefined) ? Object.fromEntries(
          Object.entries({ ...process.env, ...config.env }).filter(([_, v]) => v != null)
        ) as Record<string, string> : undefined,
      });

      client = new Client(
        { name: `OpenLLMCode-client`, version: '0.1.0' },
        { capabilities: {} as ClientCapabilities }
      );
      await client.connect(transport);
    } else if (config.transport === 'http' && config.url) {
      // HTTP/SSE transport — use SSEClientTransport for remote MCP servers over SSE
      const sseTransport = new SSEClientTransport(new URL(config.url));

      client = new Client(
        { name: `OpenLLMCode-client`, version: '0.1.0' },
        { capabilities: {} as ClientCapabilities }
      );
      
      // Connect to the server — this establishes the HTTP connection and receives SSE events
      await client.connect(sseTransport);
      
      // Start keepalive ping for SSE connection (prevents proxy/firewall timeouts)
      const interval = setInterval(() => {
        try {
          // Use MCP ping to check if server is still alive
          client.ping().catch(() => {});
        } catch {
          // Keepalive failed — server may have disconnected, cleanup handled by disconnectServer
        }
      }, SSE_KEEPALIVE_INTERVAL);
      
      // Store interval reference for cleanup during disconnect
      sseIntervals.set(config.id, interval);
    } else {
      throw new Error('Invalid MCP server configuration');
    }

    // Discover tools from the connected server
    const toolsResponse = await client.listTools();
    const tools: Tool[] = (toolsResponse?.tools || []).map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || {},
    }));

    // Update server status with discovered tools and SSE capabilities
    registeredServers.set(config.id, { ...server, status: 'connected', tools });
    connectedClients.set(config.id, client);

    return { ...server, status: 'connected', tools };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    registeredServers.set(config.id, { ...server, status: 'error', error: errorMessage });
    throw new Error(`Failed to connect MCP server "${config.name}": ${errorMessage}`);
  }
}

// Disconnect an MCP server and clean up resources — also removes its tools from the agent core
export async function disconnectServer(serverId: string): Promise<boolean> {
  // Clean up SSE keepalive interval if one exists for this server
  const interval = sseIntervals.get(serverId);
  if (interval) {
    clearInterval(interval);
    sseIntervals.delete(serverId);
  }

  const client = connectedClients.get(serverId);
  if (client) {
    try {
    // No-op for now — SSEClientTransport doesn't expose cancel(), cleanup handled by close()
      client.close();
    } catch {}
    connectedClients.delete(serverId);
  }

  const existing = registeredServers.get(serverId);
  if (existing) {
    // Remove this server's tools from the registry before disconnecting
    await unregisterServerToolsFromRegistry(serverId);
    
    registeredServers.set(serverId, { ...existing, status: 'disconnected', tools: [] });
    return true;
  }
  return false;
}

/**
 * Unregister only the tools belonging to a specific server from the agent's tool registry.
 * Called when a single server disconnects so its tools are no longer available but others remain.
 */
async function unregisterServerToolsFromRegistry(serverId: string): Promise<void> {
  if (!mcpToolsRegistered) return;

  const toolRegistry = await import('./toolRegistry.js');
  
  for (const tool of existingToolsForServer(serverId)) {
    const mcpToolName = `${serverId}:${tool.name}`;
    
    try {
      toolRegistry.unregisterTool(mcpToolName);
    } catch (err) {
      console.warn(`Failed to unregister MCP tool "${mcpToolName}" from tool registry:`, err);
    }
  }
}

/** Get all tools for a specific server, used by unregisterServerToolsFromRegistry */
function existingToolsForServer(serverId: string): Tool[] {
  const server = registeredServers.get(serverId);
  return server?.status === 'connected' ? server.tools : [];
}

// ─── Agent Core Integration — provides a centralized API for the agent core to access MCP tools ──────────────

/**
 * Get all available MCP tools in a format suitable for system prompt injection.
 * Called by the agent core when assembling its context.
 */
export function getMCPToolsForSystemPrompt(): Array<{ name: string; description: string }> {
  const tools: Array<{ name: string; description: string }> = [];
  
  for (const server of registeredServers.values()) {
    if (server.status !== 'connected') continue;

    for (const tool of server.tools) {
      const mcpToolName = `${server.id}:${tool.name}`; // Use ID instead of name to avoid colon conflicts
      tools.push({
        name: mcpToolName,
        description: `[${server.name}] ${tool.description}`,
      });
    }
  }

  return tools;
}

// Track whether MCP tools have been registered with the agent's tool registry
let mcpToolsRegistered = false;

/**
 * Register all connected MCP server tools with the agent's tool registry.
 * This is called automatically after each successful MCP server connection,
 * and also manually when needed (e.g., during agent initialization).
 */
export async function registerMCPToolsWithRegistry(): Promise<void> {
  // Dynamically import tool registry to avoid circular dependency at module load time
  const toolRegistry = await import('./toolRegistry.js');

  for (const server of registeredServers.values()) {
    if (server.status !== 'connected') continue;

    for (const tool of server.tools) {
      const mcpToolName = `${server.id}:${tool.name}`; // Use ID to avoid colon conflicts
      
      // Check if already registered to avoid duplicates — use the same format as getMCPToolNames()
      const allNames = getMCPToolNames();
      if (allNames.includes(mcpToolName)) {
        continue; // Already registered
      }

      // Build the parameter schema for the tool registry format
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
        toolRegistry.registerTool({
          name: mcpToolName as any,  // ToolType will accept unknown types at runtime — MCP tools use "id:name" format
          description: `[${server.name}] ${tool.description}`,
          parameters,
          defaultApproval: 'require', // MCP tools require approval by default (user must trust the server)
        });
      } catch (err) {
        console.warn(`Failed to register MCP tool "${mcpToolName}" with tool registry:`, err);
      }
    }
  }

  mcpToolsRegistered = true;
}

/**
 * Unregister all MCP tools from the agent's tool registry.
 * Called when ALL servers disconnect (e.g., project close).
 */
export async function unregisterMCPToolsFromRegistry(): Promise<void> {
  if (!mcpToolsRegistered) return;

  const toolRegistry = await import('./toolRegistry.js');
  
  for (const server of registeredServers.values()) {
    if (server.status !== 'connected') continue;

    for (const tool of server.tools) {
      const mcpToolName = `${server.id}:${tool.name}`;
      
      try {
        toolRegistry.unregisterTool(mcpToolName);
      } catch (err) {
        console.warn(`Failed to unregister MCP tool "${mcpToolName}" from tool registry:`, err);
      }
    }
  }

  mcpToolsRegistered = false;
}

// Get all available MCP tool names across all connected servers
export function getMCPToolNames(): string[] {
  const names: string[] = [];
  for (const server of registeredServers.values()) {
    if (server.status === 'connected') {
      for (const tool of server.tools) {
        // Use server ID instead of name to avoid colon conflicts with tool names like "read_file"
        const mcpToolName = `${server.id}:${tool.name}`;
        names.push(mcpToolName);
      }
    }
  }
  return names;
}

/**
 * Call an MCP tool by name.
 * The format is "serverId:toolName" where serverId can be a UUID or builtin- prefixed ID.
 */
export async function callMCPTool(serverToolName: string, params?: Record<string, unknown>): Promise<any> {
  // Parse the serverId:toolName format — use last colon as separator to handle server names with colons
  const lastColonIdx = serverToolName.lastIndexOf(':');
  if (lastColonIdx === -1) {
    throw new Error('Invalid MCP tool name — expected format "serverId:toolName"');
  }
  const targetServerId = serverToolName.slice(0, lastColonIdx);
  const toolName = serverToolName.slice(lastColonIdx + 1);

  // Find the server by ID (use the exact ID from mcpManager)
  const client = connectedClients.get(targetServerId);

  if (!client) {
    throw new Error(`MCP server "${targetServerId}" is not connected`);
  }

  try {
      // Call the tool through MCP protocol — pass raw parameters for proper type handling
      const result = await (client as any).callTool({ name: toolName, arguments: params ?? {} });
      
      // Handle different response formats from MCP servers
      if (result && typeof result === 'object') {
        // Normalize to a string if the server returns structured content
        if (Array.isArray(result.content)) {
          return result.content
            .filter((c: any) => c.type === 'text' || c.type === 'image')
            .map((c: any) => (c.type === 'text' ? c.text : `[Image ${c.mimeType}]`))
            .join('\n\n');
        }
        // Return as-is if already a string or simple object
        return typeof result === 'string' ? result : JSON.stringify(result);
      }
      
      return String(result || '');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new Error(`MCP tool call failed (${serverToolName}): ${errorMessage}`);
  }
}

// ─── Server List Management ──────────────

// Get all registered MCP servers (for UI display)
export function getRegisteredServers(): MCPServer[] {
  return Array.from(registeredServers.values());
}

// Add a new MCP server config and attempt to connect
export async function addServer(config: Omit<MCPServerConfig, 'id'>): Promise<MCPServer> {
  const id = `mcp-${++serverIdCounter}`;
  return connectServer({ ...config, id });
}

// Remove an MCP server config (disconnects if connected) and clean up its tools
export async function removeServer(serverId: string): Promise<boolean> {
  await disconnectServer(serverId);
  registeredServers.delete(serverId);
  connectedClients.delete(serverId);
  
  // Re-register remaining MCP tools after removing one server's tools
  mcpToolsRegistered = false;
  await registerMCPToolsWithRegistry();
  
  return true;
}

// ─── Config Persistence ──────────────

// Save MCP server configs to .openllmcode-mcp in project root
export async function saveMCPConfigs(projectRoot: string): Promise<void> {
  const pathModule = await import('path');
  const configPath = pathModule.join(projectRoot, '.openllmcode-mcp');
  const nonBuiltinServers = Array.from(registeredServers.values())
    .filter(s => !s.config.id.startsWith('builtin-'))
    .map(s => s.config);

  try {
    const fs = await import('fs');
    fs.writeFileSync(configPath, JSON.stringify(nonBuiltinServers, null, 2));
  } catch {} // Ignore errors — file might not be writable
}

// Load MCP server configs from .openllmcode-mcp in project root
export async function loadMCPConfigs(projectRoot: string): Promise<MCPServerConfig[]> {
  const pathModule = await import('path');
  const configPath = pathModule.join(projectRoot, '.openllmcode-mcp');
  try {
    const fs = await import('fs');
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return []; // No config file — use built-ins only
  }
}

/**
 * Auto-connect all configured MCP servers on startup.
 * Called once during app initialization to discover and connect to servers.
 */
export async function autoConnectServers(projectRoot?: string): Promise<MCPServer[]> {
  const configs = await discoverLocalServers(projectRoot);
  const connected: MCPServer[] = [];

  for (const config of configs) {
    // Skip built-in servers that might not have a real binary available yet
    if (config.id.startsWith('builtin-')) {
      continue;
    }

    try {
      const server = await connectServer(config);
      connected.push(server);
    } catch (err) {
      console.warn(`Failed to auto-connect MCP server "${config.name}":`, err);
    }
  }

  return connected;
}

// Periodically check all server health and reconnect if disconnected
export async function healthCheck(): Promise<Map<string, MCPServer>> {
  const results = new Map<string, MCPServer>();

  for (const [serverId, server] of registeredServers) {
    // Check servers that should be connected but aren't — auto-reconnect them
    if ((server.status === 'disconnected' || server.status === 'error') && (server.config.command !== undefined || server.config.url !== undefined)) {
      try {
        const reconnected = await connectServer(server.config);
        results.set(serverId, reconnected);

        // Re-register tools after auto-reconnect
        mcpToolsRegistered = false;
        await registerMCPToolsWithRegistry();
      } catch (err) {
        console.warn(`Failed to auto-reconnect MCP server "${server.name}":`, err);
      }
    } else if (server.status === 'connected') {
      // Server is healthy — record it
      results.set(serverId, server);
    }
  }

  return results;
}

// Get a summary of overall MCP health for the UI
export function getMCPHealthSummary(): { total: number; connected: number; disconnected: number; error: number } {
  let total = 0;
  let connected = 0;
  let disconnected = 0;
  let error = 0;

  for (const server of registeredServers.values()) {
    total++;
    switch (server.status) {
      case 'connected': connected++; break;
      case 'disconnected': disconnected++; break;
      case 'error': error++; break;
    }
  }

  return { total, connected, disconnected, error };
}