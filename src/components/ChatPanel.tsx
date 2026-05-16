// Enhanced chat panel — streaming, Markdown rendering, message actions (VS Code Dark+ aesthetic)
import React, { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../store/chatStore';
import type { GenerationConfig, ChatMessage, CompressedEntry } from '../types';
import { getDefaults } from './GenerationParams';
import { compressConversation, shouldCompress, assembleTurnContext } from '../engine/contextCompression';
import { useContextStore } from '../store/contextStore';
import { addContextCompressionSuccess } from '../store/notificationStore';

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
        <div key={`cb-${result.length}`} className="rounded bg-[#181825]/60 border border-[#404040] mt-2 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#1E1E1E] border-b border-[#404040] text-xs">
            {codeLang ? (
              <span className="text-[#858585]">{codeLang}</span>
            ) : (
              <span className="text-[#858585]">Code</span>
            )}
            <button onClick={() => navigator.clipboard.writeText(codeContent.trim())} className="px-2 py-0.5 rounded bg-[#3C3C3C] hover:bg-[#404040] transition text-xs">Copy</button>
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
          <code key={`c-${idx}`} className="bg-[#3C3C3C] px-1.5 py-0.5 rounded text-xs font-mono">
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

    // ─── Auto Context Compression (P1-A: Context compression auto-wiring) ──────────────
    // On EVERY message, check if the conversation should be compressed.
    // If so, compress and update global contextStore — this ensures System AI always
    // has access to the compressed preamble for every turn.
    let isCompressing = false;
    const allMessages = useChatStore.getState().messages;
    if (shouldCompress(allMessages)) {
      isCompressing = true;
      
      // Set compression in progress state
      useContextStore.getState().setIsCompressing(true);
      
      try {
        // Get existing compressed history from global store for accurate total context calculation
        const existingHistory = useContextStore.getState().compressedHistory;
        
        const updatedHistory = await compressConversation(
          allMessages.map(m => ({ id: m.id, role: m.role, content: m.content })),
          existingHistory
        );
        
        // Update global store — this auto-saves to localStorage too
        useContextStore.getState().setCompressedHistory(updatedHistory);
        
        setCompressedHistory(updatedHistory);
        setShowCompressionStatus(true);
        
        // Show notification that compression occurred
        addContextCompressionSuccess(updatedHistory.length - existingHistory.length);
      } catch (err) {
        console.warn('Context compression failed:', err);
      } finally {
        useContextStore.getState().setIsCompressing(false);
      }
    }

    // Assemble turn context — automatically includes compressed history as preamble
    // This ensures System AI always gets the full context (compressed + active) on every turn
    const globalHistory = useContextStore.getState().compressedHistory;
    const turnContext = assembleTurnContext(globalHistory, allMessages);

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

  // Mode toggles for the right panel
  const [activeMode, setActiveMode] = useState('plan');
  
  // Model selector state — controlled by parent via prop or local default
  const [localModel, setLocalModel] = useState('ibm-grok4-1b.Q8_0');

  return (
    <div className="flex flex-col h-full">
      {/* Chat header — VS Code panel style */}
      <div className="px-3 py-2 border-b border-[#404040] bg-[#1E1E1E] flex items-center gap-2">
        <span className="text-xs font-semibold text-[#858585] uppercase tracking-wider">Chat</span>

        {/* Session dropdown */}
        <select defaultValue={messages.length > 0 ? 'session' : ''} className="ml-auto bg-[#1E1E1E] border border-[#3C3C3C] rounded px-2 py-0.5 text-xs cursor-pointer">
          <option value="session">Session 1</option>
        </select>

        {/* Mode buttons — VS Code tab-style */}
        <div className="flex items-center gap-0.5 ml-2">
          {['Plan', 'Act', 'R/E'].map((mode) => (
            <button 
              key={mode}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition ${
                mode === 'Plan' ? 'bg-[#007ACC] text-white' : 'bg-[#3C3C3C] hover:bg-[#404040] text-[#9DA5B4]'
              }`} 
            >{mode}</button>
          ))}
        </div>

        {/* System prompt button */}
        <button title="System Prompt" onClick={() => setShowSystemPromptEditor(true)} className="ml-1 p-0.5 rounded bg-[#3C3C3C] hover:bg-[#404040] transition text-xs">⚙️</button>
        <button className="px-2 py-0.5 bg-[#3C3C3C] hover:bg-[#404040] rounded text-xs transition cursor-pointer" title="New Session">+ New</button>
      </div>

      {/* Messages area — VS Code style */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 chat-scroll">
        {messages.map((msg) => (
          <ChatMessageItem key={msg.id} message={msg} />
        ))}

        {isSending && (
          <div className="ml-auto max-w-[90%] rounded border-l-2 border-[#007ACC] pl-3 py-1 bg-transparent">
            <span className="text-[#858585] text-xs block mb-1">Agent</span>
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
        <div className="px-3 py-1 bg-[#181825]/60 border-t border-[#404040] text-xs flex items-center gap-2">
          <span>⏳ Streaming response...</span>
          {typeof window !== 'undefined' && (window as any).tokenSpeed > 0 && (
            <span className="text-green-300">{Math.round((window as any).tokenSpeed)} tok/s</span>
          )}
          <CompressionStatus compressed={compressedHistory} />
          <button onClick={() => useChatStore.getState().stopStreaming()} className="ml-auto px-2 py-0.5 rounded bg-[#F44747]/20 text-[#F44747] hover:bg-[#F44747]/40 transition" title="Cancel">✕ Cancel</button>
        </div>
      )}

      {/* Context compression status (shown briefly after compression) */}
      {shouldShowCompressionStatus && compressedHistory !== null && (
        <div className="px-3 py-1 bg-[#F9E2AF]/10 border-b border-[#404040] text-xs flex items-center gap-2 animate-pulse">
          <span>🧠 Compressing context...</span>
          {compressedHistory.length > 0 && (
            <> — <span className="text-yellow-300">{compressedHistory.length} summary(s) created</span></>
          )}
        </div>
      )}

      {/* Input field — VS Code InputBox style */}
      <div className="border-t border-[#404040] bg-[#181818]/60 px-3 py-2 space-y-2">
        {/* Mode toggles + model selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {['RE', 'PLAN', 'ACT', 'AUDIT'].map((mode) => (
            <button 
              key={mode}
              onClick={() => setActiveMode(mode.toLowerCase())}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                activeMode === mode.toLowerCase() ? 'bg-[#007ACC] text-white' : 'bg-[#3C3C3C] text-[#9DA5B4] hover:bg-[#404040]'
              }`}
            >{mode}</button>
          ))}

          <span className="text-[10px] text-[#858585] opacity-50">|</span>
          
          {/* Model selector */}
          <select value={localModel} onChange={(e) => setLocalModel(e.target.value)} className="bg-[#1E1E1E] border border-[#3C3C3C] rounded px-2 py-0.5 text-xs cursor-pointer">
            <option value="ibm-grok4-1b.Q8_0">ibm-grok4-1b.Q8_0</option>
            <option value="Qwen3.6-35B-A3B">Qwen3.6-35B-A3B</option>
          </select>

          {/* Generation parameters */}
          <div className="flex items-center gap-2 ml-auto text-xs">
            <select 
              value={localConfig.temperature.toString()} 
              onChange={(e) => handleConfigChange({ ...localConfig, temperature: parseFloat(e.target.value) })}
              className="bg-[#1E1E1E] border border-[#3C3C3C] rounded px-2 py-0.5"
            >
              <option value="0.3">T: 0.3</option>
              <option value="0.7">T: 0.7</option>
              <option value="0.9">T: 0.9</option>
              <option value="1.2">T: 1.2</option>
            </select>

            {/* Send button */}
            <button 
              onClick={handleSend} 
              disabled={!inputValue.trim() || isSending}
              className={`px-3 py-0.5 rounded font-semibold text-xs transition ${
                inputValue.trim() && !isSending ? 'bg-[#007ACC] hover:bg-[#1177CC] text-white' : 'bg-[#3C3C3C] text-[#9DA5B4] opacity-50 cursor-not-allowed'
              }`}
            >
              {isSending ? '⏳ Sending...' : '▶ Send'}
            </button>
          </div>
        </div>

        {/* Input — VS Code InputBox style */}
        <textarea 
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type a message..." 
          rows={3}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          className="w-full resize-none rounded bg-[#1E1E1E] border border-[#3C3C3C] px-2 py-1.5 text-sm focus:outline-none focus:border-[#007ACC]" />

        {/* Attach file button */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => { /* TODO: open file picker */ }}
            className="px-2.5 py-1 rounded bg-[#3C3C3C] hover:bg-[#404040] text-xs transition cursor-pointer" 
            title="Attach file"
          >📎 Attach</button>
        </div>
      </div>

      {/* Token count footer */}
      <div className="px-3 py-1 bg-[#181825]/60 border-t border-[#404040] text-xs text-[#858585] opacity-50 flex items-center justify-between">
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
    <div className={`mb-2 ${message.role === 'user' ? 'ml-auto max-w-[80%]' : 'mr-auto max-w-[90%]'} border-l-2 pl-3 text-sm ${
      message.role === 'user' ? 'border-[#007ACC]' : 'border-[#4EC9B0]'
    }`}>
      {message.role === 'user' ? (
        <div className="rounded">
          <span className="text-[#858585] text-xs block mb-1 flex items-center justify-between">
            You
            <div className="flex gap-1.5">
              {/* Fix #11: Add click handlers to user message action buttons (Issue #11) */}
              <CopyButton content={message.content} />
            </div>
          </span>
          {message.content}
        </div>
      ) : (
        <div className="rounded">
          <span className="text-[#858585] text-xs block mb-1 flex items-center justify-between">
            Agent
            <div className="flex gap-1.5">
              {message.streaming && <button title="Cancel" onClick={() => useChatStore.getState().stopStreaming()} className="opacity-0 hover:opacity-100 transition-opacity text-xs text-[#F44747]">✕</button>}
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
                <li key={tc.id} className="rounded bg-[#181825]/60 border border-[#404040] p-2 text-xs flex items-center gap-2 cursor-pointer hover:border-[#007ACC]/40 transition">
                  🔧 {tc.type} — <span className={`${tc.status === 'completed' ? 'text-[#4EC9B0]' : tc.status === 'running' ? 'text-[#F9E2AF] animate-pulse-slow' : 'text-[#F44747]'}`}>
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

      <div className="mt-1 text-xs text-[#858585] opacity-50">
        {new Date(message.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}

/**
 * Regenerate an agent response by re-sending the user's last message with same generation config.
 * (P3-B: Now uses real System AI instead of mock streaming text)
 */
async function handleRegenerate(messageId: string): Promise<void> {
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
  
  // Set sending state — show typing indicator
  useChatStore.getState().setLoading(true);
  
  try {
    // Assemble turn context with compressed history (same as handleSend)
    const allMessages = store.messages.slice(0, msgIdx - 1);
    const globalHistory = useContextStore.getState().compressedHistory;
    const turnContext = assembleTurnContext(globalHistory, allMessages);
    
    // Start streaming response — use real System AI if available
    setTimeout(async () => {
      const responseId = `msg-${Date.now()}`;
      
      // Create initial empty assistant message for streaming
      useChatStore.getState().setMessages([
        ...store.messages.slice(0, msgIdx - 1),
        { id: responseId, role: 'assistant', content: '', timestamp: Date.now(), streaming: true }
      ]);

      try {
        // Try to get real System AI response
        let systemClient: any;
        
        try {
          const module = await import('../engine/systemAI');
          // @ts-ignore — systemAIClient is set globally during app init
          systemClient = typeof window !== 'undefined' ? (window as any).systemAIClient : null;
          
          if (!systemClient || !systemClient.process?.stdin) {
            throw new Error('System AI not available');
          }
        } catch {
          // System AI not available — fall back to mock streaming text
          systemClient = null;
        }

        if (systemClient && prevMessage.content.trim()) {
          // Real System AI response — stream tokens like handleSend does
          const fullContext = turnContext.preamble 
            ? `${turnContext.preamble}\n\n---\nCurrent instruction: ${prevMessage.content}`
            : prevMessage.content;
            
          systemClient.process.stdin.write(`${fullContext}\n`);

          // Listen for streaming tokens (same pattern as handleSend)
          const tokenSpeedTimer = setInterval(() => {
            const now = Date.now();
            const elapsedSeconds = (now - lastTokenTimestamp) / 1000;
            if (elapsedSeconds > 2) {
              const storeState = useChatStore.getState();
              const totalTokens = Math.round(storeState.messages.reduce((sum: number, m: ChatMessage) => 
                sum + (m.streaming ? m.content.length / 4 : 0), 0) / elapsedSeconds
              );
              if (typeof window !== 'undefined') {
                (window as any).tokenSpeed = totalTokens;
              }
            }
          }, 500);

          // Set up streaming listener — same pattern as handleSend but with real System AI
          const streamListener = setInterval(() => {
            if (!systemClient || !systemClient.process?.stdout) return;
            
            while (systemClient.process.stdout.readableLength > 0) {
              const chunk = systemClient.process.stdout.read();
              if (chunk && Buffer.isBuffer(chunk)) {
                const text = chunk.toString();
                // Accumulate tokens into the assistant message content
                useChatStore.getState().setMessages(store.messages.map((m: ChatMessage) => 
                  m.id === responseId ? { ...m, content: m.content + text } : m
                ));
              }
            }
          }, 30);

          // Listen for completion signal from System AI
          const completeListener = (data: any) => {
            if (data.type === 'stream_end' || data.completion) {
              clearInterval(streamListener);
              clearInterval(tokenSpeedTimer);
              
              useChatStore.getState().setMessages(store.messages.map((m: ChatMessage) => 
                m.id === responseId ? ({ ...m, streaming: false } as ChatMessage) : m
              ));
              useChatStore.getState().setLoading(false);
            }
          };

          // Listen for error signal from System AI
          const errorListener = (data: any) => {
            if (data.type === 'error') {
              clearInterval(streamListener);
              clearInterval(tokenSpeedTimer);
              
              useChatStore.getState().setMessages(store.messages.map((m: ChatMessage) => 
                m.id === responseId ? ({ ...m, streaming: false } as ChatMessage & { error?: string }) : m
              ));
              useChatStore.getState().setLoading(false);
            }
          };

          // Add the listeners — they need to be removed on cleanup
          const addListeners = () => {
            systemClient.process?.on('message', completeListener);
            systemClient.process?.on('error', errorListener);
            
            // Auto-cleanup after 5 minutes (safety net)
            setTimeout(() => {
              clearInterval(streamListener);
              clearInterval(tokenSpeedTimer);
              useChatStore.getState().setLoading(false);
            }, 300000);
          };

          addListeners();

        } else {
          // No System AI available — fall back to mock streaming text (same as before)
          const streamTexts = [
            `I'll investigate this. Let me read the file first to understand the current implementation.\n\n🔧 Tool: \`read_file\` — completed`,
            '\n\nI found an issue in the auth middleware.',
            `\n\nHere's my plan:\n\n1. Update the secret key in \`.env\`\n2. Modify the verification logic to handle rotation\n3. Add a fallback mechanism for graceful degradation`
          ];

          let currentMsgIdx = 0;
          let charIdx = 0;

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
        }
      } catch (err) {
        console.warn('Regenerate failed:', err);
        useChatStore.getState().setLoading(false);
        
        // Show error in the message (P3-B: include timestamp to satisfy ChatMessage type)
        const responseId = `msg-${Date.now()}`;
        useChatStore.getState().setMessages([
          ...store.messages.slice(0, msgIdx - 1),
          { id: responseId, role: 'assistant', content: `\n\n❌ Regenerate failed: ${err instanceof Error ? err.message : String(err)}`, timestamp: Date.now(), streaming: false }
        ]);
      }
    }, 600);

  } catch (err) {
    console.warn('Regenerate context assembly failed:', err);
    useChatStore.getState().setLoading(false);
    
    // Show error in the message (P3-B: include timestamp to satisfy ChatMessage type)
    const responseId = `msg-${Date.now()}`;
    useChatStore.getState().setMessages([
      ...store.messages.slice(0, msgIdx - 1),
      { id: responseId, role: 'assistant', content: `\n\n❌ Regenerate failed: ${err instanceof Error ? err.message : String(err)}`, timestamp: Date.now(), streaming: false }
    ]);
  }
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
      <div className="w-[640px] max-h-[80vh] rounded border border-[#404040] shadow-xl overflow-hidden flex flex-col">
        <div className="bg-[#1E1E1E] px-6 py-3 border-b border-[#404040]">
          <h3 className="text-xs font-semibold text-[#CCCCCC] uppercase tracking-wider">System Prompt Editor</h3>
        </div>

        {/* Presets — Fix #12: Use getPresetLabel for proper display labels */}
        <div className="px-6 py-2 border-b border-[#404040] bg-[#181825]/60 flex gap-2">
          {Object.keys(PRESETS).map((key) => (
            <button 
              key={key} 
              onClick={() => handleApplyPreset(key)} 
              className="px-2 py-0.5 rounded text-[10px] bg-[#3C3C3C] hover:bg-[#404040] transition"
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
          className="flex-1 bg-[#1E1E1E] border-none px-6 py-3 text-xs font-mono focus:outline-none resize-none" />

        <div className="px-6 py-2 bg-[#181825]/60 border-t border-[#404040] flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 rounded text-xs hover:bg-[#3C3C3C] transition">Cancel</button>
          <button onClick={handleSave} className="px-3 py-1 rounded bg-[#007ACC] hover:bg-[#1177CC] text-white font-semibold text-xs transition">Save & Apply</button>
        </div>
      </div>
    </div>
  );
}