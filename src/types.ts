// ─── Core Types ────────────────────────────────────────────────
export type AgentMode = 'plan' | 'act' | 're' | 'audit';

export interface GenerationConfig {
  temperature: number;
  topP: number;
  repetitionPenalty: number;
  maxTokens: number;
  stopSequences: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  streaming?: boolean;
  generationConfig?: GenerationConfig;
  mode?: AgentMode; // which agent mode produced this message
}

export type ToolType =
  | 'read_file'
  | 'write_file'
  | 'create_file'
  | 'delete_file'
  | 'run_command'
  | 'search_files'
  | 'glob';

export interface ToolCall {
  id: string;
  type: ToolType;
  input?: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
}

export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  mode?: AgentMode; // current mode for this session
}

// ─── Task Types ────────────────────────────────────────────────
export type TaskStatus = 'planning' | 'executing' | 'completed' | 'failed';

export interface PlanStep {
  id: string;
  description: string;
  toolsRequired: ToolType[];
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'skipped';
}

export interface Checkpoint {
  id: string;
  label: string;                // e.g., "After JWT fix"
  gitCommitHash: string;        // tied to a specific commit
  messageIndex: number;         // corresponding chat message index
  fileChanges: string[];        // list of affected files
}

export interface CompressedEntry {
  summary: string;              // AI-generated summary of earlier conversation
  keyDecisions: string[];       // important decisions made
  filesModified: string[];      // what was changed
  timestamp: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;           // User's original request
  status: TaskStatus;
  plan?: PlanStep[];
  stepsCompleted: number;
  compressedHistory: CompressedEntry[];
  checkpoints: Checkpoint[];
  completionSummary?: string;   // AI-generated summary on task completion
  createdAt: number;
  updatedAt: number;
}

// ─── Approval Types ──────────────────────────────────────────────
export type ApprovalStatus = 'pending' | 'approved' | 'denied';

export interface ApprovalRequest {
  id: string;
  toolType: ToolType;
  input?: Record<string, unknown>;
  diff?: string;                 // unified diff for file modifications
  filePath?: string;             // path being modified (for context)
  status: ApprovalStatus;
  deniedReason?: string;         // if denied with reason
}

// ─── Tool Registry Types ──────────────────────────────────────
export interface ToolDefinition {
  name: ToolType;
  description: string;
  parameters: Record<string, { type: string; required: boolean; description?: string }>;
  defaultApproval: 'auto' | 'require'; // auto = no approval needed, require = always prompt
}

export interface ApprovalRuleCategory {
  default: 'allow' | 'deny' | 'require_approval';
  allow_patterns?: Array<{ pattern: string; reason: string }>;
  deny_patterns?: Array<{ pattern: string; reason: string }>;
}

export interface ApprovalRulesConfig {
  categories: Record<string, ApprovalRuleCategory>;
}

// ─── Engine Types ──────────────────────────────────────────────
export type Backend = 'cpu' | 'cuda' | 'metal' | 'vulkan' | 'rocm';

export interface EngineConfig {
  backend: Backend;
  binarySource: 'prebuilt' | 'compile';
  selectedModel: string;
  systemAIModel: string;
}

// ─── Model Types ──────────────────────────────────────────────
export interface ModelInfo {
  id: string;
  name: string;
  sizeMB: number;
  path: string;
  loaded: boolean;
  backend: Backend;
}
