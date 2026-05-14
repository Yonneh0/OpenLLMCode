import React, { useCallback, useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';

interface TerminalSession {
  id: string;
  label: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  container: HTMLDivElement;
}

export const XTermTerminal: React.FC = () => {
   const containerRef = useRef<HTMLDivElement>(null);
   const sessionsRef = useRef<Map<string, TerminalSession>>(new Map());
   const activeIdRef = useRef<string>('default');
   // Fix #14: Track data listener cleanup functions keyed by session ID (was never removed on close)
   const onDataCleanupRef = useRef<Record<string, () => void>>({});
   const [sessions, setSessions] = React.useState<{ id: string; label: string }[]>([
     { id: 'default', label: 'Terminal' },
   ]);
   const [activeId, setActiveId] = React.useState('default');

  // Create a new terminal session
  const createSession = useCallback((id: string, label: string) => {
    if (sessionsRef.current.has(id)) return;

    // Spawn PTY in main process
    window?.api?.terminal?.spawn()?.then((sessionId) => {
      const container = document.createElement('div');
      container.style.width = '100%';
      container.style.height = '100%';

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
        theme: {
          background: '#1E1E2E',
          foreground: '#CDD6F4',
          cursor: '#F5E0DC',
          selectionBackground: '#585B7044',
          black: '#45475A',
          red: '#F38BA8',
          green: '#A6E3A1',
          yellow: '#F9E2AF',
          blue: '#89B4FA',
          magenta: '#CBA6F7',
          cyan: '#89DCEB',
          white: '#BAC2DE',
          brightBlack: '#585B70',
          brightRed: '#F38BA8',
          brightGreen: '#A6E3A1',
          brightYellow: '#F9E2AF',
          brightBlue: '#89B4FA',
          brightMagenta: '#CBA6F7',
          brightCyan: '#89DCEB',
          brightWhite: '#A6ADC8',
        },
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(container);
      fitAddon.fit();

      // Insert at the beginning so it's behind any existing terminal
      const containerEl = containerRef.current;
      if (containerEl) {
        containerEl.insertBefore(container, containerEl.firstChild);
      }

      const session: TerminalSession = { id, label, terminal: term, fitAddon, container };
      sessionsRef.current.set(id, session);

      // Listen for data from PTY — store cleanup function to remove on close (Fix #14)
      const onDataCleanup = window?.api?.terminal?.onData((data: { sessionId: string; data: string }) => {
        if (data.sessionId === id) {
          term.write(data.data);
        }
      });
      onDataCleanupRef.current[id] = onDataCleanup;

      // Send keystrokes to PTY
      term.onData((data: string) => {
        window?.api?.terminal?.write(id, data);
      });

      setSessions((prev) => [{ id, label }, ...prev]);
      setActiveId(id);
      activeIdRef.current = id;
    });
  }, []);

  // Switch between terminal sessions
  const switchSession = useCallback((id: string) => {
    setActiveId(id);
    activeIdRef.current = id;

    sessionsRef.current.forEach((session, key) => {
      if (key === id) {
        // Bring this terminal's container to front
        session.container.style.display = 'block';
        session.fitAddon.fit();
      } else {
        session.container.style.display = 'none';
      }
    });
  }, []);

   // Close a terminal session
   const closeSession = useCallback((id: string) => {
     const session = sessionsRef.current.get(id);
     if (!session) return;

     // Kill PTY
     window?.api?.terminal?.kill(id);

     // Fix #14: Remove the onData listener cleanup function for this session (was missing — caused memory leak/duplicate writes)
     if (onDataCleanupRef.current[id]) {
       onDataCleanupRef.current[id]();
       delete onDataCleanupRef.current[id];
     }

     // Clean up DOM and terminal
     session.container.remove();
     session.terminal.dispose();

     sessionsRef.current.delete(id);

    const remaining = Array.from(sessionsRef.current.values());
    setSessions(remaining.map((s) => ({ id: s.id, label: s.label })));

    if (activeIdRef.current === id && remaining.length > 0) {
      switchSession(remaining[0].id);
    }
  }, [switchSession]);

  // Initialize default terminal on mount
  useEffect(() => {
    createSession('default', 'Terminal');

    // Handle resize
    const handleResize = () => {
      const session = sessionsRef.current.get(activeIdRef.current);
      if (session) {
        session.fitAddon.fit();
        // Notify main process of new dimensions
        window?.api?.terminal?.resize(session.id, session.terminal.cols, session.terminal.rows);
      }
    };

    const ro = new ResizeObserver(handleResize);
    if (containerRef.current) ro.observe(containerRef.current);

     return () => {
       ro.disconnect();
       // Kill all PTYs on unmount
       window?.api?.terminal?.kill('all');

       // Fix #14: Remove all onData listeners (was missing — caused memory leak/duplicate writes)
       Object.values(onDataCleanupRef.current).forEach((cleanup) => cleanup());
       onDataCleanupRef.current = {};

       sessionsRef.current.forEach((session) => {
         session.container.remove();
         session.terminal.dispose();
       });
       sessionsRef.current.clear();
     };
  }, [createSession]);

  // Switch visibility when active changes
  useEffect(() => {
    switchSession(activeId);
  }, [activeId, switchSession]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e]">
      {/* Terminal tab bar */}
      <div className="flex items-center bg-[#181825] border-b border-[#313244] px-2">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`
              flex items-center gap-1.5 px-3 py-1 text-sm cursor-pointer select-none border-r border-[#313244]
              ${s.id === activeId ? 'bg-[#1e1e2e] text-[#cdd6f4]' : 'text-[#6c7086] hover:bg-[#1e1e2e]'}
            `}
            onClick={() => switchSession(s.id)}
          >
            <span>⬛</span>
            <span>{s.label}</span>
            {sessions.length > 1 && (
              <button
                className="p-0.5 rounded hover:bg-[#45475a] text-[#6c7086] hover:text-[#cdd6f4]"
                onClick={(e) => {
                  e.stopPropagation();
                  closeSession(s.id);
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}

        {/* New terminal button */}
        <button
          className="p-1 text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#313244] rounded ml-1"
          onClick={() => {
            const id = `term-${Date.now()}`;
            createSession(id, `Terminal ${sessions.length + 1}`);
          }}
        >
          ＋
        </button>
      </div>

      {/* Terminal container */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  );
};