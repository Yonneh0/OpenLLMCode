// Generation Parameters Panel — full interactive controls (Phase B)
import React, { useState } from 'react';

export interface GenerationConfig {
  temperature: number;
  topP: number;
  repetitionPenalty: number;
  maxTokens: number;
  stopSequences: string[];
}

const DEFAULT_CONFIG: GenerationConfig = {
  temperature: 0.7,
  topP: 0.9,
  repetitionPenalty: 1.1,
  maxTokens: 4096,
  stopSequences: ['<|end_of_turn|>'],
};

interface Props {
  config: GenerationConfig;
  onChange: (config: GenerationConfig) => void;
  collapsed?: boolean;
}

export function GenerationParamsPanel({ config, onChange, collapsed = true }: Props) {
  const [isOpen, setIsOpen] = useState(!collapsed);

  const update = <K extends keyof GenerationConfig>(key: K, value: GenerationConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="px-3 py-1 bg-[#313244] hover:bg-[#45475a] rounded text-xs transition">
        ⚙ Generation Params
      </button>
    );
  }

  return (
    <div className="bg-[#1e1e2e] border-b border-[#45475a] px-3 py-3 space-y-3" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider">⚙ Generation Parameters</h3>
        <button onClick={() => setIsOpen(false)} className="px-2 py-0.5 rounded hover:bg-[#313244] transition text-xs">Collapse</button>
      </div>

      {/* Temperature */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-[#a6adc8]">Temperature</label>
          <input type="number" value={config.temperature} onChange={(e) => update('temperature', parseFloat(e.target.value) || 0)} min={0.1} max={2} step={0.1} className="w-14 bg-[#181825] border border-[#45475a] rounded px-2 py-1 text-xs text-right" />
        </div>
        <input type="range" min="0.1" max="2" step="0.1" value={config.temperature} onChange={(e) => update('temperature', parseFloat(e.target.value))} className="w-full accent-[#cba6f7]" />
      </div>

      {/* Top P */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-[#a6adc8]">Top P</label>
          <input type="number" value={config.topP} onChange={(e) => update('topP', parseFloat(e.target.value) || 0)} min={0.1} max={1} step={0.05} className="w-14 bg-[#181825] border border-[#45475a] rounded px-2 py-1 text-xs text-right" />
        </div>
        <input type="range" min="0.1" max="1" step="0.05" value={config.topP} onChange={(e) => update('topP', parseFloat(e.target.value))} className="w-full accent-[#cba6f7]" />
      </div>

      {/* Repetition Penalty */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-[#a6adc8]">Repetition Penalty</label>
          <input type="number" value={config.repetitionPenalty} onChange={(e) => update('repetitionPenalty', parseFloat(e.target.value) || 1)} min={1} max={2} step={0.05} className="w-14 bg-[#181825] border border-[#45475a] rounded px-2 py-1 text-xs text-right" />
        </div>
        <input type="range" min="1" max="2" step="0.05" value={config.repetitionPenalty} onChange={(e) => update('repetitionPenalty', parseFloat(e.target.value))} className="w-full accent-[#cba6f7]" />
      </div>

      {/* Max Tokens */}
      <div className="space-y-1">
        <label className="text-xs text-[#a6adc8]">Max Tokens</label>
        <input type="number" value={config.maxTokens} onChange={(e) => update('maxTokens', parseInt(e.target.value) || 4096)} min={64} max={32768} step={512} className="w-full bg-[#181825] border border-[#45475a] rounded px-3 py-1.5 text-xs" />
      </div>

      {/* Stop Sequences */}
      <div className="space-y-1">
        <label className="text-xs text-[#a6adc8]">Stop Sequences</label>
        {config.stopSequences.map((seq, i) => (
          <div key={i} className="flex items-center gap-2 mb-1">
            <input type="text" value={seq} onChange={(e) => { const newSeqs = [...config.stopSequences]; newSeqs[i] = e.target.value; update('stopSequences', newSeqs); }} className="flex-1 bg-[#181825] border border-[#45475a] rounded px-3 py-1.5 text-xs font-mono" />
            <button onClick={() => update('stopSequences', config.stopSequences.filter((_, j) => j !== i))} className="text-[#f38ba8] hover:text-pink-300 transition">✕</button>
          </div>
        ))}
        <button onClick={() => update('stopSequences', [...config.stopSequences, ''])} className="px-2 py-1 rounded bg-[#313244] hover:bg-[#45475a] text-xs transition">➕ Add</button>
      </div>

      {/* Reset button */}
      <button onClick={() => onChange(DEFAULT_CONFIG)} className="w-full px-3 py-1.5 rounded bg-[#313244] hover:bg-[#45475a] text-xs transition">🔄 Reset to Defaults</button>
    </div>
  );
}

export function getDefaults(): GenerationConfig { return { ...DEFAULT_CONFIG }; }