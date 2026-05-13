// Enhanced chat panel — streaming, Markdown rendering, message actions (Phase B)
import React, { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../store/chatStore';
import type { GenerationConfig } from './GenerationParams';
import { getDefaults } from './GenerationParams';

interface ChatPanelProps {
  generationConfig?: GenerationConfig;
}

// Simple Markdown-to-HTML renderer for agent messages (no external dependency)
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent = '';
  let codeLang = '';

  function flushCodeBlock() {
    if (codeContent) {
      result.push(
        <div key={`cb-${result.length}`} className="rounded bg-[#181825]/60 border border-[#45475a] mt-2 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#1e1e2e] border-b border-[#45475a] text-xs">
            {codeLang ? (
              <span className="text-[#a6adc8]">{codeLang}</span>
            ) : (
              <span className="text-[#a6adc8]">Code</span>
            )}
            <button onClick={() => navigator.clipboard.writeText(codeContent.trim())} className="px-2 py-0.5 rounded bg-[#313244] hover:bg-[#45475a] transition text-xs">📋 Copy</button>
          </div>
          <pre className="p-3 font-mono text-sm overflow-x-auto max-h-64">{codeContent.trim()}</pre>
        </div>
      );
      codeContent = '';
      codeLang = '';
    }
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      flushCodeBlock();
      inCodeBlock = !inCodeBlock;
      codeLang = line.slice(3).trim() || '';
      continue;
    }
    if (inCodeBlock) {
      codeContent += line + '\n';
      continue;
    }

    // Bold: **text**
    const bolded = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic: *text*
    const italicized = bolded.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    // Inline code: `code`
    const withInlineCode = italicized.replace(/`([^`]+)`/g, '<code class="bg-[#313244] px-1.5 py-0.5 rounded text-xs font-mono">$1</code>');

    if (line.trim() === '') {
      result.push(<br key={`br-${result.length}`} />);
    } else if (line.startsWith('- ')) {
      result.push(
        <div key={`li-${result.length}`} className="flex items-start gap-2">
          <span>•</span>
          <span dangerouslySetInnerHTML={{ __html: withInlineCode }} />
        </div>,
        <br key={`br-li-${result.length}`} />
      );
    } else if (line.startsWith('# ')) {
      result.push(<h3 key={`h3-${result.length}`} className="text-sm font-bold mt-2 mb-1">{withInlineCode}</h3>);
    } else if (line.startsWith('## ')) {
      result.push(<h4 key={`h4-${result.length}`} className="text-xs font-semibold mt-2 mb-0.5 opacity-80">{withInlineCode}</h4>);
    } else {
      result.push(
        <div key={`p-${result.length}`} className={line.startsWith('1.') || line.startsWith('2.') ? '' : ''} dangerouslySetInnerHTML={{ __html: withInlineCode }} />
      );
    }
  }

  flushCodeBlock();
  return result;
}

export function ChatPanel({ generationConfig }: ChatPanelProps) {
  const messages = useChatStore((s) => s.messages);
  const isSending = useChatStore((s) => s.isSending);
  const addMessage = useChatStore((s) => s.addMessage);
  const setMessages = useChatStore((s) => s.setMessages);
  
  // Track input value for textarea (fix: was losing user text on render due to uncontrolled component)
  const [inputValue, setInputValue] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Simulate streaming response for user messages
  const handleSend = () => {
    const text = inputValue.trim();
    if (!text) return;

    addMessage('user', text);
    setInputValue('');

    // Start streaming response after delay
    setTimeout(() => {
      const streamTexts = [
        `I'll investigate this. Let me read the file first to understand the current implementation.\n\n🔧 Tool: \`read_file\` — <span class="text-[#a6e3a1]">completed</span>`,
        '\n\nI found an issue in the auth middleware.',
        `\n\nHere's my plan:\n\n1. Update the secret key in \`.env\`\n2. Modify the verification logic to handle rotation\n3. Add a fallback mechanism for graceful degradation`
      ];

      let msgIdx = 0;
      let charIdx = 0;

      const responseId = `msg-${Date.now()}`;
      setMessages([...messages, {
        id: responseId, role: 'assistant', content: '', timestamp: Date.now(), streaming: true,
        toolCalls: [{ id: 't1', type: 'read_file', status: 'completed' }],
        generationConfig: generationConfig || getDefaults()
      }]);

      const interval = setInterval(() => {
        if (msgIdx >= streamTexts.length) {
          clearInterval(interval);
          setMessages((prev) => prev.map(m => m.id === responseId ? { ...m, streaming: false } : m));
          return;
        }

        const fullText = streamTexts.slice(0, msgIdx + 1).join('');
        const currentChar = streamTexts[msgIdx][charIdx];
        if (currentChar) {
          setMessages((prev) => prev.map(m => m.id === responseId ? { ...m, content: fullText } : m));
          charIdx++;
        } else {
          msgIdx++;
          charIdx = 0;
        }
      }, 15);

      return () => clearInterval(interval);
    }, 600);
  };

  const currentConfig = generationConfig || getDefaults();

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="px-3 py-2 border-b border-[#45475a] bg-[#181825]/40 flex items-center gap-2">
        <span className="text-sm font-semibold text-[#a6adc8]">Chat</span>

        {/* Session dropdown */}
        <select defaultValue={messages.length > 0 ? 'session' : ''} className="ml-auto bg-[#1e1e2e] border border-[#45475a] rounded px-2 py-1 text-xs">
          <option value="session">Session 1</option>
        </select>

        {/* Mode buttons */}
        <div className="flex items-center gap-0.5 ml-2">
          <button className="px-2 py-0.5 rounded bg-[#45475a] text-xs font-semibold hover:bg-[#585b70] transition">📋 Plan</button>
          <button className="px-2 py-0.5 rounded bg-[#313244] text-xs hover:bg-[#45475a] transition">⚡ Act</button>
          <button className="px-2 py-0.5 rounded bg-[#313244] text-xs hover:bg-[#45475a] transition">🔍 R/E</button>
        </div>

        {/* System prompt button */}
        <button title="System Prompt" className="ml-1 px-2 py-0.5 rounded bg-[#313244] hover:bg-[#45475a] transition text-xs">⚙️</button>
        <button className="px-2 py-0.5 bg-[#313244] hover:bg-[#45475a] rounded text-xs transition" title="New Session">+ New</button>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 chat-scroll">
        {messages.map((msg) => (
          <ChatMessageItem key={msg.id} message={msg} />
        ))}

        {isSending && (
          <div className="ml-auto max-w-[90%] rounded-lg p-3 bg-[#1e1e2e]/50 border border-[#45475a]">
            <span className="text-[#a6adc8] text-xs block mb-1">🤖 Agent</span>
            <div className="flex items-center gap-1.5">
              <span className="animate-pulse-slow">●</span>
              <span className="animate-pulse-slow" style={{ animationDelay: '200ms' }}>●</span>
              <span className="animate-pulse-slow" style={{ animationDelay: '400ms' }}>●</span>
            </div>
          </div>
        )}
      </div>

      {/* Streaming indicator */}
      {messages.some(m => m.streaming) && (
        <div className="px-3 py-1 bg-[#181825]/60 border-t border-[#45475a] text-xs flex items-center gap-2">
          <span>⏳ Streaming response...</span>
          <button className="ml-auto px-2 py-0.5 rounded bg-[#f38ba8]/20 text-[#f38ba8] hover:bg-[#f38ba8]/40 transition" title="Cancel">✕ Cancel</button>
        </div>
      )}

      {/* Input field */}
      <div className="p-3 border-t border-[#45475a] bg-[#181825]/40">
        <textarea 
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="💬 Type a message..." 
          rows={3}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          className="w-full resize-none rounded bg-[#1e1e2e] border border-[#45475a] px-3 py-2 text-sm focus:outline-none focus:border-[#cba6f7]" />

        <div className="flex items-center gap-2 mt-2">
          <button 
            onClick={() => { /* TODO: open file picker */ }}
            className="px-2.5 py-1 rounded bg-[#313244] hover:bg-[#45475a] text-xs transition" 
            title="Attach file">📎 Attach</button>

          {/* Generation parameters - controlled select */}
          <div className="flex items-center gap-2 ml-auto text-xs">
            <select 
              value={currentConfig.temperature.toString()} 
              onChange={(e) => { /* update temperature via parent callback */ }}
              className="bg-[#1e1e2e] border border-[#45475a] rounded px-2 py-1"
            >
              <option value="0.3">T: 0.3</option>
              <option value="0.7">T: 0.7</option>
              <option value="0.9">T: 0.9</option>
              <option value="1.2">T: 1.2</option>
            </select>
            <span className="opacity-50">|</span>
            <button 
              onClick={() => { /* TODO: open full params panel modal */ }}
              className="px-2 py-1 rounded bg-[#313244] hover:bg-[#45475a] transition text-xs" 
              title="Open full params panel">⚙ Params</button>
          </div>

          {/* Send button (disabled while sending) */}
          <button 
            onClick={handleSend} 
            disabled={!inputValue.trim() || isSending}
            className={`px-4 py-1 rounded font-semibold text-xs transition ${
              inputValue.trim() && !isSending ? 'bg-[#cba6f7] hover:bg-[#b4befe] text-black' : 'bg-[#313244] text-[#a6adc8] opacity-50 cursor-not-allowed'
            }`}>
            {isSending ? '⏳ Sending...' : '▶ Send'}
          </button>
        </div>
      </div>

      {/* Token count footer */}
      <div className="px-3 py-1 bg-[#181825]/60 border-t border-[#45475a] text-xs text-[#a6adc8] opacity-50 flex items-center justify-between">
        <span>~{messages.reduce((sum, m) => sum + m.content.length, 0)} tokens</span>
        <span>{new Date().toLocaleTimeString()}</span>
      </div>

      {/* System Prompt Editor Modal */}
      <SystemPromptEditor />
    </div>
  );
}

function ChatMessageItem({ message }: { message: typeof useChatStore.getState().messages[0] }) {
  return (
    <div className={`mb-2 ${message.role === 'user' ? 'ml-auto max-w-[80%]' : 'mr-auto max-w-[90%]'} rounded-lg p-3 text-sm`}>
      {message.role === 'user' ? (
        <div className="msg-user rounded">
          <span className="text-[#a6adc8] text-xs block mb-1 flex items-center justify-between">
            🧑 You
            <div className="flex gap-1.5">
              <button title="Edit" className="opacity-0 hover:opacity-100 transition-opacity text-xs">✏️</button>
              <button title="Copy" className="opacity-0 hover:opacity-100 transition-opacity text-xs">📋</button>
            </div>
          </span>
          {message.content}
        </div>
      ) : (
        <div className="msg-assistant rounded">
          <span className="text-[#a6adc8] text-xs block mb-1 flex items-center justify-between">
            🤖 Agent
            <div className="flex gap-1.5">
              {message.streaming && <button title="Cancel" className="opacity-0 hover:opacity-100 transition-opacity text-xs text-[#f38ba8]">✕</button>}
              <button title="Regenerate" className="opacity-0 hover:opacity-100 transition-opacity text-xs">🔁</button>
              <button title="Copy" className="opacity-0 hover:opacity-100 transition-opacity text-xs">📋</button>
            </div>
          </span>

          {/* Render Markdown content */}
          <div dangerouslySetInnerHTML={{ __html: message.content.replace(/\n/g, '<br/>').replace(/`([^`]+)`/g, '<code class="bg-[#313244] px-1.5 py-0.5 rounded text-xs font-mono">$1</code>') }} />

          {/* Tool calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <ul className="mt-2 space-y-1">
              {message.toolCalls.map((tc) => (
                <li key={tc.id} className="rounded bg-[#181825]/60 border border-[#45475a] p-2 text-xs flex items-center gap-2 cursor-pointer hover:border-[#cba6f7]/40 transition">
                  🔧 {tc.type} — <span className={`${tc.status === 'completed' ? 'text-[#a6e3a1]' : tc.status === 'running' ? 'text-[#f9e2af] animate-pulse-slow' : 'text-[#f38ba8]'}`}>
                    {tc.status}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Generation config for this message */}
          {message.generationConfig && (
            <div className="mt-1 flex gap-2 text-xs opacity-50">
              <span>T: {message.generationConfig.temperature}</span>
              <span>TopP: {message.generationConfig.topP}</span>
              {!message.streaming && <span>{Math.round(message.content.length / 4)} tokens</span>}
            </div>
          )}
        </div>
      )}

      <div className="mt-1 text-xs text-[#a6adc8] opacity-50">
        {new Date(message.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}

// System Prompt Editor Modal
function SystemPromptEditor() {
  const [isOpen, setIsOpen] = React.useState(false);

  if (!isOpen) return null;

  const PRESETS = {
    coding: 'You are a coding assistant working within OpenLLMCode. Always read files before modifying them.',
    review: 'You are a code reviewer. Focus on quality, security, and best practices.',
    debugging: 'You are a debugging expert. Analyze errors systematically and suggest targeted fixes.',
    reverse_engineer: 'You are a reverse engineer. Deep analyze the existing code to understand architecture, data flow, and design patterns.',
    security_auditor: 'You are a security auditor. Systematically review code for vulnerabilities, anti-patterns, and best-practice violations.',
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsOpen(false)}>
      <div className="w-[640px] max-h-[80vh] rounded-lg border border-[#45475a] shadow-xl overflow-hidden flex flex-col">
        <div className="bg-[#1e1e2e] px-6 py-4 border-b border-[#45475a]">
          <h3 className="text-sm font-semibold text-[#cdd6f4]">📝 System Prompt Editor</h3>
        </div>

        {/* Presets */}
        <div className="px-6 py-3 border-b border-[#45475a] bg-[#181825]/60 flex gap-2">
          {Object.entries(PRESETS).map(([key, value]) => (
            <button key={key} onClick={() => { /* apply preset */ }} className="px-3 py-1 rounded text-xs bg-[#313244] hover:bg-[#45475a] transition">
              {Object.keys(PRESETS).indexOf(key) === 0 ? 'Coding' : Object.keys(PRESETS).indexOf(key) === 1 ? 'Review' : Object.keys(PRESETS).indexOf(key) === 2 ? 'Debug' : Object.keys(PRESETS).indexOf(key) === 3 ? 'R/E' : 'Audit'}
            </button>
          ))}
        </div>

        {/* Prompt text */}
        <textarea defaultValue={`You are OpenLLMCode, an AI coding assistant.\n\n[PROJECT CONTEXT]\nWorking directory: /path/to/project\nFile tree:\n  src/\n    app.ts\n    db.sql\n  package.json\n\n[AVAILABLE TOOLS]\n- read_file(path): Read a file's contents\n- write_file(path, content): Write to a file (requires approval)\n- run_command(command): Execute a shell command\n\n[BEHAVIORAL GUIDELINES]\n1. Always read a file before modifying it — never guess at its contents\n2. Show the diff of changes before requesting approval to write\n3. Explain what you're doing and why before each action\n4. Ask clarifying questions when the task is ambiguous\n5. Prefer small, incremental changes over large rewrites`} rows={16}
          className="flex-1 bg-[#1e1e2e] border-none px-6 py-3 text-sm font-mono focus:outline-none resize-none" />

        <div className="px-6 py-3 bg-[#181825]/60 border-t border-[#45475a] flex justify-end gap-2">
          <button onClick={() => setIsOpen(false)} className="px-3 py-1.5 rounded text-xs hover:bg-[#313244] transition">Cancel</button>
          <button onClick={() => setIsOpen(false)} className="px-3 py-1.5 rounded bg-[#cba6f7] hover:bg-[#b4befe] text-black font-semibold text-xs transition">Save & Apply</button>
        </div>
      </div>
    </div>
  );
}