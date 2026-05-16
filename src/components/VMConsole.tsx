// ─── QEMU/KVM Simulation Layer — VM Console Viewer ──────────────────────────────
// Serial console and VNC display components for interacting with running VMs
// Per QEMU docs: serial mon mode (stdin/stdout), -vnc for visual output

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ArchitectureType, AcceleratorType, VMRunStateType } from '../engine/qemu/types';

// ─── Serial Console Component ──────────────────────────────
// Per the -serial mon:socket docs — connects to QEMU's monitor socket for interactive control.

interface VMSerialConsoleProps {
  vmId: string;
  qmpSocket: { type: 'tcp' | 'unix'; address?: string; port?: number };
}

export const VMSerialConsole: React.FC<VMSerialConsoleProps> = ({ vmId, qmpSocket }) => {
  const [output, setOutput] = useState<string>('');
  const [inputValue, setInputValue] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);
  
  // Connect to monitor socket when component mounts — per -serial mon:socket docs
  useEffect(() => {
    let ws: WebSocket | null = null;
    
    if (qmpSocket.type === 'tcp' && qmpSocket.port) {
      try {
        ws = new WebSocket(`ws://${qmpSocket.address || 'localhost'}:${qmpSocket.port}`);
      } catch { /* Connection failed — show error */
        setOutput((prev) => prev + `\n[ERROR] Failed to connect to QMP socket at ${qmpSocket.address}:${qmpSocket.port}\n`);
        return;
      }
    } else if (qmpSocket.type === 'unix' && qmpSocket.address) {
      // Unix sockets not supported by WebSocket — use IPC instead
      setOutput((prev) => prev + `\n[INFO] Unix socket connections require IPC — using QMP via Electron IPC\n`);
      return;
    }

    if (!ws) return;

    ws.onopen = () => {
      // Send capability negotiation handshake per the QEMU Machine Protocol Specification chapter's protocol specification section
      const capMsg = JSON.stringify({ execute: 'qmp_capabilities', id: `id-${Date.now()}` }) + '\n';
      try {
        ws?.send(capMsg);
        setOutput((prev) => prev + '[CONNECTED] QMP capability negotiation sent\n');
      } catch {}
    };

    ws.onmessage = (event) => {
      const data = event.data as string;
      // Parse JSON responses — QMP uses JSON over TCP/Unix socket (one object per line, per qmp-spec protocol specification)
      try {
        const parsed = JSON.parse(data);
        if (parsed.return !== null && parsed.return !== undefined && Object.keys(parsed.return).length === 0) {
          // Capability negotiation succeeded — send actual command now
          setOutput((prev) => prev + '[CONNECTED] QMP capability negotiation complete\n');
        } else if (parsed.return) {
          // Command response — per qmp-spec response format: "return" contains the result
          setOutput((prev) => prev + JSON.stringify(parsed.return, null, 2) + '\n');
        } else if (parsed.error) {
          // Error response — per QMP spec error format section
          setOutput((prev) => prev + `[ERROR] ${JSON.stringify(parsed.error)}\n`);
        }
      } catch { /* Non-JSON output — raw guest OS console */
        setOutput((prev) => prev + data);
      }
    };

    ws.onerror = () => {
      setOutput((prev) => prev + `[ERROR] WebSocket connection error\n`);
    };

    ws.onclose = () => {
      setOutput((prev) => prev + '[DISCONNECTED] QMP socket closed\n');
    };

    return () => {
      ws?.close();
    };
  }, [vmId, qmpSocket]);

  const handleSendCommand = useCallback(async () => {
    if (!inputValue.trim()) return;
    
    // Send command to monitor socket via Electron IPC (since WebSocket only works for QMP)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any — qemu is exposed via preload.ts but not in Electron IPC bridge types
      const qemu = (window as any).api?.qemu as any;  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason
      if (!qemu) {
        setOutput((prev) => prev + `[ERROR] QEMU API not available\n`);
        return;
      }

      const result = await qemu.monitorSend(vmId, inputValue.trim());
      setOutput((prev) => prev + `> ${inputValue.trim()}\n` + JSON.stringify(result, null, 2) + '\n');
    } catch (err: unknown) {
      setOutput((prev) => prev + `[ERROR] Failed to send command: ${err instanceof Error ? err.message : String(err)}\n`);
    } finally {
      setInputValue('');
    }
  }, [inputValue, vmId]);

  useEffect(() => {
    // Auto-scroll output to bottom on new messages
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 bg-[#181825]/80 border-b border-[#313244]">
        <h3 className="text-sm font-semibold text-[#cdd6f4] flex items-center gap-2">
          {'\u{1F4A1}'} Serial Console — {vmId}
        </h3>
      </div>

      {/* Output area */}
      <div 
        ref={outputRef}
        className="flex-1 overflow-y-auto px-3 py-2 bg-[#1e1e2e] font-mono text-xs text-[#cdd6f4]"
      >
        {output || <span className="text-[#6c7086]">No output — connecting to monitor socket...</span>}
      </div>

      {/* Input area */}
      <div className="px-3 py-2 bg-[#181825]/80 border-t border-[#313244] flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendCommand()}
          placeholder='Enter QMP command (e.g., "query-status", "stop", "cont")...'
          className="flex-1 px-3 py-2 bg-[#1e1e2e] border border-[#313244] rounded-lg text-xs text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
        />
        <button
          onClick={handleSendCommand}
          disabled={!inputValue.trim()}
          className="px-4 py-2 bg-[#89b4fa] hover:bg-[#74c7ec] text-[#1e1e2e] font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
};

// ─── VNC Display Component ──────────────────────────────
// Per the -vnc docs — provides visual display for VM output via noVNC library.

interface VMDisplayProps {
  vmId: string;
  vncPort?: number;  // Port where QEMU's VNC server is listening (per -vnc :N docs)
}

export const VMDisplay: React.FC<VMDisplayProps> = ({ vmId, vncPort }) => {
  const [vncConnected, setVncConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Connect to QEMU's VNC server — per -vnc :N docs (port N + 5900)
  useEffect(() => {
    const port = vncPort || Number(vmId.split('-').pop()) + 5900;
    const wsUrl = `ws://${window.location.hostname}:${port}`;
    
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any — noVNC library loaded dynamically
      const RFB = (window as any).RFB;  // eslint-disable-line @typescript-eslint/no-explicit-any — RFB protocol from noVNC library (per -vnc docs)
      
      if (!RFB) {
        setError('noVNC not loaded — load <script src="core/vendor/pako_deflate.min.js"> and core/rfb.js before using this component');
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any — noVNC RFB object per rfb.js docs
      const display = new (RFB as any)(document.getElementById('vnc-display')!, wsUrl);  // eslint-disable-line @typescript-eslint/no-explicit-any — RFB protocol from noVNC library (per -vnc docs)

      display.addEventListener('connect', () => {
        setVncConnected(true);
        setError(null);
      });

      display.addEventListener('disconnect', () => {
        setVncConnected(false);
      });

      display.addEventListener('error', () => {
        setError(`VNC connection error — port ${port} not available`);
      });

      return () => {
        try { display.disconnect(); } catch {}  // Clean up on unmount per noVNC docs
      };
    } catch (err: unknown) {
      setError(`Failed to initialize VNC: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [vmId, vncPort]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 bg-[#1e1e2e] border border-[#313244] rounded-lg">
        <p className="text-xs text-[#F44747]">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#1e1e2e] to-black">
      {/* Header */}
      <div className="px-3 py-2 bg-[#181825]/80 border-b border-[#313244] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#cdd6f4] flex items-center gap-2">
          {'\u{1F5A5}'} VNC Display — {vmId}
        </h3>
        <span className={`px-2 py-0.5 rounded text-xs ${vncConnected ? 'bg-[#4EC9B0]/20 text-[#4EC9B0]' : 'bg-[#F44747]/20 text-[#F44747]'}`}>
          {vncConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* VNC canvas — per noVNC core/rfb.js docs */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div id="vnc-display" className="bg-black rounded-lg border border-[#313244] overflow-hidden">
          {!vncConnected && (
            <div className="flex items-center justify-center w-full h-64 text-[#6c7086]">
              <p className="text-xs">Connecting to VNC server...</p>
            </div>
          )}
        </div>
      </div>

      {/* Keyboard controls — per noVNC keyboard docs */}
      <div className="px-3 py-2 bg-[#181825]/80 border-t border-[#313244] flex gap-2">
        <button
          onClick={() => {
            // Send Ctrl+Alt+Delete via noVNC — per keyboard input docs in core/keyboard.js
            try { /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ (window as any).RFB?.sendCtrlAltDel(); } catch {}  // eslint-disable-line @typescript-eslint/no-explicit-any
          }}
          className="px-3 py-1.5 rounded bg-[#404040] hover:bg-[#505050] text-xs transition-colors"
        >
          Ctrl+Alt+Del
        </button>
      </div>
    </div>
  );
};

// ─── VM Console Tabs Component ──────────────────────────────
// Combines serial console and VNC display with tab switching.

interface VMConsoleTabsProps {
  vmId: string;
  qmpSocket: { type: 'tcp' | 'unix'; address?: string; port?: number };
  vncPort?: number;
}

export const VMConsoleTabs: React.FC<VMConsoleTabsProps> = ({ vmId, qmpSocket, vncPort }) => {
  const [activeTab, setActiveTab] = useState<'serial' | 'vnc'>('serial');
  
  // Only show VNC tab if TCP connection is available (not Unix socket)
  const hasVncSupport = qmpSocket.type === 'tcp' && qmpSocket.port;

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="px-3 py-2 bg-[#181825]/80 border-b border-[#313244] flex gap-2">
        <button
          onClick={() => setActiveTab('serial')}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            activeTab === 'serial' ? 'bg-[#89b4fa]/10 text-[#89b4fa]' : 'text-[#6c7086] hover:bg-[#313244]'
          }`}
        >
          {'\u{1F4A1}'} Serial Console
        </button>
        {hasVncSupport && (
          <button
            onClick={() => setActiveTab('vnc')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'vnc' ? 'bg-[#89b4fa]/10 text-[#89b4fa]' : 'text-[#6c7086] hover:bg-[#313244]'
            }`}
          >
            {'\u{1F5A5}'} VNC Display
          </button>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'serial' && (
          <VMSerialConsole vmId={vmId} qmpSocket={qmpSocket} />
        )}
        {activeTab === 'vnc' && hasVncSupport && (
          <VMDisplay vmId={vmId} vncPort={qmpSocket.port} />
        )}
      </div>
    </div>
  );
};

// ─── Per-Architecture Console Notes ──────────────────────────────
// Per architecture's -serial and -vga docs — what to expect for each VM type.

export const CONSOLE_ARCH_NOTES: Record<ArchitectureType, string> = {
  x86_64: 'Standard VGA output (std) — use VNC tab if available, otherwise serial mon mode for boot logs.',
  i386:   'Legacy VGA (std) — same as x86_64 but with fewer display options.',
  aarch64: 'UEFI firmware console via serial mon — UEFI output only visible in serial console.',
  armv7l:  'Serial console for ARM boot logs — no VNC support on embedded boards.',
  riscv64: 'SBI firmware console via serial — no traditional VGA, use serial mon mode.',
  riscv32: 'Same as RISC-V 64-bit — serial only per -device loader docs.',
  avr:     'AVR MCU has NO console output — boot directly to flash (per -bios firmware.hex docs).',
  mips:    'Standard VGA for Malta board — serial mon mode available via -serial.',
  mips64:  'Same as MIPS32 but with 64-bit console.',
  mipsel:  'Little-endian variant — same console behavior.',
  mips64el: 'Same as MIPS64LE — serial only per -serial docs.',
  ppc:     'G3 Beige VGA output — serial mon mode for boot logs.',
  ppc64:   'pseries board — standard VGA with serial fallback.',
  ppcemb:  'Embedded PPC — no VGA, use serial mon mode (per -device docs).',
  sparc:   'SUN4m architecture — VNC output via -vnc or serial for boot logs.',
  sparc64: 'Sun4v Niagara — standard VGA with serial fallback.',
};

// ─── Helper to get console arch note by VM instance info.

export function getArchConsoleNote(vmId: string, architecture: ArchitectureType): string {
  return CONSOLE_ARCH_NOTES[architecture] || CONSOLE_ARCH_NOTES['x86_64']; // Default to x86_64 if unknown (per QEMU docs)
}