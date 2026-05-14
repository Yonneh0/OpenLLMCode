import React, { useState } from 'react';

// Mode labels — single source of truth for mode toggle display
const MODE_LABELS: Record<string, string> = {
  plan: '📋 Plan',
  act: '⚡ Act',
  re: '🔍 R/E',
  audit: '🛡 Audit',
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
    <header className="h-10 bg-[#313244] border-b border-[#45475a] flex items-center px-3 gap-3 flex-shrink-0 select-none">
      <div className="flex items-center gap-2 mr-2">
        <span className="text-lg">🚀</span>
        <span className="font-semibold text-sm">OpenLLMCode</span>
      </div>

      {/* Model selector */}
      <div className="relative" style={{ position: 'relative' }}>
        <button onClick={() => setShowModelDropdown((v) => !v)} className="px-2 py-0.5 rounded bg-[#1e1e2e] border border-[#45475a] text-sm hover:bg-[#181825] transition">📦 {activeModel} ({selectedBackend === 'cpu' ? 'CPU' : selectedBackend.toUpperCase()})</button>
        {showModelDropdown && <div className="absolute top-full left-0 mt-1 w-64 rounded bg-[#313244] border border-[#45475a] shadow-lg z-50">
          <div className="p-2"><h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-1.5 mt-1">Model Selector</h3><ul className="space-y-1">
            <li onClick={() => { setActiveModel('ibm-grok4-1b.Q8_0'); setShowModelDropdown(false); }} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#45475a]/60 cursor-pointer text-sm transition"><span>✅ ibm-grok4-1b.Q8_0</span><span className="text-xs opacity-60">(CPU)</span></li>
            <li onClick={() => { setActiveModel('Qwen3.6-35B-A3B'); setShowModelDropdown(false); }} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#45475a]/60 cursor-pointer text-sm transition"><span>⬜ Qwen3.6-35B-A3B</span><span className="text-xs opacity-60">(CUDA)</span></li>
          </ul><h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-1 mt-2">Engine Manager</h3><select value={selectedBackend} onChange={(e) => setSelectedBackend(e.target.value)} className="w-full bg-[#1e1e2e] border border-[#45475a] rounded px-2 py-1 text-sm"><option value="cpu">CPU (AVX2)</option><option value="cuda">CUDA</option><option value="metal">Metal</option><option value="vulkan">Vulkan</option></select>
          </div>
        </div>}
      </div>

      <div className="flex-1" />

      {/* Mode buttons — mode toggle lives here only */}
      <div className="flex items-center gap-1">
        {(Object.keys(MODE_LABELS) as string[]).map((m) => (
          <button
            key={m}
            onClick={() => onModeChange?.(m)}
            className={`px-2.5 py-0.5 rounded text-xs font-semibold transition ${
              mode === m ? 'bg-[#45475a] hover:bg-[#585b70]' : 'bg-[#313244] hover:bg-[#45475a]'
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Settings — wired to TitleBar's settings popup */}
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
        className="ml-2 p-1.5 rounded hover:bg-[#45475a] transition"
        title="Settings"
      >
        ⚙️
      </button>
      {showSettings && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-[#313244] border border-[#45475a] rounded-lg shadow-xl z-50">
          <div className="p-3 space-y-3">
            <h3 className="text-sm font-semibold text-[#a6adc8] uppercase tracking-wider">Settings</h3>

            {/* Generation Parameters */}
            <div className="space-y-2">
              <label className="text-xs text-[#6c7086]">Temperature</label>
              <input type="range" min="0.1" max="2" step="0.1" defaultValue="0.7" className="w-full accent-purple-500" />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[#6c7086]">Top P</label>
              <input type="range" min="0.1" max="1" step="0.01" defaultValue="0.9" className="w-full accent-purple-500" />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-[#6c7086]">Max Tokens</label>
              <input type="number" defaultValue={4096} min={64} max={32768} step={64} className="w-full bg-[#1e1e2e] border border-[#45475a] rounded px-2 py-1 text-sm" />
            </div>

            <button onClick={() => setShowSettings(false)} className="text-xs text-[#89b4fa] hover:text-[#89DCEB]">Close</button>
          </div>
        </div>
      )}
    </>
  );
}
