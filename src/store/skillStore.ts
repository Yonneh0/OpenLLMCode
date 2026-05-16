// Skill Store — manages per-skill enabled/disabled state across sessions
// Persisted in localStorage so user preferences survive between app restarts
import { create } from 'zustand';
import type { DiscoveredSkill, SkillTool } from '../engine/skills/discovery';
import * as fs from 'fs';
import * as pathModule from 'path';

interface SkillState {
  // Set of active skill IDs (skills whose tools are registered with the agent)
  activeSkills: Set<string>;
  
  // List of discovered skills for display in UI
  discoveredSkills: Array<DiscoveredSkill & { isActive: boolean }>;
  
  // Whether skill discovery is currently running
  isDiscovering: boolean;
  
  // Actions — CRUD for individual skills
  toggleSkill: (skillId: string) => Promise<boolean>;
  activateSkill: (skillId: string) => Promise<boolean>;
  deactivateSkill: (skillId: string) => Promise<boolean>;
  setActiveSkills: (ids: Set<string>) => void;
  
  // Actions — discovery
  setDiscoveredSkills: (skills: Array<DiscoveredSkill & { isActive: boolean }>) => void;
  setIsDiscovering: (discovering: boolean) => void;
  
  // Persistence
  saveToDisk: () => Promise<void>;
  loadFromDisk: () => Promise<void>;
}

const SKILLS_STORAGE_KEY = 'openllmcode-active-skills';

export const useSkillStore = create<SkillState>((set, get) => ({
  activeSkills: new Set(),
  discoveredSkills: [],
  isDiscovering: false,
  
  toggleSkill: async (skillId) => {
    const isActive = get().activeSkills.has(skillId);
    if (isActive) {
      return get().deactivateSkill(skillId);
    } else {
      return get().activateSkill(skillId);
    }
  },
  
  activateSkill: async (skillId) => {
    const newActive = new Set(get().activeSkills);
    newActive.add(skillId);
    
    set({ activeSkills: newActive });
    void get().saveToDisk();
    
    // Try to register the skill's tools with the tool registry
    try {
      const suggestionEngine = await import('../engine/skills/suggestionEngine');
      return await suggestionEngine.activateSkill(skillId);
    } catch (err) {
      console.warn(`Failed to activate skill "${skillId}":`, err);
      return false;
    }
  },
  
  deactivateSkill: async (skillId) => {
    const newActive = new Set(get().activeSkills);
    newActive.delete(skillId);
    
    set({ activeSkills: newActive });
    void get().saveToDisk();
    
    // Try to unregister the skill's tools with the tool registry
    try {
      const suggestionEngine = await import('../engine/skills/suggestionEngine');
      return await suggestionEngine.deactivateSkill(skillId);
    } catch (err) {
      console.warn(`Failed to deactivate skill "${skillId}":`, err);
      return false;
    }
  },
  
  setActiveSkills: (ids) => {
    set({ activeSkills: ids });
    void get().saveToDisk();
  },
  
  setDiscoveredSkills: (skills) => {
    set({ discoveredSkills: skills });
  },
  
  setIsDiscovering: (discovering) => {
    set({ isDiscovering: discovering });
  },
  
  saveToDisk: async () => {
    try {
      const activeIds = get().activeSkills;
      if (activeIds.size === 0) return;
      
      localStorage.setItem(
        SKILLS_STORAGE_KEY, 
        JSON.stringify([...activeIds])
      );
    } catch (err) {
      console.warn('Failed to save active skills:', err);
    }
  },
  
  loadFromDisk: async () => {
    try {
      const raw = localStorage.getItem(SKILLS_STORAGE_KEY);
      if (!raw) return;
      
      // Validate — ensure each entry is a string (skill ID)
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        console.warn('Failed to load active skills: invalid format');
        return;
      }
      const activeIds = new Set<string>(parsed.filter((id): id is string => typeof id === 'string'));
      
      set({ activeSkills: activeIds });
    } catch (err) {
      console.warn('Failed to load active skills:', err);
    }
  },
}));

// ─── Convenience function for skill discovery from UI context ──────────────

/**
 * Discover and refresh all skills from configured directories.
 * This is the entry point for skill discovery - called when user opens skills panel or clicks Pingu menu item.
 */
export async function discoverAndRefreshSkills(projectRoot?: string): Promise<Array<DiscoveredSkill & { isActive: boolean }>> {
  const store = useSkillStore.getState();
  
  // If no project root provided, try to get it from the file tree store or default to current working directory
  const root = projectRoot || process.cwd() || '.';
  
  store.setIsDiscovering(true);
  
  try {
    const discoveryModule = await import('../engine/skills/discovery');
    
    // Discover skills by scanning both local and global directories (same logic as suggestionEngine)
    const discoveredSkills: DiscoveredSkill[] = [];
    
    // Check project-local directory first (higher priority)
    const localPath = pathModule.join(process.cwd(), root, '.openllmcode-skills');
    if (fs.existsSync(localPath)) {
      try {
        const entries = fs.readdirSync(localPath);
        for (const entry of entries) {
          if (!entry.endsWith('.skill.yaml') && !entry.endsWith('.skill.yml')) continue;
          const skillFilePath = pathModule.join(localPath, entry);
          // Use discovery module's parseSkillFile function to parse the skill file
          const parsed = parseSkillFileSync(skillFilePath);
          if (parsed) discoveredSkills.push(parsed);
        }
      } catch {}
    }
    
    // Then check user-global directory
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const globalPath = pathModule.join(homeDir, '.openllmcode/skills');
    if (fs.existsSync(globalPath)) {
      try {
        const entries = fs.readdirSync(globalPath);
        for (const entry of entries) {
          if (!entry.endsWith('.skill.yaml') && !entry.endsWith('.skill.yml')) continue;
          const skillFilePath = pathModule.join(globalPath, entry);
          const parsed = parseSkillFileSync(skillFilePath);
          if (parsed) discoveredSkills.push(parsed);
        }
      } catch {}
    }
    
    // Get current active status for each skill
    const allWithStatus: Array<DiscoveredSkill & { isActive: boolean }> = discoveredSkills.map((skill: DiscoveredSkill) => ({
      ...skill,
      isActive: store.activeSkills.has(skill.id),
    }));
    
    store.setDiscoveredSkills(allWithStatus);
    
    return allWithStatus;
  } catch (err) {
    console.warn('Failed to discover skills:', err);
    return [];
  } finally {
    store.setIsDiscovering(false);
  }
}

// ─── Sync helper to parse skill files in the main thread ──────────────
function parseSkillFileSync(filePath: string): DiscoveredSkill | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Minimal YAML-like parsing — handles the subset used by our skill files
    const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
    
    let name = '';
    let description = '';
    const triggerFiles: string[] = [];
    const suggestedWhen: string[] = [];
    const tools: SkillTool[] = [];
    
    let currentTool: Partial<SkillTool> | null = null;
    
    for (const line of lines) {
      if (line.trim().startsWith('#') || !line.trim()) continue;
      
      // Parse list item under a tool section
      const listItemMatch = line.match(/^\s*-\s+(\w+):\s*(.+)$/);
      if (listItemMatch && currentTool !== null) {
        const [_, key, value] = listItemMatch;
        switch (key) {
          case 'name': currentTool.name = value.trim(); break;
          case 'description': currentTool.description = value.trim(); break;
          case 'command': currentTool.commandTemplate = value.trim().replace(/\$\{([^}]+)\}/g, '{}'); break;
          case 'approval_cost': currentTool.approvalCost = (value.trim() || 'medium') as 'low' | 'medium' | 'high'; break;
        }
        continue;
      }
      
      // Parse key-value pairs at top level
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (!match) continue;
      
      const [_, key, value] = match;
      
      switch (key) {
        case 'name': name = value.trim(); break;
        case 'description': description = value.trim(); break;
        case 'trigger_files': 
          triggerFiles.push(...value.split(',').map(s => s.trim()).filter(Boolean));
          break;
        case 'suggested_when':
          suggestedWhen.push(...value.split(',').map(s => s.trim()).filter(Boolean));
          break;
        case 'tools':
          currentTool = {};
          break;
      }
      
      // End of tools section when we see a non-indented line after it
      if (currentTool !== null && !line.match(/^\s+/)) {
        const toolName = currentTool.name || `tool-${tools.length}`;
        const commandTemplate = currentTool.commandTemplate || 'echo "No command defined for ${tool_name}"';
        
        tools.push({
          name: toolName,
          description: currentTool.description || '',
          commandTemplate,
          approvalCost: (currentTool.approvalCost as 'low' | 'medium' | 'high') || 'medium',
        });
        
        currentTool = null;
      }
    }
    
    // Add any remaining tool if it wasn't closed by a non-indented line
    if (currentTool !== null) {
      const toolName = currentTool.name || `tool-${tools.length}`;
      tools.push({
        name: toolName,
        description: currentTool.description || '',
        commandTemplate: currentTool.commandTemplate || 'echo "No command defined for ${tool_name}"',
        approvalCost: (currentTool.approvalCost as 'low' | 'medium' | 'high') || 'medium',
      });
    }

    if (!name) return null;
    
    return {
      id: `skill-${pathModule.basename(filePath).replace(/\.skill\.(yaml|yml)$/, '')}`,
      name,
      description,
      triggerFiles: triggerFiles.length > 0 ? triggerFiles : undefined,
      tools,
      suggestedWhen: suggestedWhen.length > 0 ? suggestedWhen : undefined,
    };
  } catch {
    console.warn(`Failed to parse skill file ${filePath}`);
    return null;
  }
}

// ─── IPC Event Handler for when main process discovers skills ──────────────
export function handleSkillsDiscovered(skills: Array<DiscoveredSkill & { isActive: boolean }>): void {
  useSkillStore.getState().setDiscoveredSkills(skills);
}