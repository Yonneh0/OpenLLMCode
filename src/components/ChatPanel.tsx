import React, { useEffect } from 'react';

export interface DemoMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: Array<{ id: string; type: string; status: string }>;
}

const demoMessages: DemoMessage[] = [
  { id: '1', role: 'user', content: "Fix the authentication bug in src/auth/middleware.ts", timestamp: Date.now() },
  { id: '2', role: 'assistant', content: "I'll investigate the auth middleware. Let me read the file first to understand the current implementation.", toolCalls: [{ id: 't1', type: 'read_file', status: 'completed' }], timestamp: Date.now() },
  { id: '3', role: 'assistant', content: "Found it — JWT verification uses an expired secret key. I'll update the auth middleware to handle key rotation.", toolCalls: [{ id: 't2', type: 'run_command', status: 'running' }], timestamp: Date.now() },
];

export function ChatPanel() {
  const [input, setInput] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="px-3 py-2 border-b border-[#45475a] bg-[#181825]/40 flex items-center gap-2">
        <span className="text-sm font-semibold text-[#a6adc8]">Chat</span>
        <select defaultValue={demoMessages.length > 0 ? 'session' : ''} className="ml-auto bg-[#1e1e2e] border border-[#45475a] rounded px-2 py-1 text-xs">
          <option value="session">Session 1</option>
        </select>
        <button className="px-2 py-0.5 bg-[#313244] hover:bg-[#45475a] rounded text-xs transition" title="New Session">+ New</button>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 chat-scroll">
        {demoMessages.map((msg) => (
          <ChatMessageItem key={msg.id} message={msg} />
        ))}
      </div>

      {/* Input field */}
      <div className="p-3 border-t border-[#45475a] bg-[#181825]/40">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="💬 Type a message..." rows={3}
          className="w-full resize-none rounded bg-[#1e1e2e] border border-[#45475a] px-3 py-2 text-sm focus:outline-none focus:border-[#cba6f7]" />

        <div className="flex items-center gap-2 mt-2">
          <button className="px-2.5 py-1 rounded bg-[#313244] hover:bg-[#45475a] text-xs transition" title="Attach file">📎 Attach</button>
          <select defaultValue={0.7} className="ml-auto bg-[#1e1e2e] border border-[#45475a] rounded px-2 py-1 text-xs">
            <option value="0.7" defaultValue>T: 0.7</option>
            <option value="0.9">T: 0.9</option>
          </select>
          <button className="px-4 py-1 rounded bg-[#cba6f7] hover:bg-[#b4befe] text-black font-semibold text-xs transition">▶ Send</button>
        </div>
      </div>
    </div>
  );
}

function ChatMessageItem({ message }: { message: DemoMessage }) {
  return (
    <div className={`mb-2 ${message.role === 'user' ? 'ml-auto max-w-[80%]' : 'mr-auto max-w-[90%]'} rounded-lg p-3 text-sm`}>
      {message.role === 'user' ? (
        <div className="bg-indigo-600/20 border border-indigo-500/30 rounded">
          <span className="text-[#a6adc8] text-xs block mb-1">🧑 You</span>
          {message.content}
        </div>
      ) : (
        <div className="bg-[#1e1e2e]/50 border border-[#45475a] rounded">
          <span className="text-[#a6adc8] text-xs block mb-1">🤖 Agent</span>
          {message.content}
        </div>
      )}

      {message.toolCalls && message.toolCalls.length > 0 && (
        <ul className="mt-2 space-y-1">
          {message.toolCalls.map((tc) => (
            <li key={tc.id} className="rounded bg-[#181825]/60 border border-[#45475a] p-2 text-xs flex items-center gap-2">
              🔧 {tc.type} — <span className={`${tc.status === 'completed' ? 'text-[#a6e3a1]' : tc.status === 'running' ? 'text-[#f9e2af]' : 'text-[#f38ba8]'}`}>
                {tc.status}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1 text-xs text-[#a6adc8] opacity-50">
        {new Date(message.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}