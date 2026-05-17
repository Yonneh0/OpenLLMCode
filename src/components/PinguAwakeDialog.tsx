// Pingu Awake Dialog — shown after GGUF loaded but before llama.cpp binary found (Phase 3)
import React, { useState } from 'react';
import { usePinguStore } from '../store/pinguStore';

// ─── Main Awake Dialog Component ──────────────

export function PinguAwakeDialog({ onClose }: { onClose: () => void }) {
  const setHasLlamaCpp = usePinguStore(s => s.setHasLlamaCpp);
  
  // Helper to call pingu IPC — uses window.pingu (not window.electron)
  const pinguAPI = typeof window !== 'undefined' ? (window as any).pingu : null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      {/* Backdrop — click to close */}
      <div className="absolute inset-0" onClick={onClose} />
      
      {/* Dialog */}
      <div className="relative rounded-xl shadow-2xl border border-[#45475a] w-[680px] max-h-[90vh] overflow-y-auto bg-[#1e1e2e]">
        {/* Header — Pingu with glowing eyes + title */}
        <AwakeDialogHeader />
        
        {/* Content */}
        <div className="p-4 space-y-5">
          {/* Status banner */}
          <StatusBanner />
          
          {/* llama.cpp binary section */}
          <LlamaCppSection 
            pinguAPI={pinguAPI}
            onDone={() => setHasLlamaCpp(true)}
          />
        </div>
        
        {/* Footer — close button */}
        <div className="px-4 py-3 border-t border-[#45475a] flex justify-end">
          <button 
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs bg-[#313244] hover:bg-[#45475a] transition"
          >
            Close — I'll set up llama.cpp later
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Awake Dialog Header (SVG) ──────────────

function AwakeDialogHeader({ onClose }: { onClose?: () => void }) {
  return (
    <div className="px-4 py-3 border-b border-[#45475a] flex items-center gap-3">
      {/* Pingu with glowing eyes — awake but no llama.cpp yet */}
      <svg width="36" height="40" viewBox="0 0 36 40" className="flex-shrink-0">
        {/* Body */}
        <ellipse cx="18" cy="37" rx="12" ry="3.5" fill="#F9E2AF"/>
        <circle cx="18" cy="24" r="13" fill="#8B5E3C"/>
        {/* Glowing eyes */}
        <circle cx="10" cy="18" r="6" fill="#FFD93D" stroke="#5C2716" strokeWidth="2">
          <animate attributeName="r" values="6;7;6" dur="1.5s" repeatCount="indefinite"/>
        </circle>
        <circle cx="26" cy="18" r="6" fill="#FFD93D" stroke="#5C2716" strokeWidth="2">
          <animate attributeName="r" values="6;7;6" dur="1.5s" repeatCount="indefinite"/>
        </circle>
        {/* Pupils */}
        <circle cx="10.5" cy="17" r="2.5" fill="#5C2716">
          <animate attributeName="r" values="2;3;2" dur="1.5s" repeatCount="indefinite"/>
        </circle>
        <circle cx="26.5" cy="17" r="2.5" fill="#5C2716">
          <animate attributeName="r" values="2;3;2" dur="1.5s" repeatCount="indefinite"/>
        </circle>
        {/* Beak */}
        <ellipse cx="18" cy="22" rx="3.5" ry="2" fill="#D97B3A">
          <animate attributeName="ry" values="2;3;2" dur="1s" repeatCount="indefinite"/>
        </ellipse>
      </svg>
      
      {/* Title */}
      <div className="flex-1">
        <h2 className="text-sm font-semibold text-[#cdd6f4]">Pingu is Awake!</h2>
        <p className="text-xs text-[#a6adc8] opacity-70">But Pingu needs a llama.cpp binary to run your model.</p>
      </div>
      
      {/* Close button */}
      {onClose && (
        <button 
          onClick={onClose}
          className="p-1 rounded hover:bg-[#313244] transition text-sm"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ─── Status Banner ──────────────

function StatusBanner() {
  const hasGguf = usePinguStore(s => s.hasGguf);
  
  if (!hasGguf) return null;
  
  return (
    <div className="rounded bg-green-900/15 border border-green-700/40 px-3 py-2 text-xs text-green-300">
      ✓ Model loaded successfully — Pingu is ready to go! Just need llama.cpp first.
    </div>
  );
}

// ─── llama.cpp Binary Section ──────────────

interface LlamaCppSectionProps {
  pinguAPI: typeof window.pingu | null;
  onDone: () => void;
}

function LlamaCppSection({ pinguAPI, onDone }: LlamaCppSectionProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  return (
    <div className="rounded-lg border border-[#45475a] p-3">
      {/* Title */}
      <h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-2 flex items-center gap-1.5">
        🔧 llama.cpp Binary
      </h3>
      
      {/* Download options */}
      <div className="space-y-4">
        {/* Option 1: Pre-built binary from GitHub */}
        <LlamaCppBinaryDownload 
          pinguAPI={pinguAPI}
          downloading={downloading}
          progress={progress}
          onDownload={async () => {
            setDownloading(true);
            
            try {
              const result = await pinguAPI?.downloadLlamaCpp({
                onProgress: (pct: number) => setProgress(pct),
              });
              
              if (result?.success) {
                onDone(); // Pingu awakens!
              }
            } catch {
              // Download failed — show error
            } finally {
              setDownloading(false);
            }
          }}
        />
        
        {/* Divider */}
        <div className="border-t border-[#45475a]" />
        
        {/* Option 2: Drag-and-drop .zip file */}
        <DragDropZipSection 
          pinguAPI={pinguAPI}
          onDone={() => onDone()}
        />
      </div>
    </div>
  );
}

// ─── llama.cpp Binary Download (inline section) ──────────────

interface LlamaCppBinaryDownloadProps {
  pinguAPI: typeof window.pingu | null;
  downloading: boolean;
  progress: number;
  onDownload: () => void;
}

function LlamaCppBinaryDownload({ pinguAPI, downloading, progress, onDownload }: LlamaCppBinaryDownloadProps) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-[#a6adc8] mb-1">Option 1: Download pre-built binary</h4>
      <p className="text-xs text-[#a6adc8] opacity-50 mb-2">We'll download the latest llama.cpp release for your platform.</p>
      
      {downloading ? (
        <div className="space-y-1.5">
          {/* Progress bar */}
          <div className="w-full h-[4px] rounded bg-[#313244] overflow-hidden">
            <div 
              className="h-full bg-green-300 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-[#a6adc8] opacity-70">{progress}% downloaded</span>
        </div>
      ) : (
        <button
          onClick={onDownload}
          className="w-full px-3 py-1.5 rounded text-xs font-semibold bg-cyan-900/30 hover:bg-cyan-800/40 text-cyan-300 border border-cyan-700/40 transition"
        >
          Download llama.cpp Binary →
        </button>
      )}
    </div>
  );
}

// ─── Drag-and-Drop .zip Section (for llama.cpp) ──────────────

function DragDropZipSection({ pinguAPI, onDone }: { 
  pinguAPI: typeof window.pingu | null;
  onDone: () => void 
}) {
  const [isDragging, setIsDragging] = useState(false);
  
  return (
    <div>
      <h4 className="text-xs font-semibold text-[#a6adc8] mb-1">Option 2: Provide your own llama.cpp</h4>
      <p className="text-xs text-[#a6adc8] opacity-50 mb-2">Drop a .zip file containing either the source tree or pre-built binaries.</p>
      
      {/* Drag-and-drop zone */}
      <div 
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition ${
          isDragging 
            ? 'border-cyan-300 bg-cyan-900/15' 
            : 'border-[#45475a] hover:border-[#6c7086]'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setIsDragging(false);
          
          const file = e.dataTransfer.files[0];
          if (file && file.name.endsWith('.zip')) {
            // Extract and install via IPC
            const result = await pinguAPI?.installLlamaCppFromZip(file as unknown as File);
            if (result?.success) onDone();
          }
        }}
      >
        <span className="text-lg">📁</span>
        <p className="text-xs text-[#a6adc8] opacity-70 mt-1">Drop a .zip file here</p>
        {pinguAPI && (
          <button 
            onClick={async () => {
              const filePath = await pinguAPI.selectLlamaCppZip();
              if (filePath) {
                try {
                  // Call IPC directly — need to import electron for this
                  // Since contextIsolation is false, we can use require or window.require
                  const { ipcRenderer } = (window as any).require('electron');
                  const result = await ipcRenderer.invoke('pingu-install-llama-cpp-zip', { filePath });
                  if (result?.success) {
                    onDone();
                  }
                } catch (err) {
                  console.error('Failed to install llama.cpp from zip:', err);
                }
              }
            }}
            className="mt-2 px-3 py-1 rounded text-xs bg-[#313244] hover:bg-[#45475a] transition"
          >
            Browse files...
          </button>
        )}
      </div>
    </div>
  );
}

// ─── CSS Animations (inline styles) ──────────────

const styleTag = document.createElement('style');
styleTag.textContent = `
@keyframes pulse-slow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
.animate-pulse-slow { animation: pulse-slow 2s ease-in-out infinite; }
`;
document.head.appendChild(styleTag);