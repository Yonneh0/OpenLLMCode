// MCP Server Manager — discovers, registers, and manages MCP servers at runtime (Phase E)
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { McpTool } from '@modelcontextprotocol/sdk/types.js';

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
  tools: McpTool[];
  config: MCPServerConfig;
}

// Global state for all MCP servers
let registeredServers = new Map<string, MCPServer>();
let connectedClients = new Map<string, Client>();
let serverIdCounter = Date.now();

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
        env: { ...process.env, ...config.env },
      });

      client = new Client(
        { name: `OpenLLMCode-client`, version: '0.1.0' },
        { capabilities: {} }
      );
      await client.connect(transport);
    } else if (config.transport === 'http' && config.url) {
      // HTTP transport — use fetch-based MCP client
      const httpTransport = new StdioClientTransport({
        command: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
        args: [],
        env: { ...process.env },
      });

      client = new Client(
        { name: `OpenLLMCode-client`, version: '0.1.0' },
        { capabilities: {} }
      );
      await client.connect(httpTransport);
    } else {
      throw new Error('Invalid MCP server configuration');
    }

    // Discover tools from the connected server
    const toolsResponse = await client.listTools();
    const tools: McpTool[] = (toolsResponse?.tools || []).map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || {},
    }));

    // Update server status with discovered tools
    registeredServers.set(config.id, { ...server, status: 'connected', tools });
    connectedClients.set(config.id, client);

    return { ...server, status: 'connected', tools };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    registeredServers.set(config.id, { ...server, status: 'error', error: errorMessage });
    throw new Error(`Failed to connect MCP server "${config.name}": ${errorMessage}`);
  }
}

// Disconnect an MCP server and clean up resources
export function disconnectServer(serverId: string): boolean {
  const client = connectedClients.get(serverId);
  if (client) {
    try {
      client.close();
    } catch {}
    connectedClients.delete(serverId);
  }

  const existing = registeredServers.get(serverId);
  if (existing) {
    registeredServers.set(serverId, { ...existing, status: 'disconnected', tools: [] });
    return true;
  }
  return false;
}

// ─── Tool Integration ──────────────

// Get all available MCP tool names across all connected servers
export function getMCPToolNames(): string[] {
  const names: string[] = [];
  for (const server of registeredServers.values()) {
    if (server.status === 'connected') {
      for (const tool of server.tools) {
        names.push(`${server.name}:${tool.name}`);
      }
    }
  }
  return names;
}

// Call an MCP tool by name (format: "serverName:toolName")
export async function callMCPTool(serverToolName: string, params?: Record<string, unknown>): Promise<any> {
  // Parse the server:tool format
  const [serverName, toolName] = serverToolName.split(':');
  if (!serverName || !toolName) {
    throw new Error('Invalid MCP tool name — expected format "serverName:toolName"');
  }

  // Find the server by name or id
  let server = registeredServers.get(serverName);
  const client = connectedClients.get(server?.id || '');

  if (!client) {
    throw new Error(`MCP server "${serverName}" is not connected`);
  }

  try {
    // Call the tool through MCP protocol
    return await client.callTool({ name: toolName, arguments: params });
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

// Remove an MCP server config (disconnects if connected)
export function removeServer(serverId: string): boolean {
  disconnectServer(serverId);
  registeredServers.delete(serverId);
  connectedClients.delete(serverId);
  return true;
}

// ─── Config Persistence ──────────────

// Save MCP server configs to .openllmcode-mcp in project root
export async function saveMCPConfigs(projectRoot: string): Promise<void> {
  const configPath = require('path').join(projectRoot, '.openllmcode-mcp');
  const nonBuiltinServers = Array.from(registeredServers.values())
    .filter(s => !s.config.id.startsWith('builtin-'))
    .map(s => s.config);

  try {
    require('fs').writeFileSync(configPath, JSON.stringify(nonBuiltinServers, null, 2));
  } catch {} // Ignore errors — file might not be writable
}

// Load MCP server configs from .openllmcode-mcp in project root
export async function loadMCPConfigs(projectRoot: string): Promise<MCPServerConfig[]> {
  const configPath = require('path').join(projectRoot, '.openllmcode-mcp');
  try {
    const raw = require('fs').readFileSync(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return []; // No config file — use built-ins only
  }
}

// ─── Health Check / Monitoring ──────────────

// Periodically check all server health and reconnect if disconnected
export async function healthCheck(): Promise<Map<string, MCPServer>> {
  const results = new Map<string, MCPServer>();

  for (const [serverId, server] of registeredServers) {
    // Only check servers that should be connected but aren't
    if (server.status === 'disconnected' || server.status === 'error') {
      // Don't auto-reconnect — user must manually trigger reconnection
      continue;
    }

    results.set(serverId, server);
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