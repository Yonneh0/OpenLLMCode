import React, { useEffect } from 'react';

// Note: Window.api type is declared in src/store/fileTreeStore.tsx — no duplicate declaration needed here.

export function App() {
  useEffect(() => {
    const initEngine = async () => {
      try { await window.api.engine.getConfig(); } catch {}
    };
    initEngine();
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#1e1e2e] text-white font-sans">
      {/* Title bar */}
      <header className="h-10 bg-[#313244] border-b border-[#45475a] flex items-center px-3 gap-3 flex-shrink-0 select-none">
        <div className="flex items-center gap-2 mr-2">
          <span className="text-lg">🚀</span>
          <span className="font-semibold text-sm">OpenLLMCode</span>
        </div>

        {/* Model selector */}
        <select defaultValue="ibm-grok4-1b.Q8_0" className="px-2 py-0.5 rounded bg-[#1e1e2e] border border-[#45475a] text-sm">
          <option value="ibm-grok4-1b.Q8_0">📦 ibm-grok4-1b.Q8_0 (CPU)</option>
          <option value="qwen3.6-35b.A3B">Qwen3.6-35B-A3B (CUDA)</option>
        </select>

        {/* Mode buttons */}
        <div className="flex items-center gap-1 ml-auto">
          <button className="px-2.5 py-0.5 rounded bg-[#45475a] text-xs font-semibold hover:bg-[#585b70] transition">📋 Plan</button>
          <button className="px-2.5 py-0.5 rounded bg-[#313244] text-xs hover:bg-[#45475a] transition">⚡ Act</button>
          <button className="px-2.5 py-0.5 rounded bg-[#313244] text-xs hover:bg-[#45475a] transition">🔍 R/E</button>
        </div>

        {/* Settings */}
        <button className="ml-2 p-1.5 rounded hover:bg-[#45475a] transition" title="Settings">⚙️</button>
      </header>

      {/* Main content: sidebar | editor + chat */}
      <main className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside className="w-[240px] flex-shrink-0 bg-[#181825] border-r border-[#45475a] flex flex-col">
          {/* Project section */}
          <div className="px-3 py-3 border-b border-[#45475a]">
            <h2 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-1">Project</h2>
            <div className="flex gap-1.5 mt-2">
              <button className="flex-1 px-2 py-1.5 rounded bg-[#313244] hover:bg-[#45475a] text-sm transition" title="Change Root">📂</button>
              <button className="px-2 py-1.5 rounded bg-[#313244] hover:bg-[#45475a] transition" title="New Project">+</button>
            </div>
          </div>

          {/* File tree */}
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

        {/* Editor area */}
        <main className="flex-1 flex flex-col min-h-0">
          {/* Tab bar */}
          <div className="bg-[#1e1e2e] border-b border-[#45475a] flex overflow-x-auto">
            <button className="px-4 py-2 bg-[#313244] text-sm border-r border-[#45475a] hover:bg-[#45475a]/60 transition relative">main.tsx</button>
            <button className="px-4 py-2 bg-[#181825]/60 text-sm border-r border-[#45475a] hover:bg-[#313244]/60 transition">types.ts</button>
          </div>

          {/* Monaco Editor placeholder */}
          <MonacoEditor />

          {/* Breadcrumbs + status */}
          <div className="px-4 py-1 bg-[#313244] border-t border-[#45475a] text-xs text-[#a6adc8] flex items-center justify-between">
            <span>src/ → App.tsx</span>
            <span className="ml-auto">Ln 1, Col 1 | UTF-8 | TypeScript</span>
          </div>
        </main>

        {/* Chat panel */}
        <aside className="w-[420px] border-l border-[#45475a] flex-shrink-0 flex flex-col">
          {/* Session header */}
          <div className="px-3 py-2 border-b border-[#45475a] bg-[#181825]/40 flex items-center gap-2">
            <span className="text-sm font-semibold text-[#a6adc8]">Chat</span>
            <select defaultValue={1} className="ml-auto bg-[#1e1e2e] border border-[#45475a] rounded px-2 py-1 text-xs">
              <option value={1}>Session 1</option>
            </select>
            <button className="px-2 py-0.5 bg-[#313244] hover:bg-[#45475a] rounded text-xs transition" title="New Session">+ New</button>
          </div>

          {/* Messages */}
          <ChatMessages />

          {/* Input area */}
          <InputArea />
        </aside>
      </main>

      {/* Terminal panel */}
      <TerminalPanel />
    </div>
  );
}

function MonacoEditor() {
  const codeLines = [
    '<span style="color:#cba6f7">import</span> React {"{ useState }"} <span style="color:#cba6f7">from</span> <span style="color:#a6e3a1">"react"</span>',
    '',
    '<span style="color:#cba6f7">export function</span> <span style="color:#89b4fa">App</span>() {',
    '  <span style="color:#cba6f7">const</span>[count, setCount] = useState(<span style="color:#fab387">0</span>)',
    '',
    '  <span style="color:#a6adc8">// OpenLLMCode — Local AI Coding Agent</span>',
    '}',
  ].join('\n');

  return (
    <div className="flex-1 bg-[#1e1e2e] p-4 overflow-auto font-mono text-sm leading-relaxed">
      <pre className="text-[#cdd6f4] whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: codeLines }} />
    </div>
  );
}

function ChatMessages() {
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      <div className="mb-2 mr-auto max-w-[90%] rounded-lg p-3 text-sm bg-indigo-600/20 border border-indigo-500/30">
        <span className="text-[#a6adc8] text-xs block mb-1">🧑 You</span>
        Fix the authentication bug in src/auth/middleware.ts
      </div>

      <div className="mb-2 ml-auto max-w-[90%] rounded-lg p-3 text-sm bg-[#1e1e2e]/50 border border-[#45475a]">
        <span className="text-[#a6adc8] text-xs block mb-1">🤖 Agent</span>
        I'll investigate the auth middleware. Let me read the file first to understand the current implementation.<br/>

        <div className="mt-2 rounded bg-[#181825]/60 border border-[#45475a] p-2 text-xs flex items-center gap-2">
          🔧 read_file — <span className="text-[#a6e3a1]">completed</span>
        </div>

        I found the issue. The JWT verification is using an expired secret key.<br/>

        <div className="mt-2 rounded bg-[#181825]/60 border border-[#45475a] p-2 text-xs flex items-center gap-2">
          🔧 run_command — <span className="text-[#f9e2af]">running</span>
        </div>
      </div>

      {/* Timestamp */}
      <div className="mt-1 text-xs text-[#a6adc8] opacity-50">
        {new Date(Date.now()).toLocaleTimeString()}
      </div>
    </div>
  );
}

function InputArea() {
  return (
    <div className="p-3 border-t border-[#45475a] bg-[#181825]/40">
      <textarea placeholder="💬 Type a message..." rows={3}
        className="w-full resize-none rounded bg-[#1e1e2e] border border-[#45475a] px-3 py-2 text-sm focus:outline-none focus:border-[#cba6f7]" />

      <div className="flex items-center gap-2 mt-2">
        <button className="px-2.5 py-1 rounded bg-[#313244] hover:bg-[#45475a] text-xs transition" title="Attach file">📎 Attach</button>

        {/* Generation parameters */}
        <select defaultValue="0.7" className="ml-auto bg-[#1e1e2e] border border-[#45475a] rounded px-2 py-1 text-xs">
          <option value="0.7">T: 0.7</option>
          <option value="0.9">T: 0.9</option>
        </select>

        {/* Send button */}
        <button className="px-4 py-1 rounded bg-[#cba6f7] hover:bg-[#b4befe] text-black font-semibold text-xs transition">▶ Send</button>
      </div>
    </div>
  );
}

function TerminalPanel() {
  return (
    <div className="h-48 flex-shrink-0 bg-[#1e1e2e] border-t border-[#45475a] flex flex-col">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[#45475a] bg-[#181825]/60">
        <button className="px-3 py-1 rounded bg-[#313244] text-xs font-semibold hover:bg-[#45475a]/60 transition">Terminal</button>
        <button className="px-3 py-1 rounded text-xs hover:bg-[#313244]/60 transition opacity-70 hover:opacity-100">Output</button>
        <button className="ml-auto px-2 py-0.5 rounded bg-[#1e1e2e] border border-[#45475a] text-xs opacity-70 hover:opacity-100 transition">⚙️</button>
      </div>

      <div className="flex-1 p-3 font-mono text-sm overflow-auto bg-[#181825]/40">
        <pre className="text-[#a6adc8] leading-relaxed">
          {'$ npm run dev\n'}
          <span className="text-[#cba6f7]">&gt; openllmcode@0.1.0 dev</span>{'\n'}
          {'>'} vite\n{'\n'}
          <span className="text-[#a6e3a1]">  VITE v5.x ready in ~280ms</span>{'\n'}
          <span className="text-[#a6adc8] opacity-70">  ➜ Local:   http://localhost:5173/\n</span>
          {'$ '}<span className="animate-pulse bg-[#cba6f7]/40 w-2 h-4 inline-block align-middle" />
        </pre>
      </div>

      <div className="h-1.5 cursor-row-resize hover:bg-[#cba6f7]/30 transition-colors" />
    </div>
  );
}