// Enhanced chat panel — streaming, Markdown rendering, message actions (Phase B)
import React, { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../store/chatStore';
import type { GenerationConfig, ChatMessage, CompressedEntry } from '../types';
import { getDefaults } from './GenerationParams';
import { compressConversation, shouldCompress } from '../engine/contextCompression';

// Track tokens/second speed for streaming display
let tokenSpeedTimer: ReturnType<typeof setTimeout> | null = null;
let lastTokenTimestamp = 0;

interface ChatPanelProps {
  generationConfig?: GenerationConfig;
  onConfigChange?: (config: GenerationConfig) => void;
}

// Fix #9: Simple HTML escaper — prevents XSS from user-generated content
function escapeHtml(text: string): string {
  const div = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (div) {
    div.textContent = text;
    return div.innerHTML;
  }
  // Server-side fallback — manual escaping
  const amp = String.fromCharCode(38) + 'amp;';
  const lt = String.fromCharCode(38) + 'lt;';
  const gt = String.fromCharCode(38) + 'gt;';
  const quot = String.fromCharCode(38) + '#34;';
  return text
    .replace(/&/g, amp)
    .replace(/</g, lt)
    .replace(/>/g, gt)
    .replace(/"/g, quot);
}

// Fix #9: Render Markdown safely — no dangerouslySetInnerHTML for inline patterns.
// All HTML is built via React.createElement / JSX with textContent for variable parts.
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

  // Fix #9: Convert **text** → <strong> and `code` → <code> WITHOUT using dangerouslySetInnerHTML.
  // We use React.createElement to build safe elements with textContent for variable content.
  function renderInlineFormat(text: string): React.ReactNode {
    const parts = splitByPatterns(text);
    return parts.map((part, idx) => {
      if (part.isStrong) {
        return <strong key={`s-${idx}`} className="font-bold">{escapeHtml(part.text)}</strong>;
      }
      if (part.isEmphasis) {
        return <em key={`e-${idx}`} className="italic">{escapeHtml(part.text)}</em>;
      }
      if (part.isCode) {
        return (
          <code key={`c-${idx}`} className="bg-[#313244] px-1.5 py-0.5 rounded text-xs font-mono">
            {escapeHtml(part.text)}
          </code>
        );
      }
      // Plain text — render safely via textContent (no HTML injection possible)
      return <span key={`t-${idx}`}>{escapeHtml(part.text)}</span>;
    });
  }

  function splitByPatterns(text: string): Array<{ isStrong: boolean; isEmphasis: boolean; isCode: boolean; text: string }> {
    const parts: Array<{ isStrong: boolean; isEmphasis: boolean; isCode: boolean; text: string }> = [];
    let i = 0;
    while (i < text.length) {
      // Strong: **text**
      if (text.startsWith('**', i)) {
        const end = text.indexOf('**', i + 2);
        if (end !== -1) {
          parts.push({ isStrong: true, isEmphasis: false, isCode: false, text: text.slice(i + 2, end).replace(/\*/g, '') });
          i = end + 2;
          continue;
        }
      }
      // Emphasis (single asterisk): *text* — but not if part of **
      if (text.startsWith('*', i) && text[i + 1] !== '*') {
        const end = text.indexOf('*', i + 1);
        if (end !== -1) {
          parts.push({ isStrong: false, isEmphasis: true, isCode: false, text: text.slice(i + 1, end).replace(/\*/g, '') });
          i = end + 1;
          continue;
        }
      }
      // Inline code: `code`
      if (text.startsWith('`', i)) {
        const end = text.indexOf('`', i + 1);
        if (end !== -1) {
          parts.push({ isStrong: false, isEmphasis: false, isCode: true, text: text.slice(i + 1, end).replace(/`/g, '') });
          i = end + 1;
          continue;
        }
      }
      // Plain character — include as-is and move forward
      parts.push({ isStrong: false, isEmphasis: false, isCode: false, text: text[i] });
      i++;
    }
    return parts;
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

    if (line.trim() === '') {
      result.push(<br key={`br-${result.length}`} />);
    } else if (line.startsWith('- ')) {
      const content = renderInlineFormat(line.slice(2));
      result.push(
        <div key={`li-${result.length}`} className="flex items-start gap-2">
          <span>•</span>
          {content}
        </div>,
        <br key={`br-li-${result.length}`} />
      );
    } else if (line.startsWith('# ')) {
      result.push(<h3 key={`h3-${result.length}`} className="text-sm font-bold mt-2 mb-1">{renderInlineFormat(line.slice(2))}</h3>);
    } else if (line.startsWith('## ')) {
      result.push(<h4 key={`h4-${result.length}`} className="text-xs font-semibold mt-2 mb-0.5 opacity-80">{renderInlineFormat(line.slice(3))}</h4>);
    } else {
      const content = renderInlineFormat(line);
      result.push(<div key={`p-${result.length}`}>{content}</div>);
    }
  }

  flushCodeBlock();
  return result;
}

// Fix #11: Copy button component for message action buttons (Issue #11)
function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API not available — fall back to legacy method
      const ta = document.createElement('textarea');
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      title={copied ? 'Copied!' : 'Copy'}
      onClick={handleCopy}
      className="opacity-0 hover:opacity-100 transition-opacity text-xs"
    >
      {copied ? '✅' : '📋'}
    </button>
  );
}

// Fix #9: Show compression status indicator in streaming footer
function CompressionStatus({ compressed }: { compressed: CompressedEntry[] | null }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {compressed && compressed.length > 0 ? (
        <>
          <span>🧠</span>
          <span className="text-yellow-300">{compressed.length} summary(s)</span>
        </>
      ) : null}
    </div>
  );
}

// Fix #4: Wire GenerationParams onChange prop to store/parent state
export function ChatPanel({ generationConfig, onConfigChange }: ChatPanelProps) {
  const [localConfig, setLocalConfig] = useState<GenerationConfig>(generationConfig || getDefaults());
  const [showSystemPromptEditor, setShowSystemPromptEditor] = useState(false);

  // Update local config when parent passes new config
  useEffect(() => {
    if (generationConfig) {
      setLocalConfig(generationConfig);
    }
  }, [generationConfig]);

  const handleConfigChange = (config: GenerationConfig) => {
    setLocalConfig(config);
    onConfigChange?.(config);
  };
  
  // Track compression status for the current active message
  const [compressedHistory, setCompressedHistory] = useState<CompressedEntry[] | null>(null);
  const [shouldShowCompressionStatus, setShowCompressionStatus] = useState(false);

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

  // Simulate streaming response for user messages — with context compression
  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text) return;

    addMessage('user', text);
    setInputValue('');

    // ─── Context Compression Check (Phase E-4) ──────────────
    // Before sending, check if the conversation should be compressed
    let isCompressing = false;
    const allMessages = useChatStore.getState().messages;
    if (shouldCompress(allMessages)) {
      isCompressing = true;
      try {
        const updatedHistory = await compressConversation(
          allMessages.map(m => ({ id: m.id, role: m.role, content: m.content })),
          [] // Use empty array — compression engine handles its own history tracking internally
        );
        
        setCompressedHistory(updatedHistory);
        setShowCompressionStatus(true);
      } catch (err) {
        console.warn('Context compression failed:', err);
      }
    }

    // Start streaming response after delay
    setTimeout(() => {
      const streamTexts = [
        `I'll investigate this. Let me read the file first to understand the current implementation.\n\n🔧 Tool: \`read_file\` — completed`,
        '\n\nI found an issue in the auth middleware.',
        `\n\nHere's my plan:\n\n1. Update the secret key in \`.env\`\n2. Modify the verification logic to handle rotation\n3. Add a fallback mechanism for graceful degradation`
      ];

      let msgIdx = 0;
      let charIdx = 0;

      const responseId = `msg-${Date.now()}`;
      setMessages([...messages, {
        id: responseId, role: 'assistant', content: '', timestamp: Date.now(), streaming: true, toolCalls: [],
        generationConfig: generationConfig || getDefaults()
      }]);

      const interval = setInterval(() => {
        if (msgIdx >= streamTexts.length) {
          clearInterval(interval);
          useChatStore.setState((s) => ({ 
            isSending: false,
            messages: s.messages.map((m: ChatMessage) => (m.role === 'assistant' ? { ...m, streaming: false } : m))
          }));
          
          // Track token speed after first chunk arrives (~600ms delay + processing time)
          lastTokenTimestamp = Date.now();
          tokenSpeedTimer = setInterval(() => {
            const now = Date.now();
            const elapsedSeconds = (now - lastTokenTimestamp) / 1000;
            if (elapsedSeconds > 2) { // Only show after 2 seconds of streaming
              const storeState = useChatStore.getState();
              const totalTokens = Math.round(storeState.messages.reduce((sum: number, m: ChatMessage) => 
                sum + (m.streaming ? m.content.length / 4 : 0), 0) / elapsedSeconds
              );
              // Store token speed in a global variable since it's not part of the store schema
              if (typeof window !== 'undefined') {
                (window as any).tokenSpeed = totalTokens;
              }
            }
          }, 500);
          
          // Hide compression status after a few seconds if it was shown briefly
          if (isCompressing) {
            setTimeout(() => setShowCompressionStatus(false), 3000);
          }
          return;
        }

        const fullText = streamTexts.slice(0, msgIdx + 1).join('');
        useChatStore.setState((s) => ({ 
          messages: s.messages.map((m: ChatMessage) => m.id === responseId ? { ...m, content: fullText } : m)
        }));

        // Add tool call card after first chunk arrives (simulates real-time tool execution)
        if (msgIdx === 0 && charIdx > 5) {
          useChatStore.setState((s) => ({ 
            messages: s.messages.map((m: ChatMessage) => m.id === responseId ? { ...m, toolCalls: [{ id: 't1', type: 'read_file', status: 'completed' }] } : m)
          }));
        }

        charIdx++;
        if (charIdx >= streamTexts[msgIdx].length) {
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
        <button title="System Prompt" onClick={() => setShowSystemPromptEditor(true)} className="ml-1 px-2 py-0.5 rounded bg-[#313244] hover:bg-[#45475a] transition text-xs">⚙️</button>
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
          {typeof window !== 'undefined' && (window as any).tokenSpeed > 0 && (
            <span className="text-green-300">{Math.round((window as any).tokenSpeed)} tok/s</span>
          )}
          <CompressionStatus compressed={compressedHistory} />
          <button onClick={() => useChatStore.getState().stopStreaming()} className="ml-auto px-2 py-0.5 rounded bg-[#f38ba8]/20 text-[#f38ba8] hover:bg-[#f38ba8]/40 transition" title="Cancel">✕ Cancel</button>
        </div>
      )}

      {/* Context compression status (shown briefly after compression) */}
      {shouldShowCompressionStatus && compressedHistory !== null && (
        <div className="px-3 py-1 bg-[#f9e2af]/10 border-b border-[#45475a] text-xs flex items-center gap-2 animate-pulse">
          <span>🧠 Compressing context...</span>
          {compressedHistory.length > 0 && (
            <> — <span className="text-yellow-300">{compressedHistory.length} summary(s) created</span></>
          )}
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

          {/* Generation parameters - controlled select (Fix #4) */}
          <div className="flex items-center gap-2 ml-auto text-xs">
            <select 
              value={localConfig.temperature.toString()} 
              onChange={(e) => handleConfigChange({ ...localConfig, temperature: parseFloat(e.target.value) })}
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
        <span>~{messages.reduce((sum, m) => sum + m.content.length / 4, 0)} tokens</span>
        <span>{new Date().toLocaleTimeString()}</span>
      </div>

      {/* System Prompt Editor Modal (Fix #6) */}
      <SystemPromptEditor isOpen={showSystemPromptEditor} onClose={() => setShowSystemPromptEditor(false)} onConfigChange={handleConfigChange} />
    </div>
  );
}

function ChatMessageItem({ message }: { message: { id: string; role: 'user' | 'assistant'; content: string; timestamp: number; streaming?: boolean; toolCalls?: Array<{ id: string; type: string; status: string }> } & { generationConfig?: { temperature: number; topP: number } }}) {
  return (
    <div className={`mb-2 ${message.role === 'user' ? 'ml-auto max-w-[80%]' : 'mr-auto max-w-[90%]'} rounded-lg p-3 text-sm`}>
      {message.role === 'user' ? (
        <div className="msg-user rounded">
          <span className="text-[#a6adc8] text-xs block mb-1 flex items-center justify-between">
            🧑 You
            <div className="flex gap-1.5">
              {/* Fix #11: Add click handlers to user message action buttons (Issue #11) */}
              <CopyButton content={message.content} />
            </div>
          </span>
          {message.content}
        </div>
      ) : (
        <div className="msg-assistant rounded">
          <span className="text-[#a6adc8] text-xs block mb-1 flex items-center justify-between">
            🤖 Agent
            <div className="flex gap-1.5">
              {message.streaming && <button title="Cancel" onClick={() => useChatStore.getState().stopStreaming()} className="opacity-0 hover:opacity-100 transition-opacity text-xs text-[#f38ba8]">✕</button>}
              <button title="Regenerate" onClick={() => handleRegenerate(message.id)} className="opacity-0 hover:opacity-100 transition-opacity text-xs">🔁</button>
              <CopyButton content={message.content} />
            </div>
          </span>

          {/* Render Markdown content — fixed to use safe renderMarkdown (Fix #9) */}
          {renderMarkdown(message.content)}

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

/**
 * Regenerate an agent response by re-sending the user's last message with same generation config.
 */
function handleRegenerate(messageId: string): void {
  const store = useChatStore.getState();
  
  // Find the message to regenerate and get its index in the messages array
  const msgIdx = store.messages.findIndex(m => m.id === messageId);
  if (msgIdx < 1) return; // Need at least a user message before this agent message
  
  // Get the preceding user message to re-send as context
  const prevMessage = store.messages[msgIdx - 1];
  if (prevMessage.role !== 'user') return; // Previous must be a user message
  
  // Use same generation config as original, or default if not available
  const generationConfig = store.messages[msgIdx]?.generationConfig || getDefaults();
  
  // Remove the current agent message and any subsequent tool calls
  useChatStore.getState().setMessages(store.messages.slice(0, msgIdx));
  
  // Start streaming a new response — same pattern as handleSend but without adding a user message first
  setTimeout(() => {
    const streamTexts = [
      `I'll investigate this. Let me read the file first to understand the current implementation.\n\n🔧 Tool: \`read_file\` — completed`,
      '\n\nI found an issue in the auth middleware.',
      `\n\nHere's my plan:\n\n1. Update the secret key in \`.env\`\n2. Modify the verification logic to handle rotation\n3. Add a fallback mechanism for graceful degradation`
    ];

    let currentMsgIdx = 0;
    let charIdx = 0;

    const responseId = `msg-${Date.now()}`;
    useChatStore.getState().setMessages([...store.messages, {
      id: responseId, role: 'assistant' as const, content: '', timestamp: Date.now(), streaming: true, toolCalls: [],
      generationConfig: generationConfig || getDefaults()
    }]);

    const interval = setInterval(() => {
      if (currentMsgIdx >= streamTexts.length) {
        clearInterval(interval);
        useChatStore.setState((s: any) => ({ 
          isSending: false,
          messages: s.messages.map((m: ChatMessage) => (m.role === 'assistant' ? { ...m, streaming: false } : m))
        }));
        return;
      }

      const fullText = streamTexts.slice(0, currentMsgIdx + 1).join('');
      useChatStore.setState((s: any) => ({ 
        messages: s.messages.map((m: ChatMessage) => m.id === responseId ? { ...m, content: fullText } : m)
      }));

      // Add tool call card after first chunk arrives (simulates real-time tool execution)
      if (currentMsgIdx === 0 && charIdx > 5) {
        useChatStore.setState((s: any) => ({ 
          messages: s.messages.map((m: ChatMessage) => m.id === responseId ? { ...m, toolCalls: [{ id: 't1', type: 'read_file', status: 'completed' }] } : m)
        }));
      }

      charIdx++;
      if (charIdx >= streamTexts[currentMsgIdx].length) {
        currentMsgIdx++;
        charIdx = 0;
      }
    }, 15);

    return () => clearInterval(interval);
  }, 600);
}

// Fix #6: System Prompt Editor Modal — controlled by parent via isOpen/onClose props
function SystemPromptEditor({ isOpen, onClose, onConfigChange }: { isOpen: boolean; onClose: () => void; onConfigChange?: (config: GenerationConfig) => void }) {
  const [promptText, setPromptText] = useState('');

  // Open the modal and initialize prompt text from store or default
  useEffect(() => {
    if (isOpen) {
      // Load current system prompt from localStorage or use default
      const saved = localStorage.getItem('openllmcode-system-prompt');
      setPromptText(saved || getDefaultSystemPrompt());
    }
  }, [isOpen]);

  function getDefaultSystemPrompt(): string {
    return `You are OpenLLMCode, an AI coding assistant.\n\n[PROJECT CONTEXT]\nWorking directory: /path/to/project\nFile tree:\n  src/\n    app.ts\n    db.sql\n  package.json\n\n[AVAILABLE TOOLS]\n- read_file(path): Read a file's contents\n- write_file(path, content): Write to a file (requires approval)\n- run_command(command): Execute a shell command\n\n[BEHAVIORAL GUIDELINES]\n1. Always read a file before modifying it — never guess at its contents\n2. Show the diff of changes before requesting approval to write\n3. Explain what you're doing and why before each action\n4. Ask clarifying questions when the task is ambiguous\n5. Prefer small, incremental changes over large rewrites`;
  }

  // Fix #12: Use proper preset labels derived from the key names instead of hardcoded idx-based values.
  // Map each preset key to its display label for both presets and UI rendering.
  const PRESETS = {
    coding: 'You are a coding assistant working within OpenLLMCode. Always read files before modifying them.',
    review: 'You are a code reviewer. Focus on quality, security, and best practices.',
    debugging: 'You are a debugging expert. Analyze errors systematically and suggest targeted fixes.',
    reverse_engineer: 'You are a reverse engineer. Deep analyze the existing code to understand architecture, data flow, and design patterns.',
    security_auditor: 'You are a security auditor. Systematically review code for vulnerabilities, anti-patterns, and best-practice violations.',
  };

  const PRESET_LABELS = {
    coding: 'Coding',
    review: 'Review',
    debugging: 'Debug',
    reverse_engineer: 'R/E',
    security_auditor: 'Audit',
  } as const;

  function getPresetLabel(key: string): string {
    return PRESET_LABELS[key as keyof typeof PRESET_LABELS] || key;
  }

  const handleApplyPreset = (presetName: string) => {
    setPromptText(PRESETS[presetName as keyof typeof PRESETS] || getDefaultSystemPrompt());
  };

  const handleSave = () => {
    localStorage.setItem('openllmcode-system-prompt', promptText);
    onClose();
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="w-[640px] max-h-[80vh] rounded-lg border border-[#45475a] shadow-xl overflow-hidden flex flex-col">
        <div className="bg-[#1e1e2e] px-6 py-4 border-b border-[#45475a]">
          <h3 className="text-sm font-semibold text-[#cdd6f4]">📝 System Prompt Editor</h3>
        </div>

        {/* Presets — Fix #12: Use getPresetLabel for proper display labels */}
        <div className="px-6 py-3 border-b border-[#45475a] bg-[#181825]/60 flex gap-2">
          {Object.keys(PRESETS).map((key) => (
            <button 
              key={key} 
              onClick={() => handleApplyPreset(key)} 
              className="px-3 py-1 rounded text-xs bg-[#313244] hover:bg-[#45475a] transition"
            >
              {getPresetLabel(key)}
            </button>
          ))}
        </div>

        {/* Prompt text — controlled textarea (Fix #6) */}
        <textarea 
          value={promptText} 
          onChange={(e) => setPromptText(e.target.value)}
          rows={16}
          className="flex-1 bg-[#1e1e2e] border-none px-6 py-3 text-sm font-mono focus:outline-none resize-none" />

        <div className="px-6 py-3 bg-[#181825]/60 border-t border-[#45475a] flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-xs hover:bg-[#313244] transition">Cancel</button>
          <button onClick={handleSave} className="px-3 py-1.5 rounded bg-[#cba6f7] hover:bg-[#b4befe] text-black font-semibold text-xs transition">Save & Apply</button>
        </div>
      </div>
    </div>
  );
}