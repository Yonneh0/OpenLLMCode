// Pingu Avatar — System AI mascot in the corner of the UI (Phase G-2)
import React, { useEffect, useRef, useCallback } from 'react';
import { usePinguStore, startBlinkTimer, stopBlinkTimer } from '../store/pinguStore';

interface PinguAvatarProps {
  position?: 'bottom-right' | 'top-right';
}

// Eye SVG — claymation-style with soft edges and subtle imperfections
const EYE_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="40" height="36" viewBox="0 0 40 36" xmlns="http://www.w3.org/2000/svg">
  <circle cx="14" cy="18" r="10" fill="#5C2716"/>
  <circle cx="26" cy="18" r="10" fill="#5C2716"/>
</svg>
`)}`;

// Eye SVG with blinking (closed eyes)
const BLINK_EYE_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="40" height="36" viewBox="0 0 40 36" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 18 Q14 18 24 18" stroke="#5C2716" stroke-width="3" fill="none"/>
  <path d="M16 18 Q26 18 36 18" stroke="#5C2716" stroke-width="3" fill="none"/>
</svg>
`)}`;

// Eye SVG with glowing (working/thinking state)
const GLOW_EYE_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="40" height="36" viewBox="0 0 40 36" xmlns="http://www.w3.org/2000/svg">
  <circle cx="14" cy="18" r="10" fill="#7A3E21"/>
  <circle cx="14" cy="18" r="5" fill="#FFD93D"/>
  <circle cx="26" cy="18" r="10" fill="#7A3E21"/>
  <circle cx="26" cy="18" r="5" fill="#FFD93D"/>
</svg>
`)}`;

// Mouth SVG — mouth open (speaking state) with animated frames
const MOUTH_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="40" height="20" viewBox="0 0 40 20" xmlns="http://www.w3.org/2000/svg">
  <path d="M5 10 Q20 18 35 10" stroke="#F9E2AF" stroke-width="2" fill="none"/>
</svg>
`)}`;

// Mouth SVG — mouth open wider (speaking animation frames)
const MOUTH_OPEN_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="40" height="30" viewBox="0 0 40 30" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="20" cy="15" rx="12" ry="8" fill="#F9E2AF"/>
  <path d="M8 10 Q20 22 32 10" stroke="#D4A574" stroke-width="1.5" fill="none"/>
</svg>
`)}`;

// Mouth SVG — mouth closed (idle/thinking)
const MOUTH_CLOSED_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="40" height="20" viewBox="0 0 40 20" xmlns="http://www.w3.org/2000/svg">
  <path d="M5 12 Q20 8 35 12" stroke="#F9E2AF" stroke-width="2" fill="none"/>
</svg>
`)}`;

// Mouth SVG — worried (error state)
const MOUTH_WORRIED_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="40" height="20" viewBox="0 0 40 20" xmlns="http://www.w3.org/2000/svg">
  <path d="M5 14 Q20 6 35 14" stroke="#F9E2AF" stroke-width="2" fill="none"/>
</svg>
`)}`;

// Mouth SVG — happy (task completed)
const MOUTH_HAPPY_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="40" height="25" viewBox="0 0 40 25" xmlns="http://www.w3.org/2000/svg">
  <path d="M5 18 Q20 28 35 18" stroke="#F9E2AF" stroke-width="2.5" fill="none"/>
</svg>
`)}`;

// Mouth SVG — working (slightly open)
const MOUTH_WORKING_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="40" height="22" viewBox="0 0 40 22" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="20" cy="12" rx="8" ry="5" fill="#F9E2AF"/>
</svg>
`)}`;

// Mouth SVG — thinking (very slightly open)
const MOUTH_THINKING_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg width="40" height="18" viewBox="0 0 40 18" xmlns="http://www.w3.org/2000/svg">
  <path d="M5 9 Q20 6 35 9" stroke="#F9E2AF" stroke-width="1.5" fill="none"/>
</svg>
`)}`;

export function PinguAvatar({ position = 'bottom-right' }: PinguAvatarProps) {
  const mood = usePinguStore((s) => s.mood);
  const isVisible = usePinguStore((s) => s.isVisible);
  const isBlinking = usePinguStore((s) => s.isBlinking);
  const mouthFrame = usePinguStore((s) => s.mouthFrame);
  const bobSpeed = usePinguStore((s) => s.bobSpeed);
  
  // Refs for animation loop — access without re-renders
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  
  // Eye SVG based on blink state and mood
  const getEyeSVG = useCallback(() => {
    if (isBlinking) return BLINK_EYE_SVG;
    
    switch (mood) {
      case 'thinking':
      case 'working':
        return GLOW_EYE_SVG; // Eyes glow during thinking/working
      default:
        return EYE_SVG;
    }
  }, [isBlinking, mood]);

  // Mouth SVG based on mood and mouth animation frame
  const getMouthSVG = useCallback(() => {
    switch (mood) {
      case 'happy':
        return MOUTH_HAPPY_SVG;
      case 'error':
        return MOUTH_WORRIED_SVG;
      case 'speaking':
        // Alternate between open frames during speech
        if (mouthFrame % 3 === 0) return MOUTH_OPEN_SVG;
        return MOUTH_SVG;
      case 'thinking':
      case 'working':
        return MOUTH_THINKING_SVG;
      default:
        return MOUTH_CLOSED_SVG;
    }
  }, [mood, mouthFrame]);

  // CSS animation class for body bob — changes speed based on mood
  const getBobClass = useCallback(() => {
    switch (mood) {
      case 'idle':
        return `animate-pulse-slow`;
      case 'thinking':
      case 'working':
        return `animate-bob-${bobSpeed * 100}`; // Dynamic animation speed class
      case 'speaking':
        return `animate-bob-200`; // Faster bob while speaking
      case 'happy':
        return `animate-jump-50`; // Jump/spin during happy state
      default:
        return '';
    }
  }, [mood, bobSpeed]);

  // Position class based on props
  const getPositionClass = useCallback(() => {
    switch (position) {
      case 'top-right':
        return 'top-4 right-4';
      default:
        return 'bottom-4 right-4';
    }
  }, [position]);

  // Mouse tracking for eye-following — using requestAnimationFrame for smooth updates
  useEffect(() => {
    if (!isVisible) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // Calculate normalized direction from avatar center to cursor
      const dx = (e.clientX - centerX) / (rect.width * 0.5);
      const dy = (e.clientY - centerY) / (rect.height * 0.5);
      
      usePinguStore.getState().setCursorPos(dx, dy);
    };

    document.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isVisible]);

  // Start blink timer on mount — only once per session
  useEffect(() => {
    if (isVisible) {
      startBlinkTimer();
    }
    
    return stopBlinkTimer;
  }, [isVisible]);

  // Glow effect for thinking/working states
  const getGlowClass = useCallback(() => {
    switch (mood) {
      case 'thinking':
        return 'animate-glow-50'; // Slow glow while thinking
      case 'working':
        return 'animate-glow-100'; // Faster glow while working
      default:
        return '';
    }
  }, [mood]);

  if (!isVisible) {
    // Minimal "show Pingu" button when hidden
    return (
      <button 
        onClick={usePinguStore.getState().showPingu}
        className="fixed bottom-4 right-4 w-8 h-8 rounded-full bg-[#5C2716] hover:bg-[#7A3E21] transition cursor-pointer z-50"
        title="Show Pingu"
      >
        <svg width="20" height="16" viewBox="0 0 40 36">
          <circle cx="14" cy="18" r="10" fill="#F9E2AF"/>
          <circle cx="26" cy="18" r="10" fill="#F9E2AF"/>
        </svg>
      </button>
    );
  }

  return (
    <>
      {/* Pingu Avatar Container — fixed position in corner */}
      <div 
        ref={containerRef}
        className={`fixed ${getPositionClass()} z-50 cursor-pointer group`}
        onClick={usePinguStore.getState().toggleMenu}
        title="Click to open Pingu menu"
      >
        {/* Glow effect for thinking/working */}
        <div className={`absolute inset-0 rounded-full blur-md transition-all duration-1000 ${getGlowClass()}`}>
          {mood === 'thinking' && (
            <div className="w-full h-full bg-yellow-300/20 animate-pulse-slow" />
          )}
          {mood === 'working' && (
            <div className="w-full h-full bg-yellow-300/40 animate-bounce-slow" />
          )}
        </div>

        {/* Pingu Body — claymation-style with soft edges and subtle imperfections */}
        <div 
          className={`relative ${getBobClass()} transition-transform duration-200`}
          style={{ 
            animationDuration: mood === 'speaking' ? '0.15s' : undefined,
          }}
        >
          {/* Body — warm brown claymation body */}
          <div className="w-[64px] h-[72px] bg-gradient-to-b from-[#8B5E3C] via-[#5C2716] to-[#3D1A0A] rounded-3xl shadow-lg border border-[#F9E2AF]/20">
            {/* Eyes */}
            <div className="relative flex justify-center mt-4 -mb-2">
              <img 
                src={getEyeSVG()} 
                alt="Pingu eyes"
                className={`w-10 h-9 transition-opacity duration-150 ${isBlinking ? 'opacity-80' : ''}`}
              />
            </div>
            
            {/* Mouth */}
            <div className="flex justify-center mt-2 -mb-1">
              <img 
                src={getMouthSVG()} 
                alt="Pingu mouth"
                className={`w-8 h-auto transition-all duration-100 ${mood === 'speaking' ? 'animate-bounce-slow' : ''}`}
              />
            </div>
            
            {/* Small feet */}
            <div className="flex justify-center gap-3 -mt-1">
              <div className="w-4 h-[8px] bg-gradient-to-t from-[#5C2716] to-[#8B5E3C] rounded-b-full" />
              <div className="w-4 h-[8px] bg-gradient-to-t from-[#5C2716] to-[#8B5E3C] rounded-b-full" />
            </div>
          </div>

          {/* Happy animation overlay — jump/spin effect */}
          {mood === 'happy' && (
            <div className="absolute -top-2 left-0 w-full h-[100px] flex items-start justify-center pointer-events-none">
              <span className="text-2xl animate-bounce-slow">✨</span>
            </div>
          )}

          {/* Error animation overlay — worried expression */}
          {mood === 'error' && (
            <div className="absolute -top-2 left-0 w-full h-[100px] flex items-start justify-center pointer-events-none">
              <span className="text-xl animate-pulse-slow" style={{ animationDelay: '300ms' }}>😟</span>
            </div>
          )}

          {/* Working/thinking glow overlay */}
          {(mood === 'thinking' || mood === 'working') && (
            <div className="absolute -inset-2 bg-yellow-300/10 rounded-full animate-pulse-slow" />
          )}
        </div>

        {/* Tooltip on hover */}
        <div className={`opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-[#1e1e2e] border border-[#45475a] rounded text-xs whitespace-nowrap shadow-lg ${mood === 'speaking' ? 'animate-pulse-slow' : ''}`}>
          <div className="flex items-center gap-2">
            <span>🐧 Pingu</span>
            {mood === 'idle' && (
              <span className="text-[#a6adc8] opacity-70">— I'm here!</span>
            )}
            {mood === 'thinking' && (
              <span className="text-yellow-300">— Thinking...</span>
            )}
            {mood === 'speaking' && (
              <span className="text-green-300">— Speaking</span>
            )}
            {mood === 'working' && (
              <span className="text-yellow-300">— Working!</span>
            )}
            {mood === 'happy' && (
              <span className="text-green-300">— Task complete! 🎉</span>
            )}
            {mood === 'error' && (
              <span className="text-red-400">— Something went wrong</span>
            )}
          </div>
        </div>
      </div>

      {/* Pingu Menu Panel — opens when clicking Pingu */}
      {usePinguStore.getState().isMenuOpen && (
        <PinguMenu onClose={usePinguStore.getState().closeMenu} />
      )}

      {/* Inline styles for custom animations not in Tailwind config */}
      <style>{`
        @keyframes bob-50 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        @keyframes bob-75 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes bob-100 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes bob-200 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes glow-50 {
          0%, 100% { box-shadow: 0 0 8px rgba(255, 217, 61, 0.3); }
          50% { box-shadow: 0 0 16px rgba(255, 217, 61, 0.6); }
        }
        @keyframes glow-100 {
          0%, 100% { box-shadow: 0 0 12px rgba(255, 217, 61, 0.4); }
          50% { box-shadow: 0 0 24px rgba(255, 217, 61, 0.8); }
        }
        @keyframes jump-50 {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-8px) rotate(-3deg); }
          50% { transform: translateY(-4px) rotate(0deg); }
          75% { transform: translateY(-10px) rotate(3deg); }
        }
        
        .animate-bob-50 { animation: bob-50 2s ease-in-out infinite; }
        .animate-bob-75 { animation: bob-75 1.5s ease-in-out infinite; }
        .animate-bob-100 { animation: bob-100 1s ease-in-out infinite; }
        .animate-bob-200 { animation: bob-200 0.6s ease-in-out infinite; }
        
        .animate-glow-50 { animation: glow-50 3s ease-in-out infinite; }
        .animate-glow-100 { animation: glow-100 2s ease-in-out infinite; }
        
        .animate-jump-50 { animation: jump-50 1.5s ease-in-out infinite; }
      `}</style>
    </>
  );
}

// ─── Pingu Menu Panel ──────────────

function PinguMenu({ onClose }: { onClose: () => void }) {
  const mood = usePinguStore((s) => s.mood);
  
  // Get current model info from stores for the "Manage Models" menu item
  const models = []; // Would be loaded from ModelManager store
  
  return (
    <div className="fixed bottom-20 right-4 z-50 w-64">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-transparent" 
        onClick={onClose}
      />

      {/* Menu Panel */}
      <div className="relative rounded-lg border border-[#45475a] shadow-xl overflow-hidden bg-[#1e1e2e]">
        {/* Header with Pingu icon */}
        <div className="px-3 py-2 border-b border-[#45475a] flex items-center gap-2">
          <img src={EYE_SVG} alt="" className="w-6 h-5" />
          <span className="text-sm font-semibold text-[#cdd6f4]">Pingu</span>
          {mood === 'idle' && (
            <span className="ml-auto px-1.5 py-0.5 rounded bg-green-900/30 text-green-300 border border-green-700/30 text-xs">Online</span>
          )}
          {mood === 'thinking' && (
            <span className="ml-auto px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-300 border border-yellow-700/30 text-xs">Thinking</span>
          )}
          {mood === 'speaking' && (
            <span className="ml-auto px-1.5 py-0.5 rounded bg-green-900/30 text-green-300 border border-green-700/30 text-xs">Speaking</span>
          )}
        </div>

        {/* Menu Items */}
        <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
          <MenuButton 
            icon="🛠️" 
            label="Agent Skills" 
            subtitle="Manage task extensions"
            onClick={() => console.log('Open skills panel')}
          />
          
          <MenuButton 
            icon="⚙️" 
            label="Settings" 
            subtitle="Engine, models, auth config"
            onClick={() => console.log('Open settings')}
          />
          
          <MenuButton 
            icon="📦" 
            label="Manage Models" 
            subtitle={`${models.length} local + HuggingFace`}
            onClick={() => console.log('Open model manager')}
          />
          
          <MenuButton 
            icon="🔧" 
            label="Compile Engine" 
            subtitle="llama.cpp build status"
            onClick={() => console.log('Show compile status')}
          />
          
          <MenuButton 
            icon="📋" 
            label="Activity Log" 
            subtitle="System AI activity log"
            onClick={() => console.log('Open activity log')}
          />
          
          <div className="border-t border-[#45475a] my-1.5" />
          
          {/* Status indicator row */}
          <div className="px-2 py-1 text-xs flex items-center justify-between">
            <span className="text-[#a6adc8] opacity-70">Status</span>
            {mood === 'idle' && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse-slow" />
                Online
              </span>
            )}
            {mood === 'thinking' && (
              <span className="flex items-center gap-1 text-yellow-300">
                <span className="w-2 h-2 rounded-full bg-yellow-300 animate-pulse-slow" />
                Thinking...
              </span>
            )}
            {mood === 'speaking' && (
              <span className="flex items-center gap-1 text-green-300">
                <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse-slow" />
                Speaking
              </span>
            )}
          </div>

          {/* Hide button */}
          <button 
            onClick={usePinguStore.getState().hidePingu}
            className="w-full px-2 py-1.5 rounded text-xs bg-[#313244] hover:bg-[#45475a] transition text-left"
          >
            Hide Pingu (not recommended 😢)
          </button>

          {/* About button */}
          <button 
            onClick={() => console.log('Show about dialog')}
            className="w-full px-2 py-1.5 rounded text-xs bg-[#313244] hover:bg-[#45475a] transition text-left"
          >
            About Pingu — Fun facts! 🐧
          </button>
        </div>

        {/* Close button */}
        <div className="px-3 py-2 border-t border-[#45475a] flex justify-end">
          <button 
            onClick={onClose}
            className="px-2.5 py-1 rounded text-xs bg-[#313244] hover:bg-[#45475a] transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Menu Button Component ──────────────

function MenuButton({ icon, label, subtitle, onClick }: { 
  icon: string; 
  label: string; 
  subtitle?: string; 
  onClick: () => void;
}) {
  return (
    <button 
      onClick={onClick}
      className="w-full px-2 py-1.5 rounded text-left hover:bg-[#313244] transition"
    >
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      {subtitle && (
        <span className="ml-6 text-[10px] text-[#a6adc8] opacity-70">{subtitle}</span>
      )}
    </button>
  );
}