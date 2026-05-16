import React, { useState } from 'react';

interface WebkitAppRegionStyle {
  webkitAppRegion?: 'drag' | 'no-drag';
}

declare module 'react' {
  interface CSSProperties extends WebkitAppRegionStyle {}
}

// Mode labels — single source of truth for mode toggle display
const MODE_LABELS: Record<string, string> = {
  plan: 'Plan',
  act: 'Act',
  re: 'R/E',
  audit: 'Audit',
};

interface TitleBarProps {
  mode: string;
  onModeChange?: (mode: string) => void;
}

export function TitleBar({ mode, onModeChange }: TitleBarProps) {
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [activeModel, setActiveModel] = useState('ibm-grok4-1b.Q8_0');
  const [selectedBackend, setSelectedBackend] = useState('cpu');

  return (
    <header className="h-[30px] bg-[#1E1E1E] border-b border-[#2B2B2B] flex items-center px-3 gap-3 flex-shrink-0 select-none" style={{ webkitAppRegion: 'drag' as const }}>
      {/* App title */}
      <div className="flex items-center gap-2 mr-2">
        <span className="font-semibold text-[11px] tracking-wide text-[#CCCCCC]">OpenLLMCode</span>
      </div>

      {/* Model selector — compact status bar style */}
      <div className="relative" style={{ webkitAppRegion: 'no-drag' as const }}>
        <button 
          onClick={() => setShowModelDropdown((v) => !v)} 
          className="px-1.5 py-0.5 rounded bg-[#2D2D2D] border border-[#3C3C3C] text-[11px] hover:bg-[#2A2D2E] transition cursor-pointer"
        >
          <span className="text-[#9DA5B4]">{activeModel}</span>
          <span className="text-[#858585] ml-0.5">{'·'}</span>
          <span className="text-[#9DA5B4]">{selectedBackend === 'cpu' ? 'CPU' : selectedBackend.toUpperCase()}</span>
        </button>
        {showModelDropdown && (
          <div className="absolute top-full left-0 mt-1 w-80 bg-[#252526] border border-[#404040] shadow-xl z-50" style={{ webkitAppRegion: 'no-drag' as const }}>
            <div className="p-3">
              <h3 className="text-xs font-semibold text-[#858585] uppercase tracking-wider mb-2 mt-1">Model Selector</h3>
              <ul className="space-y-0.5 mb-3">
                <li onClick={() => { setActiveModel('ibm-grok4-1b.Q8_0'); setShowModelDropdown(false); }} className="flex items-center justify-between px-2 py-1 rounded hover:bg-[#2A2D2E] cursor-pointer text-xs transition">
                  <span className="text-[#CCCCCC]">ibm-grok4-1b.Q8_0</span>
                  <span className="text-[#858585]">(CPU)</span>
                </li>
                <li onClick={() => { setActiveModel('Qwen3.6-35B-A3B'); setShowModelDropdown(false); }} className="flex items-center justify-between px-2 py-1 rounded hover:bg-[#2A2D2E] cursor-pointer text-xs transition">
                  <span className="text-[#9DA5B4]">Qwen3.6-35B-A3B</span>
                  <span className="text-[#858585]">(CUDA)</span>
                </li>
              </ul>
              <h3 className="text-xs font-semibold text-[#858585] uppercase tracking-wider mb-1">Engine Manager</h3>
              <select value={selectedBackend} onChange={(e) => setSelectedBackend(e.target.value)} className="w-full bg-[#1E1E1E] border border-[#3C3C3C] rounded px-2 py-1 text-xs cursor-pointer focus:border-[#007ACC]">
                <option value="cpu">CPU (AVX2)</option>
                <option value="cuda">CUDA</option>
                <option value="metal">Metal</option>
                <option value="vulkan">Vulkan</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Mode buttons — compact tab-style with active indicator */}
      <div className="flex items-center gap-0.5" style={{ webkitAppRegion: 'no-drag' as const }}>
        {(Object.keys(MODE_LABELS) as string[]).map((m) => (
          <button
            key={m}
            onClick={() => onModeChange?.(m)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
              mode === m ? 'bg-[#007ACC] hover:bg-[#1177CC] text-white' : 'bg-[#3C3C3C] hover:bg-[#404040] text-[#9DA5B4]'
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Settings */}
      <SettingsButton />
    </header>
  );
}

// Settings popup — Fix #19: Open settings panel when clicked (Issue #19)
function SettingsButton() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowSettings((v) => !v)}
        className="ml-2 p-1.5 rounded hover:bg-[#404040] transition"
        title="Settings"
      >
        ⚙️
      </button>
      {showSettings && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-[#252526] border border-[#404040] rounded-lg shadow-xl z-50" style={{ webkitAppRegion: 'no-drag' as const }}>
          <div className="p-3 space-y-3">
            <h3 className="text-xs font-semibold text-[#858585] uppercase tracking-wider">Settings</h3>

            {/* Generation Parameters */}
            <div className="space-y-2">
              <label className="text-xs text-[#858585]">Temperature</label>
              <input type="range" min="0.1" max="2" step="0.1" defaultValue="0.7" className="w-full accent-[#007ACC]" />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[#858585]">Top P</label>
              <input type="range" min="0.1" max="1" step="0.01" defaultValue="0.9" className="w-full accent-[#007ACC]" />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[#858585]">Max Tokens</label>
              <input type="number" defaultValue={4096} min={64} max={32768} step={64} className="w-full bg-[#1E1E1E] border border-[#3C3C3C] rounded px-2 py-1 text-xs focus:border-[#007ACC]" />
            </div>

            <button onClick={() => setShowSettings(false)} className="text-xs text-[#4EC9B0] hover:text-[#89DCEB]">Close</button>
          </div>
        </div>
      )}
    </>
  );
}
