// OpenLLMCode — Local AI-powered coding assistant (Electron + React + TypeScript)
// VS Code Dark+ aesthetic layout
import React, { useState } from 'react';
import ApprovalGate from './components/ApprovalGate';
import CheckpointPanel from './components/CheckpointPanel';
import TaskPanel from './components/TaskPanel';
import { McpPanel } from './components/McpPanel';
import VMPanel from './components/VMPanel';
import { PinguAvatar } from './components/PinguAvatar';
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

  // Activity bar active tab state
  const [activeActivityId, setActiveActivityId] = useState('explorer');
  const [sidebarActiveTab, setSidebarActiveTab] = useState<'project' | 'tasks' | 'mcp' | 'vm'>('project');

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
                <VMPanel />
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

            {/* Pingu Home area — bottom of sidebar */}
            <PinguHomePanel />
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

      {/* Pingu Avatar — System AI mascot in corner of UI (positioned via CSS absolute) */}
      <PinguAvatar position="bottom-right" />

      {/* Toast Notifications — for MCP reconnects, context compression, etc. */}
      <NotificationOverlay />

      {/* App Update Dialog — shows when a new version is available (P3-C) */}
      <AppUpdateDialog isOpen={appUpdateOpen} onClose={() => setAppUpdateOpen(false)} />
    </div>
  );
}

// P2-C: SkillPanel component — lazy-loaded from sidebar toggle in chat panel
const SkillPanel = React.lazy(() => import('./components/SkillPanel').then(m => ({ default: m.SkillPanel })));

// ─── Pingu Home Panel (bottom of ActivityBar + Sidebar) ──────────────

interface PinguHomePanelProps {
  showAbout?: boolean;
}

const PinguHomePanel: React.FC<PinguHomePanelProps> = ({ showAbout }) => {
  const [showAboutInternal, setShowAboutInternal] = React.useState(false);
  
  // Fun fact rotation
  const funFacts = [
    "🐧 Penguins propose to their mates with a smooth pebble!",
    "🐧 Emperor penguins can dive deeper than any other bird — over 500 meters!",
    "🐧 Penguin feathers are so dense they provide excellent insulation.",
    "🐧 King penguins have bright orange patches for social signaling.",
    "🐧 Penguins swim at speeds up to 12 miles per hour!",
  ];
  const [funFact, setFunFact] = React.useState(0);

  return (
    <div className="flex-shrink-0 border-t border-[#404040] bg-[#181818]/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#404040] bg-[#181818]/60">
        <span className="text-xs font-semibold text-[#858585] uppercase tracking-wider flex items-center gap-1.5">
          🐧 Pingu Home
        </span>
        <button 
          onClick={() => setShowAboutInternal(!showAboutInternal)}
          className="p-0.5 rounded hover:bg-[#404040] transition text-xs"
          title="About Pingu"
        >
          ⓘ
        </button>
      </div>

      {/* About section */}
      {showAboutInternal && (
        <div className="px-3 py-2 border-b border-[#404040]">
          <p className="text-xs text-[#858585] mb-1.5">Pingu — Your AI Companion</p>
          <button 
            onClick={() => setFunFact((f) => (f + 1) % funFacts.length)}
            className="w-full px-2 py-1 rounded bg-[#404040] hover:bg-[#505050] text-xs text-[#858585] transition"
          >
            {funFacts[funFact]}
          </button>
        </div>
      )}

      {/* Quick actions */}
      <div className="px-3 py-2 space-y-1">
        <h4 className="text-[10px] font-semibold text-[#858585] uppercase tracking-wider mb-1">Quick Actions</h4>
        
        <button 
          onClick={() => usePinguStore.getState().togglePanel('skills')}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#2A2D2E] transition"
        >
          <span className="text-sm">🛠️</span> Skills
        </button>
        
        <button 
          onClick={() => usePinguStore.getState().togglePanel('settings')}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#2A2D2E] transition"
        >
          <span className="text-sm">⚙️</span> Settings
        </button>
        
        <button 
          onClick={() => usePinguStore.getState().togglePanel('models')}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#2A2D2E] transition"
        >
          <span className="text-sm">📦</span> Models
        </button>
        
        <button 
          onClick={() => usePinguStore.getState().togglePanel('logs')}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#2A2D2E] transition"
        >
          <span className="text-sm">📋</span> Activity Log
        </button>
      </div>

      {/* System AI status */}
      <div className="px-3 py-2 border-t border-[#404040] bg-[#181818]/60">
        <h4 className="text-[10px] font-semibold text-[#858585] uppercase tracking-wider mb-1">System AI</h4>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full bg-[#007ACC]"></span>
          <span className="text-[#858585]">Engine Running</span>
        </div>
      </div>

      {/* Engine version info */}
      <div className="px-3 py-2 border-t border-[#404040] bg-[#181818]/60">
        <h4 className="text-[10px] font-semibold text-[#858585] uppercase tracking-wider mb-1">Engine</h4>
        <div className="space-y-0.5 text-xs">
          <span className="text-[#858585]">Version: v0.2.0</span>
          <br />
          <span className="text-[#858585]">Backend: CPU (AVX2)</span>
        </div>
      </div>

      {/* Pingu mascot footer */}
      <div className="px-3 py-2 border-t border-[#404040] flex items-center gap-2 bg-gradient-to-r from-[#1E1E1E]/80 to-transparent">
        <span className="text-lg">🐧</span>
        <span className="text-xs text-[#858585] italic">"Pingu is ready — click the icon to chat!"</span>
      </div>
    </div>
  );
};

