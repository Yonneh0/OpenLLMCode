// ─── Core Types ────────────────────────────────────────────────
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
}

export interface ToolCall {
  id: string;
  type: 'read_file' | 'write_file' | 'run_command' | 'create_file' | 'delete_file';
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