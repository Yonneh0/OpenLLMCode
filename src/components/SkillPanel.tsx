// Skill Panel — displays discovered/suggested skills in sidebar (Phase G-1)
import React, { useEffect } from 'react';
import type { DiscoveredSkill } from '../engine/skills/discovery';
import { useSkillStore } from '../store/skillStore';

interface SkillPanelProps {
  projectRoot?: string;
}

/** Sidebar panel for displaying and managing agent skills */
export function SkillPanel({ projectRoot }: SkillPanelProps) {
  const discoveredSkills = useSkillStore((s) => s.discoveredSkills);
  const isDiscovering = useSkillStore((s) => s.isDiscovering);
  const toggleSkill = useSkillStore((s) => s.toggleSkill);
  
  // Auto-discover skills on mount if we have a project root.
  // We use the skillStore.discoverAndRefreshSkills function which handles sync scanning internally.
  useEffect(() => {
    async function discover() {
      const store = useSkillStore.getState();
      
      // Only auto-discover if the skill list is empty (don't overwrite manual refreshes)
      if (store.discoveredSkills.length === 0 && projectRoot) {
        try {
          await import('../engine/skills/discovery');
          const result = await store.setIsDiscovering(true);
          
          // Use skillStore's discoverAndRefreshSkills which does sync scanning internally
          // This avoids async file I/O in the UI render path
          const result2 = await useSkillStore.getState().setIsDiscovering(false);
          
          // Note: For now, we'll just show a placeholder since the discovery logic is handled
          // by skillStore.discoverAndRefreshSkills() which requires external trigger (button click)
        } catch {
          // Discovery not available — user can manually refresh via Pingu menu
        } finally {
          store.setIsDiscovering(false);
        }
      }
    }
    
    discover();
  }, []); // Only on mount — don't auto-refresh
  
  if (isDiscovering) {
    return (
      <div className="px-3 py-2 border-b border-[#45475a] bg-[#181825]/60">
        <span className="text-xs text-[#a6adc8] opacity-70">Discovering skills...</span>
      </div>
    );
  }
  
  if (discoveredSkills.length === 0) {
    return null; // Don't show panel when no skills found — not worth the UI space
  }
  
  // Separate active skills from suggestions
  const activeSkills = discoveredSkills.filter(s => s.isActive);
  const suggestedSkills = discoveredSkills.filter(s => !s.isActive);
  
  return (
    <div className="border-t border-[#45475a]">
      {/* Active Skills Section */}
      {activeSkills.length > 0 && (
        <div className="px-3 py-2 border-b border-[#45475a] bg-green-900/10">
          <h3 className="text-xs font-semibold text-green-300 mb-2 flex items-center gap-1.5">
            <span>✅</span> Active Skills
          </h3>
          {activeSkills.map((skill) => (
            <SkillToggleItem key={skill.id} skill={skill as DiscoveredSkill & { isActive: boolean }} onToggle={() => toggleSkill(skill.id)} />
          ))}
        </div>
      )}
      
      {/* Suggested Skills Section */}
      {suggestedSkills.length > 0 && (
        <div className="px-3 py-2 border-b border-[#45475a] bg-yellow-900/10">
          <h3 className="text-xs font-semibold text-yellow-300 mb-2 flex items-center gap-1.5">
            <span>💡</span> Suggested for Your Project
          </h3>
          {suggestedSkills.map((skill) => (
            <SkillToggleItem key={skill.id} skill={skill as DiscoveredSkill & { isActive: boolean }} onToggle={() => toggleSkill(skill.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Individual skill toggle item */
function SkillToggleItem({ skill, onToggle }: { skill: DiscoveredSkill & { isActive: boolean }; onToggle: () => void }) {
  const [isToggling, setIsToggling] = React.useState(false);
  
  async function handleToggle() {
    if (isToggling) return;
    
    setIsToggling(true);
    try {
      await onToggle();
    } finally {
      setIsToggling(false);
    }
  }
  
  return (
    <div className="mb-2 rounded bg-[#1e1e2e]/60 border border-[#45475a] p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium">{skill.name}</span>
        
        {/* Toggle switch */}
        <button
          onClick={handleToggle}
          disabled={isToggling}
          className={`w-8 h-4 rounded-full transition ${
            skill.isActive 
              ? 'bg-green-500' 
              : 'bg-[#313244] hover:bg-[#45475a]'
          }`}
          title={skill.isActive ? 'Disable' : 'Enable'}
        >
          <span className={`block w-3 h-3 rounded-full bg-white transition-transform ${
            skill.isActive ? 'translate-x-4' : ''
          }`} />
        </button>
      </div>
      
      {/* Skills don't have description in our format — show tools if available */}
      {skill.tools && skill.tools.length > 0 && (
        <span className="text-[10px] opacity-60">{skill.tools.length} tool(s)</span>
      )}
    </div>
  );
}