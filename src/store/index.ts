// Barrel export of all stores
export type { useEngineStore } from './engineStore';
export type { useChatStore } from './chatStore';
export { useFileTreeStore } from './fileTreeStore';
export type { FileItem } from './fileTreeStore';
export { useSessionStore } from './sessionStore';
export { useTaskStore } from './taskStore';
export { useEditorStore } from './editorStore';
export { useApprovalStore } from './approvalStore';

// Engine Logger Store — exported separately due to its special IPC wiring needs
export { 
  useEngineLoggerStore, 
  filterLogEntries,
  startPrimaryLogging,
  startSystemAILogging,
  stopPrimaryLogging,
  stopSystemAILogging,
  handleEngineDataEvent,
  registerEngineDataHandler,
} from './engineLoggerStore';

// MCP Store — exported for UI-side MCP server management and tool registration
export { useMCPStore } from './mcpStore';

// MCP tool execution helpers — wired via mcpManager → toolRegistry (Phase E)
export { getAllMCPToolNames, executeMCPToolCall } from './engineLoggerStore';

// Data persistence utilities (not a store so can be re-exported as values)
export * from './dataPersistence';
