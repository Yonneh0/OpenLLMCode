// OpenLLMCode — Local AI-powered coding assistant (Electron + React + TypeScript)
import React, { useState } from 'react';
import ApprovalGate from './components/ApprovalGate';
import CheckpointPanel from './components/CheckpointPanel';
import TaskPanel from './components/TaskPanel';
import McpPanel from './components/McpPanel';
import { MonacoEditor } from './components/MonacoEditor';
import { XTermTerminal } from './components/XTermTerminal';
import { ProjectWizard } from './components/ProjectWizard';
import { ChatPanel } from './components/ChatPanel';
import type { AgentMode, GenerationConfig } from './types';
import { TitleBar } from './components/TitleBar';
import { useFileTreeStore, FileItem } from './store/fileTreeStore';
import { GenerationParams } from './components/GenerationParams';

// Mode labels — single source of truth for mode toggle display
const MODE_LABELS: Record<AgentMode, string> = {
  plan: '📋 Plan',
  act: '⚡ Act',
  re: '🔍 R/E',
  audit: '🛡 Audit',
};

// File tree component — connected to store
function FileTree() {
  const files = useFileTreeStore((s) => s.files);
  const loading = useFileTreeStore((s) => s.loading);
  const expandedDirs = useFileTreeStore((s) => s.expandedDirs);
  const toggleDir = useFileTreeStore((s) => s.toggleDir);

  if (loading) {
    return <div className="text-xs text-[#6c7086]">Loading...</div>;
  }

  function renderTree(items: FileItem[], depth = 0) {
    return items.map((item) => (
      <li key={item.path} className="select-none">
        <div
          className={`flex items-center gap-1.5 pl-2 py-1 rounded hover:bg-[#313244]/60 cursor-pointer text-sm ${depth > 0 ? `ml-${(depth + 1) * 4}px` : ''}`}
          onClick={() => item.type === 'directory' && toggleDir(item.path)}
        >
          <span className="text-xs flex-shrink-0">
            {item.type === 'directory' ? (expandedDirs.has(item.path) ? '📂' : '📁') : fileIcon(item.name)}
          </span>
          <span className="truncate">{item.name}</span>
        </div>
        {item.type === 'directory' && expandedDirs.has(item.path) && item.children && (
          <ul>{renderTree(item.children, depth + 1)}</ul>
        )}
      </li>
    ));
  }

  return files.length > 0 ? (
    <ul className="space-y-0.5">{renderTree(files)}</ul>
  ) : (
    <div className="text-xs text-[#6c7086]">No project open</div>
  );
}

// Simple file icon based on extension
function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const icons: Record<string, string> = {
    ts: '🔷', tsx: '⚛️', js: '📜', jsx: '⚛️',
    py: '🐍', go: '🔵', rs: '🦀', cs: '💜', java: '☕',
    cpp: '⚙️', c: '⚙️', h: '⚙️', css: '🎨', html: '🌐',
    json: '📋', md: '📝', yaml: '⚙️', yml: '⚙️', sh: '💻', sql: '🗃️',
  };
  return icons[ext] ?? '📄';
}

// Default generation config — used as the source of truth for all panels
const DEFAULT_CONFIG: GenerationConfig = {
  temperature: 0.7,
  topP: 0.9,
  repetitionPenalty: 1.1,
  maxTokens: 4096,
  stopSequences: ['<|end_of_turn|>'],
};

export function App() {
  const [mode, setMode] = useState<AgentMode>('plan');
  const [showWizard, setShowWizard] = useState(false);
  const [generationConfig, setGenerationConfig] = useState<GenerationConfig>(DEFAULT_CONFIG);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#1e1e2e] text-white font-sans">
      {/* Title bar — mode buttons and model selector */}
      <TitleBar mode={mode} onModeChange={(m: AgentMode) => setMode(m)} />

      {/* Main content: sidebar | editor + chat */}
      <main className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside className="w-[240px] flex-shrink-0 bg-[#181825] border-r border-[#45475a] flex flex-col">
          {/* Project section */}
          <div className="px-3 py-3 border-b border-[#45475a]">
            <h2 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-1">Project</h2>
            <div className="flex gap-1.5 mt-2">
              <button className="flex-1 px-2 py-1.5 rounded bg-[#313244] hover:bg-[#45475a] text-sm transition" title="Change Root">📂</button>
              <button onClick={() => setShowWizard(true)} className="px-2 py-1.5 rounded bg-[#313244] hover:bg-[#45475a] transition" title="New Project">+</button>
            </div>
          </div>

          {/* File tree */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <h2 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-1 mt-1">Files</h2>
            <FileTree />
          </div>

          {/* Task Panel */}
          <TaskPanel />

          {/* MCP Servers — live from store state */}
          <McpPanel />
        </aside>

        {/* Editor area — MonacoEditor includes its own tab bar and status bar */}
        <main className="flex-1 flex flex-col min-h-0">
          <MonacoEditor />
        </main>

        {/* Chat panel — streaming, Markdown rendering, tool call cards */}
        <aside className="w-[420px] border-l border-[#45475a] flex-shrink-0 flex flex-col">
          {/* Generation Params Panel — controlled by parent state */}
          <GenerationParams config={generationConfig} onChange={setGenerationConfig} />

          {/* Checkpoint Panel — self-contained, handles IPC internally */}
          <CheckpointPanel />

          {/* Chat messages — generationConfig wired from parent state */}
          <ChatPanel generationConfig={generationConfig} />
        </aside>
      </main>

      {/* Terminal panel — real xterm.js with PTY streaming */}
      <XTermTerminal />

      {/* Approval Gate Modal */}
      <ApprovalGate />

      {/* Project Creation Wizard */}
      <ProjectWizard isOpen={showWizard} onClose={() => setShowWizard(false)} />
    </div>
  );
}