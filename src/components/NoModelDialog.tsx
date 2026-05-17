// No-Model Dialog — Pingu's loading interface when no GGUF is present (Phase 2)
import React, { useState, useEffect } from 'react';
import { usePinguStore } from '../store/pinguStore';

// ─── Hardware-aware model recommendations ──────────────

interface ModelRecommendation {
  name: string;
  url: string;
  sizeMB: number;
  quantization: string;
  minVRAM: number; // MB required on GPU for optimal performance
  minRAM: number; // MB required on RAM for CPU-only inference
  description: string;
}

const MODEL_RECOMMENDATIONS: ModelRecommendation[] = [
  {
    name: 'IBM-Grok4-UltraFast-Coder-1B',
    url: 'https://huggingface.co/mradermacher/IBM-Grok4-UltraFast-Coder-1B-GGUF',
    sizeMB: 965, // Q8_0
    quantization: 'Q8_0',
    minVRAM: 2048,
    minRAM: 3072,
    description: 'Ultra-fast coding assistant — great for quick completions on any hardware.',
  },
  {
    name: 'Gemma-3-1B-AWQ',
    url: 'https://huggingface.co/bartowski/gemma-3-1b-it-AWQ-GGUF',
    sizeMB: 892, // Q8_0 equivalent
    quantization: 'Q8_0',
    minVRAM: 2048,
    minRAM: 3072,
    description: "Google's Gemma — excellent at coding and reasoning tasks.",
  },
  {
    name: 'Phi-3.5-mini-Instruct',
    url: 'https://huggingface.co/microsoft/Phi-3.5-mini-instruct-gguf',
    sizeMB: 2901, // Q8_0
    quantization: 'Q8_0',
    minVRAM: 4096,
    minRAM: 5120,
    description: "Microsoft's Phi-3.5 — best quality but needs more VRAM/RAM.",
  },
];

// ─── Main No-Model Dialog Component ──────────────

export function NoModelDialog({ onClose }: { onClose: () => void }) {
  const setHasGguf = usePinguStore(s => s.setHasGguf);
  const setHasLlamaCpp = usePinguStore(s => s.setHasLlamaCpp);
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      {/* Backdrop — click to close */}
      <div className="absolute inset-0" onClick={onClose} />
      
      {/* Dialog */}
      <div className="relative rounded-xl shadow-2xl border border-[#45475a] w-[680px] max-h-[90vh] overflow-y-auto bg-[#1e1e2e]">
        {/* Header — Pingu dangling + title */}
        <NoModelDialogHeader />
        
        {/* Content */}
        <div className="p-4 space-y-5">
          {/* Hardware status section */}
          <HardwareStatusSection />
          
          {/* Model recommendation section (includes both GGUF + llama.cpp) */}
          <ModelRecommendationSection 
            setHasGguf={setHasGguf}
            setHasLlamaCpp={setHasLlamaCpp}
          />
          
          {/* Drag-and-drop zone for GGUF files */}
          <DragDropGgufSection onFileDropped={() => {}} />
        </div>
        
        {/* Footer — close button */}
        <div className="px-4 py-3 border-t border-[#45475a] flex justify-end">
          <button 
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs bg-[#313244] hover:bg-[#45475a] transition"
          >
            Close — I'll set this up later
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── No-Model Dialog Header (SVG) ──────────────

function NoModelDialogHeader() {
  return (
    <div className="px-4 py-3 border-b border-[#45475a] flex items-center gap-3">
      {/* Dangling Pingu icon */}
      <svg width="36" height="40" viewBox="0 0 36 40" className="flex-shrink-0">
        <ellipse cx="18" cy="37" rx="12" ry="3.5" fill="#F9E2AF"/>
        <circle cx="18" cy="24" r="13" fill="#8B5E3C">
          <animate attributeName="cy" values="24;26;24" dur="5s" repeatCount="indefinite"/>
          <animate attributeName="r" values="13;12.5;13" dur="5s" repeatCount="indefinite"/>
        </circle>
        <path d="M10 18 Q14.5 17 19 18" stroke="#5C2716" strokeWidth="1.5" fill="none"/>
        <path d="M19 18 Q23.5 17 28 18" stroke="#5C2716" strokeWidth="1.5" fill="none"/>
        <ellipse cx="18" cy="22" rx="2.5" ry="1.8" fill="#D97B3A">
          <animate attributeName="cy" values="22;24;22" dur="5s" repeatCount="indefinite"/>
        </ellipse>
        <ellipse cx="18" cy="30" rx="8" ry="4.5" fill="#F9E2AF">
          <animate attributeName="cy" values="30;32;30" dur="5s" repeatCount="indefinite"/>
        </ellipse>
      </svg>
      
      {/* Title */}
      <div className="flex-1">
        <h2 className="text-sm font-semibold text-[#cdd6f4]">Pingu Needs a Model</h2>
        <p className="text-xs text-[#a6adc8] opacity-70">Click or drag a GGUF file to load one, or use the options below.</p>
      </div>
      
      {/* Close button */}
      <button 
        onClick={() => {}} // No-op — close handled by parent dialog click
        className="p-1 rounded hover:bg-[#313244] transition text-sm"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Hardware Status Section ──────────────

function HardwareStatusSection() {
  const [hardware, setHardware] = useState<{
    platform: string;
    gpu?: string;
    ramGB: number;
  } | null>(null);
  
  useEffect(() => {
    window.electron?.getHardwareInfo().then((info: any) => {
      if (info) setHardware(info);
    });
  }, []);
  
  return (
    <div className="rounded-lg border border-[#45475a] p-3">
      <h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-2 flex items-center gap-1.5">
        🔧 Your Hardware
      </h3>
      
      {hardware ? (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-[#a6adc8] opacity-50 block mb-0.5">Platform</span>
            <span className="text-[#cdd6f4]">{hardware.platform === 'win32' ? 'Windows' : hardware.platform === 'darwin' ? 'macOS' : 'Linux'}</span>
          </div>
          
          <div>
            <span className="text-[#a6adc8] opacity-50 block mb-0.5">GPU</span>
            {hardware.gpu ? (
              <span className={`font-semibold ${
                hardware.gpu.toLowerCase().includes('nvidia') ? 'text-green-300' :
                hardware.platform === 'darwin' && hardware.gpu.includes('Apple') ? 'text-yellow-300' :
                'text-cyan-300'
              }`}>
                {hardware.gpu} ✓
              </span>
            ) : (
              <span className="text-red-400">No GPU detected — CPU only</span>
            )}
          </div>
          
          <div>
            <span className="text-[#a6adc8] opacity-50 block mb-0.5">System RAM</span>
            <span className="text-[#cdd6f4]">{hardware.ramGB} GB</span>
          </div>
          
          <div>
            <span className="text-[#a6adc8] opacity-50 block mb-0.5">GPU VRAM (estimated)</span>
            {hardware.gpu ? (
              <span className="text-cyan-300">{Math.round(hardware.ramGB * 0.125)} GB estimated</span>
            ) : (
              <span className="text-[#a6adc8] opacity-50">N/A — CPU only</span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-[#a6adc8] opacity-70">
          <span className="animate-pulse-slow">●</span> Detecting hardware...
        </div>
      )}
      
      {hardware && !hardware.gpu && (
        <div className="mt-3 rounded bg-yellow-900/15 border border-yellow-700/40 px-3 py-2 text-xs text-yellow-300">
          ⚠️ No GPU detected — models will run on CPU. Consider adding a GPU for 10-50x faster inference.
        </div>
      )}
    </div>
  );
}

// ─── Model Recommendation Section (with both GGUF + llama.cpp in one section) ──────────────

interface ModelRecommendationSectionProps {
  setHasGguf: (has: boolean) => void;
  setHasLlamaCpp: (has: boolean) => void;
}

function ModelRecommendationSection({ setHasGguf, setHasLlamaCpp }: ModelRecommendationSectionProps) {
  return (
    <div className="rounded-lg border border-[#45475a] p-3">
      {/* Title */}
      <h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-2 flex items-center gap-1.5">
        📦 Recommended Models & Binary
      </h3>
      
      {/* Hardware-aware recommendation banner */}
      {(() => {
        const hasGPU = typeof window !== 'undefined' && 
          (window as any).pinguHardware?.gpu;
        
        if (!hasGPU) return null;
        
        return (
          <div className={`mb-3 rounded border px-3 py-2 text-xs ${
            hasGPU.toLowerCase().includes('nvidia') ? 'bg-green-900/15 border-green-700/40 text-green-300' :
            hasGPU.includes('Apple') ? 'bg-yellow-900/15 border-yellow-700/40 text-yellow-300' :
            'bg-cyan-900/15 border-cyan-700/40 text-cyan-300'
          }`}>
            💡 Based on your {hasGPU} GPU — these models will be WAY faster with GPU acceleration!
            <br />
            Larger models may not fit in VRAM and could fall back to CPU.
          </div>
        );
      })()}
      
      {/* Model cards */}
      <div className="space-y-3">
        {MODEL_RECOMMENDATIONS.map((model) => (
          <ModelCard 
            key={model.name}
            model={model}
            onDownload={() => setHasGguf(true)}
          />
        ))}
      </div>
      
      {/* Divider */}
      <div className="border-t border-[#45475a] my-3" />
      
      {/* llama.cpp binary download */}
      <LlamaCppBinaryDownload 
        onDone={() => setHasLlamaCpp(true)}
      />
    </div>
  );
}

// ─── Model Card Component ──────────────

interface ModelCardProps {
  model: ModelRecommendation;
  onDownload: () => void;
}

function ModelCard({ model, onDownload }: ModelCardProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // Quantization option selector — default to Q8_0 per user spec
  const [quantMode, setQuantMode] = useState(model.quantization);
  
  const handleDownload = async () => {
    setDownloading(true);
    
    try {
      const result = await (window as any).electron?.downloadGguf({
        url: model.url,
        quantization: quantMode,
        onProgress: (pct: number) => setProgress(pct),
      });
      
      if (result?.success) {
        onDownload(); // Pingu awakens!
      }
    } catch {
      // Download failed — show error
    } finally {
      setDownloading(false);
    }
  };
  
  return (
    <div className="rounded bg-[#1e1e2e]/60 border border-[#45475a] p-3">
      {/* Model name + size */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-[#cdd6f4]">{model.name}</span>
        <span className={`px-2 py-0.5 rounded border text-xs ${
          quantMode.startsWith('Q8') ? 'bg-green-900/30 text-green-300 border-green-700/30' :
          quantMode.startsWith('Q6') ? 'bg-cyan-900/30 text-cyan-300 border-cyan-700/30' :
          quantMode.startsWith('Q5') ? 'bg-yellow-900/30 text-yellow-300 border-yellow-700/30' :
          'bg-orange-900/30 text-orange-300 border-orange-700/30'
        }`}>
          {quantMode} — {Math.round(model.sizeMB / 1024 * (quantMode.startsWith('Q8') ? 1 : quantMode.startsWith('Q6') ? 0.85 : quantMode.startsWith('Q5') ? 0.65 : 0.4))}GB
        </span>
      </div>
      
      {/* Description */}
      <p className="text-xs text-[#a6adc8] opacity-70 mb-2">{model.description}</p>
      
      {/* VRAM/RAM requirements */}
      <div className="flex items-center gap-3 text-xs text-[#a6adc8] opacity-50 mb-2">
        <span>VRAM: {Math.round(model.minVRAM / 1024)}GB min</span>
        <span>RAM: {Math.round(model.minRAM / 1024)}GB min (CPU)</span>
      </div>
      
      {/* Quantization selector — default Q8_0, options: Q4_K_M, Q5_K_M, Q6_K */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-[#a6adc8] opacity-50">Quant:</span>
        {['Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0'].map((q) => (
          <button
            key={q}
            onClick={() => setQuantMode(q)}
            className={`px-2 py-0.5 rounded text-xs ${
              quantMode === q 
                ? 'bg-[#cba6f7]/30 text-[#cba6f7] border border-[#cba6f7]/40' 
                : 'bg-[#313244] text-[#a6adc8]'
            }`}
          >
            {q}
          </button>
        ))}
      </div>
      
      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={downloading}
        className={`w-full px-3 py-1.5 rounded text-xs font-semibold transition ${
          downloading 
            ? 'bg-yellow-900/40 text-[#a67c5b]' 
            : 'bg-green-900/30 hover:bg-green-800/40 text-green-300 border border-green-700/40'
        }`}
      >
        {downloading ? `Downloading ${progress}%` : 'Download'}
      </button>
    </div>
  );
}

// ─── llama.cpp Binary Download (inline section) ──────────────

interface LlamaCppBinaryDownloadProps {
  onDone: () => void;
}

function LlamaCppBinaryDownload({ onDone }: LlamaCppBinaryDownloadProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const handleDownload = async () => {
    setDownloading(true);
    
    try {
      const result = await (window as any).electron?.downloadLlamaCpp({
        onProgress: (pct: number) => setProgress(pct),
      });
      
      if (result?.success) {
        onDone();
      }
    } catch {
      // Download failed
    } finally {
      setDownloading(false);
    }
  };
  
  return (
    <div>
      <h4 className="text-xs font-semibold text-[#a6adc8] mb-1">Download llama.cpp binary</h4>
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
          onClick={handleDownload}
          className="w-full px-3 py-1.5 rounded text-xs font-semibold bg-cyan-900/30 hover:bg-cyan-800/40 text-cyan-300 border border-cyan-700/40 transition"
        >
          Download llama.cpp Binary →
        </button>
      )}
    </div>
  );
}

// ─── Drag-and-Drop .zip Section (for GGUF files) ──────────────

function DragDropGgufSection({ onFileDropped }: { onFileDropped: (path: string, quantMode: string) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  
  return (
    <div>
      <h4 className="text-xs font-semibold text-[#a6adc8] mb-1">Or drag a GGUF file</h4>
      
      {/* Drag-and-drop zone */}
      <div 
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition ${
          isDragging 
            ? 'border-cyan-300 bg-cyan-900/15' 
            : 'border-[#45475a] hover:border-[#6c7086]'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          
          const file = e.dataTransfer.files[0];
          if (file && file.name.endsWith('.gguf')) {
            // Copy to models/ via IPC, prompt for quantization selection
            window.electron?.loadGgufFromFile(file.path).then((result: any) => {
              onFileDropped(file.path, result.quantMode);
            });
          }
        }}
      >
        <span className="text-lg">📁</span>
        <p className="text-xs text-[#a6adc8] opacity-70 mt-1">Drop a .gguf file here</p>
        <button 
          onClick={() => window.electron?.selectGgufFile().then((path: string) => {
            if (path) onFileDropped(path, 'Q8_0'); // Default to Q8_0 for file browser
          })}
          className="mt-2 px-3 py-1 rounded text-xs bg-[#313244] hover:bg-[#45475a] transition"
        >
          Browse files...
        </button>
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