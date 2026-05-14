import React, { useState, useCallback } from 'react';
import ApprovalGate from './components/ApprovalGate';
import CheckpointPanel from './components/CheckpointPanel';
import TaskPanel from './components/TaskPanel';
import MonacoEditor from './components/MonacoEditor';
import XTermTerminal from './components/XTermTerminal';
import ProjectWizard from './components/ProjectWizard';
import { ChatPanel } from './components/ChatPanel';
import type { AgentMode } from './types';
import { TitleBar } from './components/TitleBar';
import { useFileTreeStore, FileItem } from './store/fileTreeStore';

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
  const rootPath = useFileTreeStore((s) => s.rootPath);
  const loading = useFileTreeStore((s) => s.loading);
  const expandedDirs = useFileTreeStore((s) => s.expandedDirs);
  const toggleDir = useFileTreeStore((s) => s.toggleDir);

  // Fix #4: File watcher is initialized from Sidebar's useEffect — no need to duplicate here (Issue #4)

  if (loading) {
    return <div className="text-xs text-[#6c7086]">Loading...</div>;
  }

  // Render tree recursively — use proper FileItem type from store
  function renderTree(items: FileItem[], depth: number = 0) {
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

// Simple file icon based on extension — Fix #15: Use local interface since module resolution fails in strict mode (Issue #15)
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

// Fix #15: No module-level store access — all components get their own hook call (Issue #15)
export function App() {
  const [mode, setMode] = useState<AgentMode>('plan');
  const [showWizard, setShowWizard] = useState(false);
  const { currentTask } = useTaskStore();

  // Checkpoint handlers via IPC
  const handleRestoreCheckpoint = useCallback(async (checkpointHash: string) => {
    if (!checkpointHash) return;
    try {
      await window.api.git.restoreToCheckpoint(checkpointHash);
    } catch {}
  }, []);

  const handleDeleteContextAfterCheckpoint = useCallback((checkpointId: string) => {
    useTaskStore.getState().deleteContextAfterCheckpoint(checkpointId);
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#1e1e2e] text-white font-sans">
      {/* Title bar — mode buttons and model selector live here only (via TitleBar component) */}
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

          {/* File tree — connected to store */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <h2 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-1 mt-1">Files</h2>
            <FileTree />
          </div>

          {/* Task Panel — Phase C */}
          <TaskPanel />

          {/* MCP Servers */}
          <div className="px-3 py-2 border-t border-[#45475a] space-y-1.5">
            <h2 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-1 mt-1">MCP</h2>
            <div className="flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100 cursor-pointer transition-opacity">✅ Git Server</div>
          </div>
        </aside>

        {/* Editor area — MonacoEditor includes its own tab bar and status bar */}
        <main className="flex-1 flex flex-col min-h-0">
          <MonacoEditor />
        </main>

        {/* Chat panel — uses Phase B ChatPanel with streaming, Markdown, etc. */}
        <aside className="w-[420px] border-l border-[#45475a] flex-shrink-0 flex flex-col">
          {/* Checkpoint Panel — Phase C (shown between header and ChatPanel) */}
          <CheckpointPanel
            onRestore={handleRestoreCheckpoint}
            onDeleteContextAfter={handleDeleteContextAfterCheckpoint}
          />

          {/* Chat messages — Phase B ChatPanel component handles its own session header + streaming UI */}
          <ChatPanel />
        </aside>
      </main>

      {/* Terminal panel — real xterm.js with PTY streaming */}
      <XTermTerminal />

      {/* Approval Gate Modal — Phase C (renders on top of everything) */}
      <ApprovalGate />

      {/* Project Creation Wizard — Phase D */}
      <ProjectWizard isOpen={showWizard} onClose={() => setShowWizard(false)} />
    </div>
  );
}

// Note: Window.api type is declared in src/vite-env.d.ts — no duplicate declaration needed here.
