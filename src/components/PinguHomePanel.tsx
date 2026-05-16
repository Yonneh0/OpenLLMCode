// PinguHomePanel — System AI's "home" area in bottom-left corner of the app, below ActivityBar + Sidebar (VS Code Dark+ aesthetic)
import React from 'react';
import { usePinguStore } from '../store/pinguStore';

const PinguHomePanel: React.FC = () => {
  const [showAbout, setShowAbout] = React.useState(false);
  
  // Fun fact rotation
  const funFacts = [
    "🐧 Penguins propose to their mates with a smooth pebble!",
    "🐧 Emperor penguins can dive deeper than any other bird — over 500 meters!",
    "🐧 Penguin feathers are so dense they provide excellent insulation.",
    "🐧 King penguins have bright orange patches for social signaling.",
    "🐧 Penguins swim at speeds up to 12 miles per hour!",
  ];
  const [funFact, setFunFact] = React.useState(0);

  return (
    <div className="w-[308px] flex-shrink-0 border-t border-r border-[#404040] bg-[#1E1E1E]/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#404040] bg-[#181818]/60">
        <span className="text-xs font-semibold text-[#858585] uppercase tracking-wider flex items-center gap-1.5">
          🐧 Pingu Home
        </span>
        <button 
          onClick={() => setShowAbout(!showAbout)}
          className="p-0.5 rounded hover:bg-[#404040] transition text-xs"
          title="About Pingu"
        >
          ⓘ
        </button>
      </div>

      {/* About section */}
      {showAbout && (
        <div className="px-3 py-2 border-b border-[#404040]">
          <p className="text-xs text-[#858585] mb-1.5">Pingu — Your AI Companion</p>
          <button 
            onClick={() => setFunFact((f) => (f + 1) % funFacts.length)}
            className="w-full px-2 py-1 rounded bg-[#404040] hover:bg-[#505050] text-xs text-[#858585] transition"
          >
            {funFacts[funFact]}
          </button>
        </div>
      )}

      {/* Quick actions */}
      <div className="px-3 py-2 space-y-1">
        <h4 className="text-[10px] font-semibold text-[#858585] uppercase tracking-wider mb-1">Quick Actions</h4>
        
        <button 
          onClick={() => usePinguStore.getState().togglePanel('skills')}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#2A2D2E] transition"
        >
          <span className="text-sm">🛠️</span> Skills
        </button>
        
        <button 
          onClick={() => usePinguStore.getState().togglePanel('settings')}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#2A2D2E] transition"
        >
          <span className="text-sm">⚙️</span> Settings
        </button>
        
        <button 
          onClick={() => usePinguStore.getState().togglePanel('models')}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#2A2D2E] transition"
        >
          <span className="text-sm">📦</span> Models
        </button>
        
        <button 
          onClick={() => usePinguStore.getState().togglePanel('logs')}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#2A2D2E] transition"
        >
          <span className="text-sm">📋</span> Activity Log
        </button>
      </div>

      {/* System AI status */}
      <div className="px-3 py-2 border-t border-[#404040] bg-[#181818]/60">
        <h4 className="text-[10px] font-semibold text-[#858585] uppercase tracking-wider mb-1">System AI</h4>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full bg-[#007ACC]"></span>
          <span className="text-[#858585]">Engine Running</span>
        </div>
      </div>

      {/* Engine version info */}
      <div className="px-3 py-2 border-t border-[#404040] bg-[#181818]/60">
        <h4 className="text-[10px] font-semibold text-[#858585] uppercase tracking-wider mb-1">Engine</h4>
        <div className="space-y-0.5 text-xs">
          <span className="text-[#858585]">Version: v0.2.0</span>
          <br />
          <span className="text-[#858585]">Backend: CPU (AVX2)</span>
        </div>
      </div>

      {/* Pingu mascot footer */}
      <div className="px-3 py-2 border-t border-[#404040] flex items-center gap-2 bg-gradient-to-r from-[#1E1E1E]/80 to-transparent">
        <span className="text-lg">🐧</span>
        <span className="text-xs text-[#858585] italic">"Pingu is ready — click the icon to chat!"</span>
      </div>
    </div>
  );
};

export default PinguHomePanel;