// Tool Registry — defines all available agent tools, their schemas, and approval defaults
import type { ToolType, ToolDefinition, ApprovalRulesConfig } from '../types';
import * as fs from 'fs';
import * as path from 'path';

// ─── Built-in tool definitions ──────────────
const BUILTIN_TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file at the specified path',
    parameters: {
      filePath: { type: 'string', required: true, description: 'Path to the file (relative to project root)' },
    },
    defaultApproval: 'auto', // reading files is always safe
  },
  {
    name: 'write_file',
    description: 'Write content to a file at the specified path. Creates directories if needed.',
    parameters: {
      filePath: { type: 'string', required: true, description: 'Path to write (relative to project root)' },
      content: { type: 'string', required: true, description: 'Content to write' },
    },
    defaultApproval: 'require', // modifying files requires approval
  },
  {
    name: 'create_file',
    description: 'Create a new file with the specified content',
    parameters: {
      filePath: { type: 'string', required: true, description: 'Path for the new file (relative to project root)' },
      content: { type: 'string', required: true, description: 'Initial content' },
    },
    defaultApproval: 'require', // creating files requires approval
  },
  {
    name: 'delete_file',
    description: 'Delete a file at the specified path',
    parameters: {
      filePath: { type: 'string', required: true, description: 'Path to delete (relative to project root)' },
    },
    defaultApproval: 'require', // deleting files requires approval
  },
  {
    name: 'run_command',
    description: 'Execute a shell command in the project directory',
    parameters: {
      command: { type: 'string', required: true, description: 'Shell command to execute' },
      cwd: { type: 'string', required: false, description: 'Working directory (defaults to project root)' },
    },
    defaultApproval: 'require', // running commands requires approval
  },
  {
    name: 'search_files',
    description: 'Perform a regex search across files in a directory',
    parameters: {
      path: { type: 'string', required: true, description: 'Directory to search (relative to project root)' },
      regex: { type: 'string', required: true, description: 'Regex pattern to search for' },
      filePattern: { type: 'string', required: false, description: 'Glob filter (e.g., "*.ts")' },
    },
    defaultApproval: 'auto', // searching is safe
  },
  {
    name: 'glob',
    description: 'Find files matching a glob pattern',
    parameters: {
      pattern: { type: 'string', required: true, description: 'Glob pattern (e.g., "**/*.ts")' },
      path: { type: 'string', required: false, description: 'Base directory (defaults to project root)' },
    },
    defaultApproval: 'auto', // globbing is safe
  },

  // ─── Terminal tools (Phase D) ──────────────
  {
    name: 'terminal_run_command',
    description: 'Run a command in the PTY terminal and stream output to the agent. Unlike run_command, this supports long-running processes.',
    parameters: {
      command: { type: 'string', required: true, description: 'Shell command to execute' },
      timeoutMs: { type: 'number', required: false, description: 'Timeout in milliseconds (default 30000)' },
    },
    defaultApproval: 'require', // running commands requires approval
  },
  {
    name: 'terminal_read_output',
    description: 'Read the last N lines of output from the PTY terminal session',
    parameters: {
      lines: { type: 'number', required: false, description: 'Number of lines to read (default 50)' },
    },
    defaultApproval: 'auto', // reading is safe
  },
  {
    name: 'terminal_kill_process',
    description: 'Kill the current process running in the PTY terminal session',
    parameters: {},
    defaultApproval: 'require', // killing processes requires approval
  },
];

// ─── Tool registry state ──────────────
let tools = new Map<string, ToolDefinition>(BUILTIN_TOOLS.map(t => [t.name, t]));

// Register a custom tool (for MCP or skill extensions)
export function registerTool(def: ToolDefinition): void {
  tools.set(def.name, def);
}

// Get the schema for a specific tool
export function getToolSchema(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

// List all registered tool names
export function listTools(): string[] {
  return Array.from(tools.keys());
}

// Get all tool definitions (for system prompt assembly)
export function getAllToolDefinitions(): ToolDefinition[] {
  return Array.from(tools.values());
}

// ─── Approval rules ──────────────
let approvalRules: ApprovalRulesConfig = { categories: {} };

// Load approval rules from .openllmcode-rules file in project root
export function loadApprovalRules(projectRoot: string): void {
  const rulesPath = path.join(projectRoot, '.openllmcode-rules');
  try {
    const raw = fs.readFileSync(rulesPath, 'utf-8');
    approvalRules = JSON.parse(raw);
  } catch {
    // No rules file — use defaults from tool definitions
    approvalRules = { categories: {} };
  }
}

// Save updated approval rules (e.g., after "Always Allow")
export function saveApprovalRules(projectRoot: string): void {
  const rulesPath = path.join(projectRoot, '.openllmcode-rules');
  fs.writeFileSync(rulesPath, JSON.stringify(approvalRules, null, 2));
}

// Check if a tool call requires approval based on the rules config
export function requiresApproval(toolType: ToolType, input?: Record<string, unknown>): boolean {
  // First check the tool's default
  const toolDef = tools.get(toolType);
  if (toolDef?.defaultApproval === 'auto') {
    return false;
  }

  // Then check category-based rules
  const category = getCategoryForTool(toolType);
  const rule = approvalRules.categories[category];
  if (!rule) {
    // No specific rule — fall back to tool default
    return toolDef?.defaultApproval === 'require';
  }

  // Check deny patterns first (they override allow)
  const filePath = input?.filePath as string | undefined;
  if (rule.deny_patterns && filePath) {
    for (const dp of rule.deny_patterns) {
      if (matchGlob(filePath, dp.pattern)) {
        return true; // denied by pattern — always requires approval
      }
    }
  }

  // Check allow patterns
  if (rule.allow_patterns && filePath) {
    for (const ap of rule.allow_patterns) {
      if (matchGlob(filePath, ap.pattern)) {
        return false; // auto-allowed by pattern
      }
    }
  }

  // Fall back to category default
  switch (rule.default) {
    case 'allow': return false;
    case 'deny': return true;
    case 'require_approval': return true;
    default: return toolDef?.defaultApproval === 'require';
  }
}

// Add an "always allow" rule for a specific file pattern
export function addAlwaysAllowRule(category: string, pattern: string, reason: string): void {
  const cat = approvalRules.categories[category] || { default: 'require_approval' };
  if (!cat.allow_patterns) cat.allow_patterns = [];
  // Avoid duplicates
  if (!cat.allow_patterns.some(p => p.pattern === pattern)) {
    cat.allow_patterns.push({ pattern, reason });
  }
  approvalRules.categories[category] = cat;
}

// Map a tool type to its category for rules lookup
function getCategoryForTool(toolType: ToolType): string {
  switch (toolType) {
    case 'read_file': return 'file_read';
    case 'write_file':
    case 'create_file': return 'file_write';
    case 'delete_file': return 'file_delete';
    case 'run_command':
    case 'terminal_run_command': return 'command_execute';
    case 'search_files':
    case 'glob': return 'file_search';
    case 'terminal_read_output': return 'terminal_read';
    case 'terminal_kill_process': return 'command_execute';
    default: return 'unknown';
  }
}

// Simple glob matching (supports ** and * patterns)
function matchGlob(filePath: string, pattern: string): boolean {
  // Convert glob to regex
  const regex = new RegExp(
    '^' + pattern.replace(/\./g, '\\.').replace(/\*\*/g, '___DOUBLESTAR___').replace(/\*/g, '[^/]*').replace(/___DOUBLESTAR___/g, '.*') + '$',
    'i'
  );
  return regex.test(filePath);
}

// ─── Tool execution (delegates to IPC) ──────────────
const getApi = () => {
  // @ts-ignore — window.api is injected by preload.ts at runtime
  return typeof window !== 'undefined' ? (window as any).api : null;
};

export async function executeTool(
  toolType: ToolType,
  input?: Record<string, unknown>
): Promise<{ success: boolean; result?: string; error?: string }> {
  const api = getApi();
  if (!api) return { success: false, error: 'IPC not available' };

  try {
    switch (toolType) {
      case 'read_file': {
        const filePath = input?.filePath as string;
        if (!filePath) return { success: false, error: 'Missing filePath parameter' };
        // Use IPC channel for file reading (avoids race conditions with node-pty cwd on Windows)
        const content = await api.fs.readFile(filePath);
        return { success: true, result: content || '' };
      }

      case 'write_file': {
        const filePath = input?.filePath as string;
        const content = input?.content as string;
        if (!filePath || content === undefined) return { success: false, error: 'Missing required parameters' };
        // Use IPC fs-write-file for atomic write (avoids node-pty cwd issues on Windows)
        await api.fs.writeFile(filePath, content);
        return { success: true, result: `Wrote ${filePath}` };
      }

      case 'create_file': {
        const filePath = input?.filePath as string;
        const content = input?.content as string;
        if (!filePath || content === undefined) return { success: false, error: 'Missing required parameters' };
        await api.fs.writeFile(filePath, content);
        return { success: true, result: `Created ${filePath}` };
      }

      case 'delete_file': {
        const filePath = input?.filePath as string;
        if (!filePath) return { success: false, error: 'Missing filePath parameter' };
        await api.fs.deleteFile(filePath);
        return { success: true, result: `Deleted ${filePath}` };
      }

      case 'run_command': {
        const command = input?.command as string;
        if (!command) return { success: false, error: 'Missing command parameter' };
        const output = await api.execCommand(command);
        return { success: true, result: output };
      }

      case 'search_files': {
        const searchPath = input?.path as string;
        const regex = input?.regex as string;
        if (!searchPath || !regex) return { success: false, error: 'Missing required parameters' };
        // Use IPC channel for file search (avoids execCommand on Windows where grep is unavailable)
        const filePattern = input?.filePattern as string | undefined;
        const output = await api.fs.searchFilesIPC(searchPath, regex, filePattern);
        return { success: true, result: output };
      }

      case 'glob': {
        const pattern = input?.pattern as string;
        if (!pattern) return { success: false, error: 'Missing pattern parameter' };
        // Use IPC channel for glob (avoids execCommand on Windows where find/grep unavailable)
        const baseDir = input?.path as string | undefined;
        const output = await api.fs.globIPC(pattern, baseDir);
        return { success: true, result: output };
      }

      // ─── Terminal tools (Phase D) ──────────────
      case 'terminal_run_command': {
        const command = input?.command as string;
        if (!command) return { success: false, error: 'Missing command parameter' };
        const timeoutMs = (input?.timeoutMs as number) || 30000;

        // Use the PTY terminal to run the command
        try {
          const sessionId = await api.terminal.spawn();
          let output = '';

          // Set up data listener
          const cleanup = api.terminal.onData((data: any) => {
            if (data.sessionId === sessionId) {
              output += data.data;
            }
          });

          // Write the command and a newline
          await api.terminal.write(sessionId, command + '\n');

          // Wait for timeout — do NOT cap at 10s (Fix #7: respect user's timeoutMs value)
          await new Promise(resolve => setTimeout(resolve, timeoutMs));

          cleanup();
          await api.terminal.kill(sessionId);

          return { success: true, result: output.trim() };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: `Terminal command failed: ${message}` };
        }
      }

      case 'terminal_read_output': {
        // Read output from the terminal buffer — this is handled by the XTermTerminal component's outputBufferRef
        // For now, use execCommand to read the last lines of a log file or return placeholder
        const lines = (input?.lines as number) || 50;
        // The actual implementation reads from the terminal session's buffer via IPC
        // This is a stub that will be wired up when the agent needs real-time monitoring
        return { success: true, result: `Terminal output buffer — last ${lines} lines available in Output tab` };
      }

      case 'terminal_kill_process': {
        // Kill all active terminal sessions
        try {
          await api.terminal.kill('all');
          return { success: true, result: 'All terminal processes killed' };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: `Failed to kill process: ${message}` };
        }
      }

      default:
        return { success: false, error: `Unknown tool type: ${toolType}` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ─── Generate system prompt section for tools ──────────────
export function generateToolPromptSection(): string {
  const defs = getAllToolDefinitions();
  let prompt = '## Available Tools\n\n';
  for (const def of defs) {
    prompt += `### ${def.name}\n${def.description}\n`;
    prompt += '**Parameters:**\n';
    for (const [paramName, paramDef] of Object.entries(def.parameters)) {
      const req = paramDef.required ? ' (required)' : '';
      prompt += `- \`${paramName}\` (${paramDef.type})${req}: ${paramDef.description || ''}\n`;
    }
    prompt += '\n';
  }
  return prompt;
}