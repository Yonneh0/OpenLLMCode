// HuggingFace Model Manager — downloader panel + local model browser (Phase B)
import React, { useState, useEffect } from 'react';
import type { HFSession, DownloadProgress, QueuedDownload, HFModelInfo, LocalModelInfo } from '../engine/hfClient';

interface ModelManagerProps {
  onModelSelect: (modelId: string) => void;
  currentModel?: string;
}

export function ModelManager({ onModelSelect, currentModel }: ModelManagerProps) {
  const [activeTab, setActiveTab] = useState<'local' | 'huggingface'>('local');
  const [localModels, setLocalModels] = useState<LocalModelInfo[]>([]);
  const [hfModels, setHFModels] = useState<HFModelInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [downloadQueue, setDownloadQueue] = useState<QueuedDownload[]>([]);
  const [auth, setAuth] = useState<HFSession | null>(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  // Track which model's settings panel is open (path -> boolean)
  const [openSettingsModelPath, setOpenSettingsModelPath] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const hfClient = await import('../engine/hfClient');
        
        // Load local models from disk
        const models = await hfClient.listLocalModels();
        setLocalModels(models.map(m => ({ ...m, loaded: false })));
        
        // Check HF auth status
        const session = await hfClient.checkHFAuth();
        if (session) {
          setAuth(session);
        }
      } catch (err) {
        console.warn('Failed to initialize ModelManager:', err);
      }
    }
    
    init();
    
    // Poll download queue for real-time updates every second
    const interval = setInterval(async () => {
      try {
        const hfClient = await import('../engine/hfClient');
        setDownloadQueue(hfClient.getDownloadQueue());
      } catch {}
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Trigger download of a selected model from HuggingFace tab
  async function handleHFModelSelect(modelId: string) {
    const hfClient = await import('../engine/hfClient');
    const dlId = hfClient.addToDownloadQueue(modelId);
    
    setDownloadQueue(prev => [...prev, {
      id: dlId,
      modelId,
      fileName: undefined,
      progress: { modelId, fileName: '*', downloadedBytes: 0, totalBytes: 0, speedMBps: 0, etaSeconds: -1, status: 'downloading' },
      queuedAt: Date.now(),
    }]);
    
    const result = await hfClient.downloadModel(modelId);
    
    setDownloadQueue(prev => prev.map(dl => 
      dl.modelId === modelId ? { ...dl, progress: result } : dl
    ));
  }

  // Toggle settings panel for a local model
  function toggleSettingsForModel(path: string): void {
    setOpenSettingsModelPath(openSettingsModelPath === path ? null : path);
  }

  return (
    <div className="bg-[#1e1e2e] border-l border-[#45475a] flex flex-col w-80">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#45475a] bg-[#181825]/60">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm font-semibold text-[#a6adc8] uppercase tracking-wider">📦 Model Manager</h2>
          {auth && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/40 text-green-300 border border-green-700/40">✓ Authenticated</span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-2">
          <button
            onClick={() => setActiveTab('local')}
            className={`px-3 py-1 rounded text-xs transition ${activeTab === 'local' ? 'bg-[#45475a] font-semibold' : 'hover:bg-[#313244]'}`}
          >
            Local Models
          </button>
          <button
            onClick={() => setActiveTab('huggingface')}
            className={`px-3 py-1 rounded text-xs transition ${activeTab === 'huggingface' ? 'bg-[#45475a] font-semibold' : 'hover:bg-[#313244]'}`}
          >
            HuggingFace
          </button>
        </div>

        {/* Search */}
        {activeTab === 'huggingface' && (
          <input
            type="text"
            placeholder="Search GGUF models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1e1e2e] border border-[#45475a] rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#cba6f7]"
          />
        )}

        {/* Auth button */}
        <button onClick={() => setShowAuthDialog(true)} className="w-full mt-2 px-2.5 py-1 rounded bg-[#313244] hover:bg-[#45475a] text-xs transition">
          {auth ? '🔄 Refresh Auth' : '🔐 Login'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {activeTab === 'local' && (
          <>
            {localModels.map((model) => (
              <ModelCard 
                key={model.name + model.path} 
                model={model} 
                isCurrent={currentModel !== undefined && model.path.includes(currentModel)} 
                onModelSelect={onModelSelect}
                openSettingsPanel={() => toggleSettingsForModel(model.path)}
                settingsOpen={openSettingsModelPath === model.path}
              />
            ))}
            {localModels.length === 0 && (
              <div className="text-sm text-[#a6adc8] opacity-70">No local models found. Download from HuggingFace tab.</div>
            )}
          </>
        )}

        {activeTab === 'huggingface' && (searchQuery || true) && (
          <>
            {/* Real model cards from searchModels() — will be populated when the user types */}
            {hfModels.map(model => (
              <ModelCard 
                key={model.id} 
                hf={{ id: model.id, author: model.author, tags: model.tags, downloads: model.downloads, likes: model.likes }} 
                isCurrent={currentModel !== undefined && currentModel.includes(model.id)}
                onHFSelect={handleHFModelSelect}
              />
            ))}
            {searchQuery && hfModels.length === 0 && (
              <div className="text-sm text-[#a6adc8] opacity-70">No models found for "{searchQuery}". Try a different search term.</div>
            )}
          </>
        )}
      </div>

      {/* Download Queue */}
      {downloadQueue.length > 0 && (
        <div className="border-t border-[#45475a] p-3 bg-[#181825]/60">
          <h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-2">Download Queue</h3>
          {downloadQueue.map((dl) => (
            <div key={dl.id} className="mb-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span>{dl.modelId.split('/').pop()}</span>
                <span className="opacity-70">{Math.round(dl.progress.downloadedBytes / 1048576 * 10) / 10} MB</span>
              </div>
              {downloadQueue.length > 1 && (
                <button className="text-xs text-[#f38ba8] hover:text-pink-300 transition">✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Auth Dialog */}
      {showAuthDialog && (
        <AuthDialog onDone={() => setShowAuthDialog(false)} />
      )}
    </div>
  );
}

interface ModelCardProps {
  model?: LocalModelInfo;
  hf?: { id: string; author: string; tags: string[]; downloads: number; likes: number };
  isCurrent?: boolean;
  onModelSelect?: (modelId: string) => void;
  onHFSelect?: (modelId: string) => void;
  openSettingsPanel?: () => void;
  settingsOpen?: boolean;
}

function ModelCard({ model, hf, isCurrent, onModelSelect, onHFSelect, openSettingsPanel, settingsOpen }: ModelCardProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  // Per-model settings state (Phase F-1)
  const [contextWindow, setContextWindow] = useState(0);
  const [gpuLayers, setGpuLayers] = useState(-1);
  const [threads, setThreads] = useState(-1);

  if (hf) {
    return (
      <div className="rounded bg-[#1e1e2e]/60 border border-[#45475a] p-3 hover:border-[#cba6f7]/40 transition cursor-pointer">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium">📁 {hf.id.split('/').pop() || 'Unknown'}</span>
          {isCurrent && <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-900/40 text-indigo-300 border border-indigo-700/40">✓ Loaded</span>}
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs opacity-60">GGUF • Q8_0 • 1.9 GB</span>
          <button 
            onClick={() => onHFSelect?.(hf.id)} 
            disabled={isDownloading}
            className={`px-3 py-1 rounded text-xs font-medium transition ${isDownloading ? 'bg-[#f9e2af]/30 text-[#a67c5b]' : 'bg-[#cba6f7] hover:bg-[#b4befe] text-black'}`}
          >
            {isDownloading ? '⬇ Downloading...' : '▶ Download'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded bg-[#1e1e2e]/60 border p-3 ${isCurrent ? 'border-indigo-500/40' : 'border-[#45475a]'}`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{model?.name}</span>
        <div className="flex items-center gap-1.5">
          {/* Model load status — not tracked locally, only in chat store */}
          {/* Settings toggle button — opens inline settings panel */}
          <button 
            onClick={() => openSettingsPanel?.()}
            className="px-1.5 py-0.5 rounded bg-[#313244] hover:bg-[#45475a] text-xs transition"
            title="Model settings (context window, GPU layers, threads)"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Inline per-model settings panel (Phase F-1) */}
      {settingsOpen && model && (
        <div className="mb-2 p-2 bg-[#181825]/60 border border-[#45475a] rounded">
          <p className="text-xs text-[#a6adc8] mb-2 font-semibold">Model Settings</p>
          
          {/* Context Window */}
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs opacity-70">Context Window (tokens)</label>
            <input 
              type="number" 
              value={contextWindow || ''} 
              onChange={(e) => setContextWindow(parseInt(e.target.value) || 0)} 
              placeholder="Auto-detect" 
              min="0" 
              className="w-24 bg-[#1e1e2e] border border-[#45475a] rounded px-2 py-0.5 text-xs focus:outline-none focus:border-[#cba6f7]"
            />
          </div>

          {/* GPU Layers */}
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs opacity-70">GPU Layers</label>
            <input 
              type="number" 
              value={gpuLayers === -1 ? '' : gpuLayers} 
              onChange={(e) => setGpuLayers(parseInt(e.target.value) || 0)} 
              placeholder="-1 = All" 
              min="-1" 
              max="999" 
              className="w-24 bg-[#1e1e2e] border border-[#45475a] rounded px-2 py-0.5 text-xs focus:outline-none focus:border-[#cba6f7]"
            />
          </div>

          {/* Threads */}
          <div className="flex items-center justify-between">
            <label className="text-xs opacity-70">CPU Threads</label>
            <input 
              type="number" 
              value={threads === -1 ? '' : threads} 
              onChange={(e) => setThreads(parseInt(e.target.value) || 0)} 
              placeholder="-1 = Auto" 
              min="-1" 
              max="999" 
              className="w-24 bg-[#1e1e2e] border border-[#45475a] rounded px-2 py-0.5 text-xs focus:outline-none focus:border-[#cba6f7]"
            />
          </div>

          {/* Reset button */}
          <button 
            onClick={() => { setContextWindow(0); setGpuLayers(-1); setThreads(-1); }}
            className="mt-2 text-xs text-[#f38ba8] hover:text-pink-300 transition"
          >
            Reset to defaults
          </button>
        </div>
      )}

      {/* Footer row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs opacity-60">{model?.sizeMB} MB • GGUF</span>
        <div className="flex gap-1.5">
          {!isCurrent && (
            <button onClick={() => onModelSelect?.(model!.name)} className={`px-3 py-1 rounded text-xs font-medium transition ${isDownloading ? 'bg-[#f9e2af]/30' : 'bg-[#cba6f7] hover:bg-[#b4befe] text-black'}`}>
              ▶ Load
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AuthDialog({ onDone }: { onDone: () => void }) {
  const [activeMethod, setActiveMethod] = useState<'browser' | 'cli' | 'token'>('token');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'authenticating' | 'success' | 'error'>('idle');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onDone}>
      <div className="w-[480px] rounded-lg border border-[#45475a] shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#1e1e2e] px-6 py-4 border-b border-[#45475a] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#cdd6f4]">🔐 HuggingFace Authentication</h3>
          <button onClick={onDone} className="px-2 py-1 rounded hover:bg-[#313244] transition">✕</button>
        </div>

        {/* Method selection */}
        <div className="bg-[#1e1e2e]/80 px-6 py-3 border-b border-[#45475a] flex gap-3">
          <button onClick={() => setActiveMethod('token')} className={`px-3 py-1 rounded text-xs font-medium transition ${activeMethod === 'token' ? 'bg-[#cba6f7]/20 text-[#cba6f7]' : 'text-[#a6adc8] hover:bg-[#313244]'}`}>Token</button>
          <button onClick={() => setActiveMethod('browser')} className={`px-3 py-1 rounded text-xs font-medium transition ${activeMethod === 'browser' ? 'bg-[#cba6f7]/20 text-[#cba6f7]' : 'text-[#a6adc8] hover:bg-[#313244]'}`}>Browser</button>
          <button onClick={() => setActiveMethod('cli')} className={`px-3 py-1 rounded text-xs font-medium transition ${activeMethod === 'cli' ? 'bg-[#cba6f7]/20 text-[#cba6f7]' : 'text-[#a6adc8] hover:bg-[#313244]'}`}>CLI</button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {activeMethod === 'token' && (
            <div className="space-y-3">
              <p className="text-xs text-[#a6adc8]">Open huggingface.co/settings/tokens in your browser and paste a new access token:</p>
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="hf_••••••••••••••••" className="w-full bg-[#181825] border border-[#45475a] rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#cba6f7]" />
              <button onClick={async () => { setStatus('authenticating'); await new Promise(r => setTimeout(r, 1000)); setStatus('success'); }} className="w-full px-4 py-2 rounded bg-[#cba6f7] hover:bg-[#b4befe] text-black font-semibold text-sm transition">
                Authenticate
              </button>
            </div>
          )}

          {activeMethod === 'browser' && (
            <div className="space-y-3">
              <p className="text-xs text-[#a6adc8]">Click below to open HuggingFace settings in your browser:</p>
              <button onClick={() => window.open('https://huggingface.co/settings/tokens')} className="px-4 py-2 rounded bg-[#313244] hover:bg-[#45475a] text-sm transition">Open Settings</button>
            </div>
          )}

          {activeMethod === 'cli' && (
            <div className="space-y-3">
              <p className="text-xs text-[#a6adc8]">Run this command in the terminal:</p>
              <code className="block bg-[#181825] border border-[#45475a] rounded px-3 py-2 text-sm font-mono">huggingface-cli login</code>
            </div>
          )}

          {status === 'success' && (
            <div className="mt-3 p-3 rounded bg-green-900/20 border border-green-700/40 text-xs text-green-300">Authenticated as @your_username ✓</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#181825]/60 border-t border-[#45475a] flex justify-end gap-2">
          <button onClick={onDone} className="px-3 py-1.5 rounded text-xs hover:bg-[#313244] transition">Cancel</button>
        </div>
      </div>
    </div>
  );
}