import React from 'react';

export function TerminalPanel() {
  return (
    <div className="h-48 flex-shrink-0 bg-[#1e1e2e] border-t border-[#45475a] flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[#45475a] bg-[#181825]/60">
        <button className="px-3 py-1 rounded bg-[#313244] text-xs font-semibold hover:bg-[#45475a]/60 transition">Terminal</button>
        <button className="px-3 py-1 rounded text-xs hover:bg-[#313244]/60 transition opacity-70 hover:opacity-100">Output</button>
        <button className="ml-auto px-2 py-0.5 rounded bg-[#1e1e2e] border border-[#45475a] text-xs opacity-70 hover:opacity-100 transition">⚙️</button>
      </div>

      {/* Terminal content */}
      <div className="flex-1 p-3 font-mono text-sm overflow-auto bg-[#181825]/40">
        <pre className="text-[#a6adc8] leading-relaxed">
          {`$ npm run dev\n`}
          <span className="text-[#cba6f7]">&gt; openllmcode@0.1.0 dev</span>{'\n'}
          {'>'} vite\n{'\n'}
          <span className="text-[#a6e3a1]">  VITE v5.x ready in ~280ms</span>{'\n'}
          <span className="text-[#a6adc8] opacity-70">  ➜ Local:   http://localhost:5173/\n</span>
          {'$ '}<span className="animate-pulse bg-[#cba6f7]/40 w-2 h-4 inline-block align-middle" />
        </pre>
      </div>

      {/* Resize handle */}
      <div className="h-1.5 cursor-row-resize hover:bg-[#cba6f7]/30 transition-colors" />
    </div>
  );
}