import React, { useState } from 'react';

export function TitleBar() {
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  return (
    <header className="h-10 bg-[#313244] border-b border-[#45475a] flex items-center px-3 gap-3 flex-shrink-0 select-none">
      <div className="flex items-center gap-2 mr-2">
        <span className="text-lg">🚀</span>
        <span className="font-semibold text-sm">OpenLLMCode</span>
      </div>

      {/* Model selector */}
      <div className="relative" style={{ position: 'relative' }}>
        <button onClick={() => setShowModelDropdown((v) => !v)} className="px-2 py-0.5 rounded bg-[#1e1e2e] border border-[#45475a] text-sm hover:bg-[#181825] transition">📦 ibm-grok4-1b.Q8_0 (CPU)</button>
        {showModelDropdown && <div className="absolute top-full left-0 mt-1 w-64 rounded bg-[#313244] border border-[#45475a] shadow-lg z-50">
          <div className="p-2"><h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-1.5 mt-1">Model Selector</h3><ul className="space-y-1">
            <li className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#45475a]/60 cursor-pointer text-sm transition"><span>✅ ibm-grok4-1b.Q8_0</span><span className="text-xs opacity-60">(CPU)</span></li>
            <li className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#45475a]/60 cursor-pointer text-sm transition"><span>⬜ Qwen3.6-35B-A3B</span><span className="text-xs opacity-60">(CUDA)</span></li>
          </ul><h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-1 mt-2">Engine Manager</h3><select defaultValue="cpu" className="w-full bg-[#1e1e2e] border border-[#45475a] rounded px-2 py-1 text-sm"><option value="cpu">CPU (AVX2)</option><option value="cuda">CUDA</option><option value="metal">Metal</option><option value="vulkan">Vulkan</option></select>
          </div>
        </div>}
      </div>

      <div className="flex-1" />

      {/* Mode buttons */}
      <div className="flex items-center gap-1">
        <button className="px-2.5 py-0.5 rounded bg-[#45475a] text-xs font-semibold hover:bg-[#585b70] transition">📋 Plan</button>
        <button className="px-2.5 py-0.5 rounded bg-[#313244] text-xs hover:bg-[#45475a] transition">⚡ Act</button>
        <button className="px-2.5 py-0.5 rounded bg-[#313244] text-xs hover:bg-[#45475a] transition">🔍 R/E</button>
      </div>

      <button className="ml-2 p-1.5 rounded hover:bg-[#45475a] transition" title="Settings">⚙️</button>
    </header>
  );
}