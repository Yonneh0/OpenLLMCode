import React from 'react';

export function Sidebar() {
  return (
    <aside className="w-60 flex-shrink-0 bg-[#181825] border-r border-[#45475a] flex flex-col">
      {/* Project Controls */}
      <div className="px-3 py-3 border-b border-[#45475a]">
        <h2 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-1">Project</h2>
        <div className="flex gap-1.5 mt-2">
          <button className="flex-1 px-2 py-1.5 rounded bg-[#313244] hover:bg-[#45475a] text-sm transition" title="Change Root Folder">📂</button>
          <button className="px-2 py-1.5 rounded bg-[#313244] hover:bg-[#45475a] transition" title="New Project">+</button>
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <h2 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-1 mt-1">Files</h2>
        <ul className="space-y-0.5">
          <li className="flex items-center gap-1.5 pl-2 py-1 rounded hover:bg-[#313244]/60 cursor-pointer text-sm">📁 src/</li>
          <li className="flex items-center gap-1.5 pl-8 py-1 rounded hover:bg-[#313244]/60 cursor-pointer text-sm">📄 main.tsx</li>
          <li className="flex items-center gap-1.5 pl-8 py-1 rounded hover:bg-[#313244]/60 cursor-pointer text-sm">📄 types.ts</li>
        </ul>
      </div>

      {/* MCP Servers */}
      <div className="px-3 py-2 border-t border-[#45475a] space-y-1.5">
        <h2 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-1 mt-1">MCP</h2>
        <div className="flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100 cursor-pointer transition-opacity">✅ Git Server</div>
      </div>
    </aside>
  );
}