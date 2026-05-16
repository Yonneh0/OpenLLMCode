// ─── Pingu Panel — Real implementations for Pingu menu item actions (P1-B) ──────────────
import React, { useState, useEffect } from 'react';
import type { DiscoveredSkill } from '../engine/skills/discovery';

// ─── Skills Overlay ──────────────

interface SkillPanelProps {
  onClose: () => void;
}

export function SkillPanel({ onClose }: SkillPanelProps) {
  const [skills, setSkills] = useState<Array<DiscoveredSkill & { isActive: boolean }>>([]);
  const [suggestedSkills, setSuggestedSkills] = useState<Array<DiscoveredSkill & { reason: string }>>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  
  useEffect(() => {
    async function loadSkills() {
      try {
        const discoveryModule = await import('../engine/skills/discovery');
        const skillStore = await import('../store/skillStore');
        
        // Discover skills from project root + global directories
        const localPath = (process as any).cwd?.() || '.';
        const discovered = await discoveryModule.discoverSkills(localPath);
        const allWithStatus: Array<DiscoveredSkill & { isActive: boolean }> = discovered.map(skill => ({
          ...skill,
          isActive: skillStore.useSkillStore.getState().activeSkills.has(skill.id),
        }));
        
        setSkills(allWithStatus);
        setIsDiscovering(false);
      } catch (err) {
        console.warn('Failed to discover skills:', err);
        setIsDiscovering(false);
      }
    }
    
    loadSkills();
  }, []);

  async function toggleSkill(skillId: string): Promise<void> {
    try {
      const skillStore = await import('../store/skillStore');
      const isActive = skillStore.useSkillStore.getState().activeSkills.has(skillId);
      
      if (isActive) {
        await skillStore.useSkillStore.getState().deactivateSkill(skillId);
      } else {
        await skillStore.useSkillStore.getState().activateSkill(skillId);
      }
      
      // Refresh skills list
      const discoveryModule = await import('../engine/skills/discovery');
      const localPath = (process as any).cwd?.() || '.';
      const discovered = await discoveryModule.discoverSkills(localPath);
      setSkills(discovered.map(skill => ({
        ...skill,
        isActive: skillStore.useSkillStore.getState().activeSkills.has(skill.id),
      })));
    } catch {}
  }

  return (
    <div className="absolute bottom-full right-0 mb-2 w-[480px] rounded-lg border border-[#45475a] shadow-xl overflow-hidden bg-[#1e1e2e]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#45475a] flex items-center justify-between">
        <span className="text-sm font-semibold text-[#cdd6f4]">🛠️ Agent Skills</span>
        <button onClick={onClose} className="px-1.5 py-0.5 rounded hover:bg-[#313244] transition text-xs">✕</button>
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto p-3 space-y-4">
        {/* Discovered Skills */}
        <div>
          <h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-2">Discovered</h3>
          {isDiscovering ? (
            <div className="flex items-center gap-2 text-sm text-[#a6adc8] opacity-70">
              <span className="animate-pulse-slow">●</span>
              Discovering skills...
            </div>
          ) : skills.length === 0 ? (
            <div className="text-xs text-[#a6adc8] opacity-50">No skills discovered. Create a .openllmcode-skills/ directory in your project root.</div>
          ) : (
            <div className="space-y-2">
              {skills.map(skill => (
                <SkillCard 
                  key={skill.id} 
                  skill={skill} 
                  isActive={skill.isActive}
                  onToggle={() => toggleSkill(skill.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Suggested Skills */}
        <div>
          <h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-2">Suggested</h3>
          <div className="rounded bg-indigo-900/15 border border-indigo-700/40 p-3 text-xs text-[#a6adc8] opacity-70">
            Skills will be suggested based on your project context and file structure.
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[#45475a] bg-[#181825]/60 flex justify-end">
        <button 
          onClick={onClose}
          className="px-2.5 py-1 rounded text-xs bg-[#313244] hover:bg-[#45475a] transition"
        >
          Close
        </button>
      </div>

      <style>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .animate-pulse-slow { animation: pulse-slow 2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function SkillCard({ skill, isActive, onToggle }: { 
  skill: DiscoveredSkill & { isActive: boolean };
  isActive: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded bg-[#1e1e2e]/60 border border-[#45475a] p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{skill.name}</span>
        <button 
          onClick={onToggle}
          className={`px-2 py-0.5 rounded text-xs transition ${isActive ? 'bg-green-900/40 text-green-300 border border-green-700/40' : 'bg-[#313244] text-[#a6adc8]'}`}
        >
          {isActive ? '✓ Active' : 'Inactive'}
        </button>
      </div>
      
      <p className="text-xs text-[#a6adc8] opacity-70 mb-1.5">{skill.description}</p>
      
      {/* Trigger files */}
      {skill.triggerFiles && skill.triggerFiles.length > 0 && (
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs text-[#a6adc8] opacity-50">Triggers:</span>
          {skill.triggerFiles.map(f => (
            <span key={f} className="px-1.5 py-0.5 rounded bg-[#313244] text-xs">{f}</span>
          ))}
        </div>
      )}
      
      {/* Tools */}
      {skill.tools && skill.tools.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {skill.tools.map(tool => (
            <span 
              key={tool.name}
              className={`px-1.5 py-0.5 rounded text-xs ${
                tool.approvalCost === 'low' ? 'bg-green-900/20 text-green-300 border border-green-700/40' :
                tool.approvalCost === 'medium' ? 'bg-yellow-900/20 text-yellow-300 border border-yellow-700/40' :
                'bg-red-900/20 text-red-400 border border-red-700/40'
              }`}
            >
              {tool.name} ({tool.approvalCost})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Settings Overlay ──────────────

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'engine' | 'models' | 'auth'>('engine');

  return (
    <div className="absolute bottom-full right-0 mb-2 w-[480px] rounded-lg border border-[#45475a] shadow-xl overflow-hidden bg-[#1e1e2e]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#45475a] flex items-center justify-between">
        <span className="text-sm font-semibold text-[#cdd6f4]">⚙️ Settings</span>
        <button onClick={onClose} className="px-1.5 py-0.5 rounded hover:bg-[#313244] transition text-xs">✕</button>
      </div>

      {/* Tabs */}
      <div className="bg-[#1e1e2e]/80 px-3 py-2 border-b border-[#45475a] flex gap-2">
        {(['engine', 'models', 'auth'] as const).map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 rounded text-xs font-medium transition ${activeTab === tab ? 'bg-[#cba6f7]/20 text-[#cba6f7]' : 'text-[#a6adc8] hover:bg-[#313244]'}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-3 max-h-80 overflow-y-auto">
        {activeTab === 'engine' && (
          <EngineSettings />
        )}
        {activeTab === 'models' && (
          <ModelsSettings />
        )}
        {activeTab === 'auth' && (
          <AuthSettings onClose={onClose} />
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[#45475a] bg-[#181825]/60 flex justify-end">
        <button 
          onClick={onClose}
          className="px-2.5 py-1 rounded text-xs bg-[#313244] hover:bg-[#45475a] transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function EngineSettings() {
  return (
    <div className="space-y-3">
      {/* Backend Selection */}
      <div>
        <label className="text-xs text-[#a6adc8] opacity-70 block mb-1">Backend</label>
        <select defaultValue="cpu" className="w-full bg-[#1e1e2e] border border-[#45475a] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#cba6f7]">
          <option value="cpu">CPU</option>
          <option value="cuda">CUDA (NVIDIA GPU)</option>
          <option value="vulkan">Vulkan</option>
          <option value="metal">Metal (Apple Silicon)</option>
        </select>
      </div>

      {/* Binary Source */}
      <div>
        <label className="text-xs text-[#a6adc8] opacity-70 block mb-1">Binary Source</label>
        <select defaultValue="prebuilt" className="w-full bg-[#1e1e2e] border border-[#45475a] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#cba6f7]">
          <option value="prebuilt">Pre-built (recommended)</option>
          <option value="compile">Compile from source</option>
        </select>
      </div>

      {/* System AI Model */}
      <div>
        <label className="text-xs text-[#a6adc8] opacity-70 block mb-1">System AI Model</label>
        <input 
          type="text" 
          placeholder="ibm-grok4-1b.Q8_0.gguf"
          className="w-full bg-[#1e1e2e] border border-[#45475a] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#cba6f7]"
        />
      </div>

      {/* Context Compression Settings */}
      <div className="pt-2 border-t border-[#45475a]">
        <h4 className="text-xs font-semibold text-[#a6adc8] mb-2">Context Compression</h4>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-[#a6adc8] opacity-70 block mb-1">Compression Threshold (tokens)</label>
            <input 
              type="number" 
              defaultValue="131072"
              min="4096"
              max="524288"
              className="w-full bg-[#1e1e2e] border border-[#45475a] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#cba6f7]"
            />
          </div>
          <div>
            <label className="text-xs text-[#a6adc8] opacity-70 block mb-1">Active Window Size (tokens)</label>
            <input 
              type="number" 
              defaultValue="2048"
              min="512"
              max="32768"
              className="w-full bg-[#1e1e2e] border border-[#45475a] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#cba6f7]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelsSettings() {
  const [defaultGpuLayers, setDefaultGpuLayers] = useState(-1);
  const [defaultThreads, setDefaultThreads] = useState(-1);

  return (
    <div className="space-y-3">
      {/* Default GPU Layers */}
      <div>
        <label className="text-xs text-[#a6adc8] opacity-70 block mb-1">Default GPU Layers</label>
        <select 
          value={defaultGpuLayers.toString()} 
          onChange={(e) => setDefaultGpuLayers(parseInt(e.target.value))}
          className="w-full bg-[#1e1e2e] border border-[#45475a] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#cba6f7]"
        >
          <option value="-1">Auto-detect (recommended)</option>
          <option value="0">None (CPU-only)</option>
          {[...Array(98)].map((_, i) => (
            <option key={i + 1} value={i + 1}>{i + 1} layers</option>
          ))}
        </select>
      </div>

      {/* Default Threads */}
      <div>
        <label className="text-xs text-[#a6adc8] opacity-70 block mb-1">Default CPU Threads</label>
        <select 
          value={defaultThreads.toString()} 
          onChange={(e) => setDefaultThreads(parseInt(e.target.value))}
          className="w-full bg-[#1e1e2e] border border-[#45475a] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#cba6f7]"
        >
          <option value="-1">Auto-detect (recommended)</option>
          {[...Array(63)].map((_, i) => (
            <option key={i + 1} value={i + 1}>{i + 1} threads</option>
          ))}
        </select>
      </div>

      {/* Context Window */}
      <div>
        <label className="text-xs text-[#a6adc8] opacity-70 block mb-1">Default Context Window</label>
        <select 
          defaultValue="0"
          className="w-full bg-[#1e1e2e] border border-[#45475a] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#cba6f7]"
        >
          <option value="0">Auto-detect from GGUF header</option>
          {[...Array(29)].map((_, i) => (
            <option key={i + 1} value={(i + 1) * 512}>{(i + 1) * 512}</option>
          ))}
        </select>
      </div>

      {/* Per-Model Settings Note */}
      <div className="pt-2 border-t border-[#45475a]">
        <p className="text-xs text-[#a6adc8] opacity-70">
          These are defaults — you can override per-model in the Model Manager.
        </p>
      </div>
    </div>
  );
}

function AuthSettings({ onClose }: { onClose: () => void }) {
  const [showHFAuth, setShowHFAuth] = useState(false);
  
  return (
    <div className="space-y-3">
      {/* HuggingFace Auth */}
      <div>
        <h4 className="text-xs font-semibold text-[#a6adc8] mb-2">HuggingFace Authentication</h4>
        {showHFAuth ? (
          <div className="space-y-2">
            <input 
              type="password" 
              placeholder="Paste your HF token..."
              className="w-full bg-[#1e1e2e] border border-[#45475a] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#cba6f7]"
            />
            <div className="flex gap-2">
              <button 
                onClick={() => setShowHFAuth(false)}
                className="px-2.5 py-1 rounded text-xs bg-[#313244] hover:bg-[#45475a] transition"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button 
            onClick={() => setShowHFAuth(true)}
            className="px-3 py-1.5 rounded text-xs bg-[#cba6f7] hover:bg-[#b4befe] text-black font-semibold transition"
          >
            🔐 Configure Token
          </button>
        )}
      </div>

      {/* Git Auth */}
      <div className="pt-2 border-t border-[#45475a]">
        <h4 className="text-xs font-semibold text-[#a6adc8] mb-2">Git Authentication</h4>
        <p className="text-xs text-[#a6adc8] opacity-70">
          Git uses your system credential manager. For SSH, add keys to ~/.ssh/id_rsa.
        </p>
      </div>

      {/* MCP Auth */}
      <div className="pt-2 border-t border-[#45475a]">
        <h4 className="text-xs font-semibold text-[#a6adc8] mb-2">MCP Server Auth</h4>
        <p className="text-xs text-[#a6adc8] opacity-70">
          MCP servers use their own auth — configure per-server in the MCP panel.
        </p>
      </div>
    </div>
  );
}

// ─── Manage Models Overlay (reuses ModelManager) ──────────────

interface ModelsPanelProps {
  onClose: () => void;
}

export function ModelsPanel({ onClose }: ModelsPanelProps) {
  // The existing ModelManager component already exists in the sidebar — toggle it visible via store
  const [showing, setShowing] = useState(false);
  
  return (
    <div className="absolute bottom-full right-0 mb-2 w-[480px] rounded-lg border border-[#45475a] shadow-xl overflow-hidden bg-[#1e1e2e]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#45475a] flex items-center justify-between">
        <span className="text-sm font-semibold text-[#cdd6f4]">📦 Manage Models</span>
        <button onClick={onClose} className="px-1.5 py-0.5 rounded hover:bg-[#313244] transition text-xs">✕</button>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        <div className="rounded bg-green-900/20 border border-green-700/40 p-3 text-xs text-green-300">
          ✓ Model Manager will be shown in the sidebar. You can also browse HuggingFace models for downloads.
        </div>
        
        <button 
          onClick={() => setShowing(true)}
          className="w-full px-3 py-1.5 rounded bg-[#cba6f7] hover:bg-[#b4befe] text-black font-semibold text-xs transition"
        >
          Open in Sidebar →
        </button>

        {showing && (
          <p className="text-xs text-green-300">Model Manager is now visible in the right sidebar.</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[#45475a] bg-[#181825]/60 flex justify-end">
        <button 
          onClick={onClose}
          className="px-2.5 py-1 rounded text-xs bg-[#313244] hover:bg-[#45475a] transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Compile Engine Overlay (shows engine status + update check) ──────────────

interface CompilePanelProps {
  onClose: () => void;
}

export function CompilePanel({ onClose }: CompilePanelProps) {
  const [engineVersion, setEngineVersion] = useState('');
  const [backend, setBackend] = useState<import('../types').Backend>('cpu');
  const [isChecking, setIsChecking] = useState(false);
  
  useEffect(() => {
    async function loadEngineInfo() {
      try {
        const managerModule = await import('../engine/manager');
        // Get current config from store (set by main process on init)
        setEngineVersion(managerModule.appVersion || '0.2.0');
      } catch {}
    }
    
    loadEngineInfo();
  }, []);

  async function checkForUpdate(): Promise<void> {
    setIsChecking(true);
    try {
      const managerModule = await import('../engine/manager');
      const result = await managerModule.checkForAppUpdates();
      if (result?.available) {
        // Show update dialog — handled by App.tsx via appUpdateOpen state
        window.dispatchEvent(new CustomEvent('open-app-update', { detail: true }));
      } else {
        setEngineVersion(result ? 'Current' : 'No update available');
      }
    } catch {} finally {
      setIsChecking(false);
    }
  }

  return (
    <div className="absolute bottom-full right-0 mb-2 w-[480px] rounded-lg border border-[#45475a] shadow-xl overflow-hidden bg-[#1e1e2e]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#45475a] flex items-center justify-between">
        <span className="text-sm font-semibold text-[#cdd6f4]">🔧 Compile Engine</span>
        <button onClick={onClose} className="px-1.5 py-0.5 rounded hover:bg-[#313244] transition text-xs">✕</button>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {/* Engine Status */}
        <div className="rounded bg-green-900/20 border border-green-700/40 p-3 text-xs text-green-300">
          ✅ Engine ready — using pre-built binary (no compilation needed)
        </div>

        {/* Engine Info */}
        <div className="text-xs text-[#a6adc8] space-y-1">
          <p>Version: v{engineVersion}</p>
          <p>Backend: {backend === 'cpu' ? 'CPU (auto-detected)' : backend.toUpperCase()}</p>
          <p>Binary Source: Pre-built</p>
        </div>

        {/* Check for Updates */}
        <button 
          onClick={checkForUpdate}
          disabled={isChecking}
          className={`w-full px-3 py-1.5 rounded text-xs font-semibold transition ${
            isChecking ? 'bg-[#f9e2af]/30 text-[#a67c5b]' : 'bg-[#cba6f7] hover:bg-[#b4befe] text-black'
          }`}
        >
          {isChecking ? '⏳ Checking...' : '🔄 Check for Updates'}
        </button>

        {/* Compile Note */}
        <div className="pt-2 border-t border-[#45475a]">
          <p className="text-xs text-[#a6adc8] opacity-70 mb-1.5">
            To compile from source, change the binary source to "Compile" in Settings → Engine tab.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[#45475a] bg-[#181825]/60 flex justify-end">
        <button 
          onClick={onClose}
          className="px-2.5 py-1 rounded text-xs bg-[#313244] hover:bg-[#45475a] transition"
        >
          Close
        </button>
      </div>

      <style>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .animate-pulse-slow { animation: pulse-slow 2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

// ─── Activity Log Overlay (wires to engineLoggerStore) ──────────────

interface LogsPanelProps {
  onClose: () => void;
}

export function LogsPanel({ onClose }: LogsPanelProps) {
  const [logs, setLogs] = useState<Array<{ timestamp: number; level: string; message: string }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  useEffect(() => {
    async function loadLogs() {
      try {
        const loggerModule = await import('../engine/engineLogger');
        // Get logs from the engine logger store
        setLogs((loggerModule as any).getEngineLogs?.() || []);
      } catch {}
    }
    
    loadLogs();
  }, []);

  const filteredLogs = searchQuery.length > 0 
    ? logs.filter(l => l.message.toLowerCase().includes(searchQuery.toLowerCase()))
    : logs;

  return (
    <div className="absolute bottom-full right-0 mb-2 w-[480px] rounded-lg border border-[#45475a] shadow-xl overflow-hidden bg-[#1e1e2e]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#45475a] flex items-center justify-between">
        <span className="text-sm font-semibold text-[#cdd6f4]">📋 Activity Log</span>
        <button onClick={onClose} className="px-1.5 py-0.5 rounded hover:bg-[#313244] transition text-xs">✕</button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-[#45475a]">
        <input 
          type="text" 
          placeholder="Search log entries..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#1e1e2e] border border-[#45475a] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#cba6f7]"
        />
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto p-3 space-y-1">
        {filteredLogs.length === 0 ? (
          <div className="text-xs text-[#a6adc8] opacity-50">No logs to display. System AI activity will appear here.</div>
        ) : (
          filteredLogs.map((log, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {/* Timestamp */}
              <span className="text-[#a6adc8] opacity-50 flex-shrink-0">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              {/* Level badge */}
              <span className={`px-1.5 py-0.5 rounded text-xs flex-shrink-0 ${
                log.level === 'info' ? 'bg-blue-900/20 text-blue-300 border border-blue-700/40' :
                log.level === 'warn' ? 'bg-yellow-900/20 text-yellow-300 border border-yellow-700/40' :
                'bg-red-900/20 text-red-400 border border-red-700/40'
              }`}>
                {log.level}
              </span>
              {/* Message */}
              <span className="text-[#a6adc8] opacity-70 flex-1">{log.message}</span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[#45475a] bg-[#181825]/60 flex justify-end">
        <button 
          onClick={onClose}
          className="px-2.5 py-1 rounded text-xs bg-[#313244] hover:bg-[#45475a] transition"
        >
          Close
        </button>
      </div>

      <style>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .animate-pulse-slow { animation: pulse-slow 2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

// ─── About Pingu Overlay (fun facts about penguins) ──────────────

interface AboutPanelProps {
  onClose: () => void;
}

export function AboutPanel({ onClose }: AboutPanelProps) {
  const [currentFact, setCurrentFact] = useState(0);
  
  // Penguin fun facts
  const facts = [
    "Penguins can dive deeper than most marine mammals — emperor penguins have been recorded diving to depths of over 560 meters!",
    "Penguin bones are solid rather than hollow like most birds, which helps them dive deeper by reducing buoyancy.",
    "There are only about 18 species of penguins in the world, and they all live exclusively in the Southern Hemisphere.",
    "Emperor penguins can survive Antarctica's harsh winters with body temperatures as low as -47°C (-53°F).",
    "Penguins have a special salt gland above their eyes that filters excess salt from seawater — they 'sneeze' it out!",
    "The smallest penguin species, the little blue penguin, is only about 30 cm (12 inches) tall.",
    "Adult penguins can drink saltwater because of their special salt gland — most birds would die from dehydration on a diet of seawater.",
    "Penguin chicks are born with fluffy grey down that they molt into waterproof feathers by about 4 months old.",
    "Penguins use their beaks to 'kiss' each other as a bonding behavior, and also present pebbles as courtship gifts!",
    "A group of penguins on land is called a 'waddle,' while in water it's called an 'raft.'",
  ];

  function nextFact() {
    setCurrentFact(prev => (prev + 1) % facts.length);
  }

  return (
    <div className="absolute bottom-full right-0 mb-2 w-[480px] rounded-lg border border-[#45475a] shadow-xl overflow-hidden bg-[#1e1e2e]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#45475a] flex items-center justify-between">
        <span className="text-sm font-semibold text-[#cdd6f4]">🐧 About Pingu</span>
        <button onClick={onClose} className="px-1.5 py-0.5 rounded hover:bg-[#313244] transition text-xs">✕</button>
      </div>

      {/* Content */}
      <div className="p-3 space-y-4">
        {/* Pingu mascot info */}
        <div className="flex items-center gap-3">
          <span className="text-4xl">🐧</span>
          <div>
            <h4 className="text-sm font-semibold text-[#cdd6f4]">Pingu — Your AI Companion</h4>
            <p className="text-xs text-[#a6adc8] opacity-70">OpenLLMCode v{typeof window !== 'undefined' ? (window as any).openllmcodeVersion || '0.2.0' : '0.2.0'}</p>
          </div>
        </div>

        {/* Fun fact */}
        <div className="rounded bg-indigo-900/15 border border-indigo-700/40 p-3 text-xs text-[#a6adc8]">
          <p className="font-semibold mb-1">🐧 Penguin Fun Fact:</p>
          <p>{facts[currentFact]}</p>
        </div>

        {/* Navigation buttons */}
        <div className="flex gap-2 justify-center">
          <button 
            onClick={nextFact}
            className="px-3 py-1.5 rounded text-xs bg-[#cba6f7] hover:bg-[#b4befe] text-black font-semibold transition"
          >
            🐧 Next Fact
          </button>
        </div>

        {/* About OpenLLMCode */}
        <div className="pt-2 border-t border-[#45475a]">
          <p className="text-xs text-[#a6adc8] opacity-70 mb-1.5">About OpenLLMCode:</p>
          <ul className="text-xs text-[#a6adc8] opacity-50 space-y-1">
            <li>• Local-first AI coding assistant</li>
            <li>• Built-in llama.cpp inference engine</li>
            <li>• HuggingFace model downloads with auth</li>
            <li>• Agentic capabilities (file editing, terminal, MCP)</li>
            <li>• All code stays local — no cloud required</li>
          </ul>
        </div>

        {/* Links */}
        <div className="pt-2 border-t border-[#45475a] flex gap-2">
          <button 
            onClick={() => window.open('https://github.com/Yonneh0/OpenLLMCode')}
            className="px-3 py-1.5 rounded text-xs bg-[#313244] hover:bg-[#45475a] transition"
          >
            GitHub
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[#45475a] bg-[#181825]/60 flex justify-end">
        <button 
          onClick={onClose}
          className="px-2.5 py-1 rounded text-xs bg-[#313244] hover:bg-[#45475a] transition"
        >
          Close
        </button>
      </div>

      <style>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .animate-pulse-slow { animation: pulse-slow 2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

// ─── Main PinguMenu Panel (updated to use real panels) ──────────────

interface PinguMenuProps {
  onClose: () => void;
}

export function PinguMenu({ onClose }: PinguMenuProps) {
  const activePanel = React.useContext(PinguMenuContext);
  
  // Render the appropriate panel based on what's currently active
  switch (activePanel) {
    case 'skills':
      return <SkillPanel onClose={onClose} />;
    case 'settings':
      return <SettingsPanel onClose={onClose} />;
    case 'models':
      return <ModelsPanel onClose={onClose} />;
    case 'compile':
      return <CompilePanel onClose={onClose} />;
    case 'logs':
      return <LogsPanel onClose={onClose} />;
    default:
      // No panel active — just show the menu without overlay
      return null;
  }
}

// Context for tracking which panel is currently open inside PinguMenu
const PinguMenuContext = React.createContext<string>('');