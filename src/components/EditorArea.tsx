import React from 'react';

export function EditorArea() {
  const codeLines = [
    '<span style="color:#cba6f7">import</span> React {"{ useState }"} <span style="color:#cba6f7">from</span> <span style="color:#a6e3a1">"react"</span>',
    '',
    '<span style="color:#cba6f7">export function</span> <span style="color:#89b4fa">App</span>() {',
    '  <span style="color:#cba6f7">const</span>[count, setCount] = useState(<span style="color:#fab387">0</span>)',
    '',
    '  <span style="color:#a6adc8">// OpenLLMCode — Local AI Coding Agent</span>',
    '  <span style="color:#cba6f7">return</span>(<br/>',
    '    &lt;<span style="color:#f38ba8">div</span>&gt;',
    '      &lt;<span style="color:#f38ba8">h1</span>&gt;Hello, OpenLLMCode!',
    '        &lt;<span style="color:#f38ba8">button</span> onClick={() => <span style="color:#cba6f7">setCount</span>(c => c + <span style="color:#fab387">1</span>)&gt;',
    '          Click me ({count} clicks)',
    '        &lt;/<span style="color:#f38ba8">button</span>&gt;',
    '      &lt;/<span style="color:#f38ba8">h1</span>&gt;',
    '    &lt;/<span style="color:#f38ba8">div</span>&gt;',
    '  );',
    '}',
  ].join('\n');

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Tab bar */}
      <div className="bg-[#1e1e2e] border-b border-[#45475a] flex overflow-x-auto">
        <button className="px-4 py-2 bg-[#313244] text-sm border-r border-[#45475a] hover:bg-[#45475a]/60 transition relative">main.tsx</button>
        <button className="px-4 py-2 bg-[#181825]/60 text-sm border-r border-[#45475a] hover:bg-[#313244]/60 transition">types.ts</button>
      </div>

      {/* Monaco Editor placeholder */}
      <div className="flex-1 bg-[#1e1e2e] p-4 overflow-auto font-mono text-sm leading-relaxed">
        <pre className="text-[#cdd6f4] whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: codeLines }} />
      </div>

      {/* Breadcrumbs */}
      <div className="px-4 py-1 bg-[#313244] border-t border-[#45475a] text-xs text-[#a6adc8]">src/ → App.tsx</div>

      {/* Status bar */}
      <div className="px-4 py-1 bg-[#cba6f7]/20 border-t border-[#45475a] text-xs text-black font-semibold flex items-center justify-between">
        <span>🔥 CUDA — RTX 4090</span>
        <span>Ln 1, Col 1 | UTF-8 | TypeScript</span>
      </div>
    </div>
  );
}