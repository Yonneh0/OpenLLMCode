// OpenLLMCode — Local AI-powered coding assistant (Electron + React + TypeScript)
// VS Code Dark+ aesthetic layout
import React, { useState } from 'react';
import ApprovalGate from './components/ApprovalGate';
import CheckpointPanel from './components/CheckpointPanel';
import TaskPanel from './components/TaskPanel';
import { McpPanel } from './components/McpPanel';
import VMPanel from './components/VMPanel';
import { PenguinHomeTile } from './components/PenguinHomeTile';
import { MonacoEditor } from './components/MonacoEditor';
import { XTermTerminal } from './components/XTermTerminal';
import { ProjectWizard } from './components/ProjectWizard';
import { ChatPanel } from './components/ChatPanel';
import type { AgentMode, GenerationConfig } from './types';
import { TitleBar } from './components/TitleBar';
import { ActivityBar } from './components/ActivityBar';
import { useFileTreeStore, FileItem } from './store/fileTreeStore';
import { GenerationParamsPanel as GenerationParams } from './components/GenerationParams';
import { NotificationOverlay } from './components/NotificationOverlay';
import { AppUpdateDialog, useAutoAppUpdateCheck } from './components/AppUpdateDialog';
import { usePinguStore } from './store/pinguStore';
import VMCreationWizard from './components/VMCreationWizard';
import SemanticSearchPanel from './components/SemanticSearchPanel';
import CIDCPanel from './components/CIDCPanel';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import APIDocBrowser from './components/APIDocBrowser';
import { NoModelDialog } from './components/NoModelDialog';

// Default generation config — used as the source of truth for all panels
const DEFAULT_CONFIG: GenerationConfig = {
  temperature: 0.7,
  topP: 0.9,
  repetitionPenalty: 1.1,
  maxTokens: 4096,
  stopSequences: ['<|end_of_turn|>'],
};

// File tree component — connected to store (VS Code Dark+ aesthetic)
function FileTree() {
  const files = useFileTreeStore((s) => s.files);
  const loading = useFileTreeStore((s) => s.loading);
  const expandedDirs = useFileTreeStore((s) => s.expandedDirs);
  const toggleDir = useFileTreeStore((s) => s.toggleDir);

  if (loading) {
    return <div className="text-[11px] text-[#858585]">Loading...</div>;
  }

  function renderTree(items: FileItem[], depth = 0) {
    const indentClass = depth > 0 ? `ml-${(depth + 1) * 4}px` : '';
    return items.map((item) => (
      <li key={item.path} className="select-none">
        <div
          className={`flex items-center gap-1.5 px-2 py-[3px] hover:bg-[#2A2D2E] cursor-pointer text-[11px] ${indentClass}`}
          onClick={() => item.type === 'directory' && toggleDir(item.path)}
        >
          <span className="text-[9px] flex-shrink-0 w-4 text-center">
            {item.type === 'directory' ? (expandedDirs.has(item.path) ? '\u{1F4C2}' : '\u{1F4C1}') : fileIcon(item.name)}
          </span>
          <span className="truncate text-[#CCCCCC]">{item.name}</span>
        </div>
        {item.type === 'directory' && expandedDirs.has(item.path) && item.children && (
          <ul>{renderTree(item.children, depth + 1)}</ul>
        )}
      </li>
    ));
  }

  return files.length > 0 ? (
    <ul className="space-y-px">{renderTree(files)}</ul>
  ) : (
    <div className="text-[11px] text-[#858585]">No project open</div>
  );
}

// Simple file icon based on extension — VS Code monospace prefix approach
function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const icons: Record<string, string> = {
    ts: 'TS', tsx: 'TS', js: 'JS', jsx: 'JS', py: 'PY', go: 'GO', rs: 'RS', css: 'CSS', html: 'HTML', json: '{}', md: 'MD', yaml: 'YM', yml: 'YM', sh: '#!', sql: 'SQL',
  };
  return icons[ext] ?? '\u{1F4C4}';
}

export function App() {
  const [mode, setMode] = useState<AgentMode>('plan');
  const [showWizard, setShowWizard] = useState(false);
  const [generationConfig, setGenerationConfig] = useState<GenerationConfig>(DEFAULT_CONFIG);
  
  // Auto-check for app updates every hour and show dialog when available
  const [appUpdateOpen, setAppUpdateOpen] = React.useState(false);
  useAutoAppUpdateCheck();
  
  // P2-C: Show skills panel in sidebar (toggle button)
  const [showSkillsPanel, setShowSkillsPanel] = useState(false);

  // QEMU VM Creation Wizard
  const [vmWizardOpen, setVmWizardOpen] = useState(false);

  // Activity bar active tab state
  const [activeActivityId, setActiveActivityId] = useState('explorer');
   const [sidebarActiveTab, setSidebarActiveTab] = useState<'project' | 'tasks' | 'mcp' | 'vm' | 'search' | 'cicd' | 'analytics' | 'apiDocs'>('project');

  // ─── Phase 1-2: Pingu state for dialogs ──────────────
  const hasGguf = usePinguStore(s => s.hasGguf);
  const isAwake = usePinguStore(s => s.isAwake);
  const isPinned = usePinguStore(s => s.isPinned);
  
  // Show NoModel dialog when Pingu has no GGUF and user clicks him (or on first launch)
  const [showNoModelDialog, setShowNoModelDialog] = useState(!hasGguf && !isAwake);

  // Listen for pingu-chat-open event from store
  React.useEffect(() => {
    if (!isPinned || isAwake || hasGguf) return;
    setShowNoModelDialog(true);
  }, [isPinned, isAwake, hasGguf]);

  // Reset no-model dialog when a GGUF is loaded or Pingu awakens
  React.useEffect(() => {
    if (hasGguf || isAwake) setShowNoModelDialog(false);
  }, [hasGguf, isAwake]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#1E1E1E] text-white font-sans">
      {/* Title bar — compact VS Code style */}
      <TitleBar mode={mode} onModeChange={(m: string) => setMode(m as AgentMode)} />

      {/* Main content area — split into rows vertically */}
      <div className="flex-1 flex min-h-0">
        {/* Activity Bar — far left icon-only bar (48px wide, full height of main area) */}
        <ActivityBar activeId={activeActivityId} onActiveChange={setActiveActivityId} />

        {/* Left column: Sidebar + Terminal row */}
        <div className="flex-1 flex min-h-0">
          {/* Sidebar — Explorer / File tree + Task/MCP panels (VS Code Dark+ aesthetic) */}
          <aside className="w-[260px] flex-shrink-0 bg-[#252526] border-r border-[#404040] flex flex-col">
            {/* Sidebar section header — Project/File tree or Tasks/MCP toggle */}
            <div className="border-b border-[#404040] px-3 py-2 flex items-center gap-1 bg-[#181818]">
              <button
                onClick={() => setSidebarActiveTab('project')}
                className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  sidebarActiveTab === 'project' ? 'text-white border-b border-[#007ACC]' : 'text-[#858585] hover:text-[#CCCCCC]'
                }`}
              >
                Project
              </button>
              <button
                onClick={() => setSidebarActiveTab('tasks')}
                className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  sidebarActiveTab === 'tasks' ? 'text-white border-b border-[#007ACC]' : 'text-[#858585] hover:text-[#CCCCCC]'
                }`}
              >
                Tasks
              </button>
              <button
                onClick={() => setSidebarActiveTab('mcp')}
                className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  sidebarActiveTab === 'mcp' ? 'text-white border-b border-[#007ACC]' : 'text-[#858585] hover:text-[#CCCCCC]'
                }`}
              >
                MCP
              </button>
              <button
                onClick={() => setSidebarActiveTab('vm')}
                className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  sidebarActiveTab === 'vm' ? 'text-white border-b border-[#007ACC]' : 'text-[#858585] hover:text-[#CCCCCC]'
                }`}
              >
                VMs
              </button>
              <button
                onClick={() => setSidebarActiveTab('search')}
                className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  sidebarActiveTab === 'search' ? 'text-white border-b border-[#007ACC]' : 'text-[#858585] hover:text-[#CCCCCC]'
                }`}
              >
                Search
              </button>
              <button
                onClick={() => setSidebarActiveTab('cicd')}
                className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  sidebarActiveTab === 'cicd' ? 'text-white border-b border-[#007ACC]' : 'text-[#858585] hover:text-[#CCCCCC]'
                }`}
              >
                CI/CD
              </button>
              <button
                onClick={() => setSidebarActiveTab('analytics')}
                className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  sidebarActiveTab === 'analytics' ? 'text-white border-b border-[#007ACC]' : 'text-[#858585] hover:text-[#CCCCCC]'
                }`}
              >
                Analytics
              </button>
              <button
                onClick={() => setSidebarActiveTab('apiDocs')}
                className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  sidebarActiveTab === 'apiDocs' ? 'text-white border-b border-[#007ACC]' : 'text-[#858585] hover:text-[#CCCCCC]'
                }`}
              >
                API Docs
              </button>
            </div>

            {/* Section header — Project section */}
            <div className="px-3 py-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#858585] hover:text-[#CCCCCC] cursor-pointer">
              <span>▼</span> OpenLLMCode
            </div>

            {/* Section header — Files */}
            <div className="px-3 py-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#858585] hover:text-[#CCCCCC] cursor-pointer">
              <span>▼</span> Project
            </div>

            {/* File tree */}
            {sidebarActiveTab === 'project' && (
              <div className="flex-1 overflow-y-auto px-2 pb-2">
                <FileTree />
              </div>
            )}

            {/* Task Panel */}
            {sidebarActiveTab === 'tasks' && (
              <div className="flex-1 overflow-y-auto border-t border-[#404040]">
                <TaskPanel />
              </div>
            )}

            {/* MCP Servers — live from store state */}
            {sidebarActiveTab === 'mcp' && (
              <div className="flex-1 overflow-y-auto border-t border-[#404040]">
                <McpPanel />
              </div>
            )}

            {/* QEMU VMs — live from store state */}
            {sidebarActiveTab === 'vm' && (
              <div className="flex-1 overflow-y-auto border-t border-[#404040]">
                <VMPanel onOpenVmWizard={() => setVmWizardOpen(true)} />
              </div>
            )}

            {/* Semantic Search — architecture-aware HNSW vector similarity search (Phase G.1-G.2) */}
            {sidebarActiveTab === 'search' && (
              <div className="flex-1 overflow-y-auto border-t border-[#404040]">
                <SemanticSearchPanel />
              </div>
            )}

            {/* CI/CD Integration — GitHub Actions generator, deploy, test, review (Phase J.1-J.3) */}
            {sidebarActiveTab === 'cicd' && (
              <div className="flex-1 overflow-y-auto border-t border-[#404040]">
                <CIDCPanel />
              </div>
            )}

             {/* Analytics Dashboard — productivity, AI usage, time tracking, goals (Phase K.1-K.3) */}
            {sidebarActiveTab === 'analytics' && (
              <div className="flex-1 overflow-y-auto border-t border-[#404040]">
                <AnalyticsDashboard />
              </div>
            )}

             {/* API Documentation Browser — browse and search API docs inline (Phase L.1-L.3) */}
            {sidebarActiveTab === 'apiDocs' && (
              <div className="flex-1 overflow-y-auto border-t border-[#404040]">
                <APIDocBrowser />
              </div>
            )}

            {/* Skills panel toggle button (P2-C) — only show when Project tab is active */}
            {sidebarActiveTab === 'project' && !showSkillsPanel && (
              <button 
                onClick={() => setShowSkillsPanel(true)}
                className="px-3 py-1.5 border-t border-[#404040] text-[11px] hover:bg-[#2A2D2E] transition flex items-center gap-1.5 text-[#858585]"
                title="Agent Skills"
              >
                <span className="text-xs">🛠️</span> <span>{showSkillsPanel ? 'Hide' : 'Show'} Skills</span>
              </button>
            )}

            {/* Project action buttons — only show when Project tab is active */}
            {sidebarActiveTab === 'project' && (
              <div className="px-3 py-2 border-t border-[#404040] flex gap-1.5">
                <button onClick={() => setShowWizard(true)} className="flex-1 px-1.5 py-1 rounded bg-[#3C3C3C] hover:bg-[#404040] text-[11px] transition cursor-pointer" title="New Project">+</button>
              </div>
            )}

            {/* Pingu Home area — bottom of sidebar (removed - Pingu now on home tile) */}
          </aside>

          {/* Editor area — MonacoEditor + Terminal stack vertically */}
          <main className="flex-1 flex flex-col min-h-0">
            {/* Top half: Monaco editor */}
            <MonacoEditor />
            
            {/* Bottom half: Terminal panel */}
            <XTermTerminal />
          </main>

          {/* Right panel — AI Chat (VS Code Dark+ aesthetic) */}
          <aside className="w-[420px] border-l border-[#404040] flex-shrink-0 flex flex-col">
            {/* Generation Params Panel — collapsed by default, controlled by parent state */}
            {generationConfig && (
              <GenerationParams config={generationConfig} onChange={setGenerationConfig} />
            )}

            {/* Checkpoint Panel */}
            <CheckpointPanel />

            {/* Skills Panel (P2-C) */}
            {showSkillsPanel && (
              <React.Suspense fallback={<div className="px-3 py-1.5 text-[11px] text-[#858585] opacity-50">Loading skills...</div>}>
                <SkillPanel />
              </React.Suspense>
            )}

            {/* Chat messages — generationConfig wired from parent state */}
            <ChatPanel generationConfig={generationConfig} />
          </aside>
        </div>
      </div>

      {/* Global status bar — VS Code blue (#007ACC) style at very bottom */}
      <div className="h-[22px] bg-[#007ACC] text-white flex items-center justify-between px-3 text-xs select-none">
        <div className="flex items-center gap-4">
          <span>⚡ Agent Ready</span>
          <span>●●●●○○○○○ ○○○○</span>
        </div>
        <div className="flex items-center gap-4">
          <span>UTF-8</span>
          <span>TypeScript</span>
          <span>Ln 58, Col 4</span>
        </div>
      </div>

      {/* Approval Gate Modal */}
      <ApprovalGate />

      {/* Project Creation Wizard */}
      <ProjectWizard isOpen={showWizard} onClose={() => setShowWizard(false)} />

      {/* QEMU VM Creation Wizard — opened from VMPanel "+ Create VM" button or empty state */}
      <VMCreationWizard isOpen={vmWizardOpen} onClose={() => setVmWizardOpen(false)} />

      {/* Pingu Avatar — System AI mascot in corner of UI (positioned via CSS absolute) - REMOVED, replaced by PenguinHomeTile */}

      {/* Toast Notifications — for MCP reconnects, context compression, etc. */}
      <NotificationOverlay />

      {/* App Update Dialog — shows when a new version is available (P3-C) */}
      <AppUpdateDialog isOpen={appUpdateOpen} onClose={() => setAppUpdateOpen(false)} />

      {/* Pingu Home Tile — bottom-left corner of the full UI window (Phase 1) */}
      <PenguinHomeTile />

      {/* No-Model Dialog — shown when no GGUF loaded and user clicks Pingu (Phase 2) */}
      {showNoModelDialog && !isAwake && !hasGguf && (
        <NoModelDialog onClose={() => setShowNoModelDialog(false)} />
      )}

      {/* Pinned Chat Dialog — shown when user clicks pinned Pingu to alter his behavior (Phase 5) */}
      {isPinned && <PinnedChatDialog />}
    </div>
  );
}

// P2-C: SkillPanel component — lazy-loaded from sidebar toggle in chat panel
const SkillPanel = React.lazy(() => import('./components/SkillPanel').then(m => ({ default: m.SkillPanel })));

// ─── Phase 5: Pinned Chat Dialog Component ──────────────

function PinnedChatDialog() {
  const unpinPingu = usePinguStore(s => s.unpinPingu);
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={unpinPingu} />
      
      {/* Dialog — pinned Pingu + chat interface */}
      <div className="relative rounded-xl shadow-2xl border border-[#45475a] w-[680px] max-h-[80vh] overflow-y-auto bg-[#1e1e2e]">
        {/* Header — pinned Pingu + title */}
        <div className="px-4 py-3 border-b border-[#45475a] flex items-center gap-3">
          {/* Pinned Pingu icon — staring at user */}
          <svg width="36" height="40" viewBox="0 0 36 40" className="flex-shrink-0">
            <ellipse cx="18" cy="37" rx="12" ry="3.5" fill="#F9E2AF"/>
            <circle cx="18" cy="24" r="13" fill="#8B5E3C"/>
            <circle cx="10" cy="18" r="6" fill="#F9E2AF" stroke="#5C2716" strokeWidth="2"/>
            <circle cx="26" cy="18" r="6" fill="#F9E2AF" stroke="#5C2716" strokeWidth="2"/>
            <circle cx="10.5" cy="17" r="2" fill="#5C2716"/>
            <circle cx="26.5" cy="17" r="2" fill="#5C2716"/>
            <ellipse cx="18" cy="22" rx="3" ry="2" fill="#D97B3A">
              <animate attributeName="ry" values="2;3;2" dur="1s" repeatCount="indefinite"/>
            </ellipse>
          </svg>
          
          {/* Title */}
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-[#cdd6f4]">Pingu is Pinned</h2>
            <p className="text-xs text-[#a6adc8] opacity-70">Click outside or hit Unpin to let him go.</p>
          </div>
          
          {/* Close button */}
          <button 
            onClick={unpinPingu}
            className="p-1 rounded hover:bg-[#313244] transition text-sm"
          >
            ✕
          </button>
        </div>
        
        {/* Content — intent/instructions + chat interface */}
        <div className="p-4 space-y-4">
          {/* Current instructions/purpose */}
          <div>
            <h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-2">Current Instructions</h3>
            <div className="rounded bg-green-900/15 border border-green-700/40 px-3 py-2 text-xs text-green-300">
              ✓ System AI is active and monitoring UI. Pingu will alert you if anything goes wrong.
            </div>
          </div>
          
          {/* Live inference statistics */}
          <div>
            <h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-2">Inference Stats</h3>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="rounded bg-[#1e1e2e]/60 border border-[#45475a] p-2">
                <span className="text-[#858585] opacity-50 block mb-0.5">Tokens/sec</span>
                <span className="text-[#cdd6f4] font-semibold">—</span>
              </div>
              <div className="rounded bg-[#1e1e2e]/60 border border-[#45475a] p-2">
                <span className="text-[#858585] opacity-50 block mb-0.5">Context</span>
                <span className="text-[#cdd6f4] font-semibold">— / —</span>
              </div>
              <div className="rounded bg-[#1e1e2e]/60 border border-[#45475a] p-2">
                <span className="text-[#858585] opacity-50 block mb-0.5">GPU</span>
                <span className="text-[#cdd6f4] font-semibold">—</span>
              </div>
              <div className="rounded bg-[#1e1e2e]/60 border border-[#45475a] p-2">
                <span className="text-[#858585] opacity-50 block mb-0.5">Memory</span>
                <span className="text-[#cdd6f4] font-semibold">— / —</span>
              </div>
            </div>
          </div>
          
          {/* Chat input */}
          <ChatInput />
        </div>
        
        {/* Footer — unpin button */}
        <div className="px-4 py-3 border-t border-[#45475a] flex justify-end">
          <button 
            onClick={unpinPingu}
            className="px-3 py-1.5 rounded text-xs bg-[#cba6f7]/20 hover:bg-[#cba6f7]/30 text-[#cba6f7] border border-[#cba6f7]/40 transition"
          >
            Unpin Pingu
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Phase 5: Chat Input Component ──────────────

function ChatInput() {
  const [message, setMessage] = useState('');
  
  // Send message to Pingu via SystemAI IPC
  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    
    try {
      await (window as any).electron?.sendSystemAIMessage(message);
      setMessage('');
    } catch {
      // Send failed
    }
  }
  
  return (
    <form onSubmit={sendMessage} className="flex gap-2">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Tell Pingu something..."
        className="flex-1 bg-[#1e1e2e] border border-[#45475a] rounded px-3 py-2 text-xs focus:outline-none focus:border-[#cba6f7]"
      />
      <button 
        type="submit"
        className="px-3 py-2 rounded bg-green-900/30 hover:bg-green-800/40 text-green-300 border border-green-700/40 text-xs font-semibold transition"
      >
        Send
      </button>
    </form>
  );
}

// ─── Phase 5: CSS Animations (inline styles) ──────────────

const styleTag = document.createElement('style');
styleTag.textContent = `
@keyframes pulse-slow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
.animate-pulse-slow { animation: pulse-slow 2s ease-in-out infinite; }
`;
document.head.appendChild(styleTag);