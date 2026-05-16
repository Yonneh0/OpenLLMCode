// Agent Skill Discovery — scans directories for .skill.yaml files (Phase G-1)
import * as fs from 'fs';
import * as pathModule from 'path';

export interface DiscoveredSkill {
  id: string;           // unique identifier from skill YAML
  name: string;         // display name
  description: string;  // short description
  triggerFiles?: string[];  // files that auto-suggest this skill
  tools: SkillTool[];   // tools exposed by this skill
  suggestedWhen?: string[]; // conditions for auto-suggestion
}

export interface SkillTool {
  name: string;         // tool name within the skill's namespace
  description: string;  // what this tool does
  commandTemplate: string;  // template with {} placeholders
  approvalCost: 'low' | 'medium' | 'high';  // how much user needs to trust for auto-approval
}

// Directories to scan for skill definitions (in order of priority)
const SKILL_SEARCH_DIRS = [
  '.openllmcode-skills/',       // Project-local skills
  '~/.openllmcode/skills/',     // User-global skills
];

/** Discover all available skills by scanning configured directories */
export async function discoverSkills(projectRoot: string): Promise<DiscoveredSkill[]> {
  const discovered: DiscoveredSkill[] = [];

  for (const searchDir of SKILL_SEARCH_DIRS) {
    let resolvedPath = pathModule.join(process.cwd(), projectRoot, searchDir);
    
    // Handle ~ in home directory paths
    if (searchDir.startsWith('~')) {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      resolvedPath = pathModule.join(homeDir, searchDir.slice(1));
    }

    try {
      if (!fs.existsSync(resolvedPath)) continue;

      // Read all .skill.yaml files in the directory
      const entries = fs.readdirSync(resolvedPath);
      
      for (const entry of entries) {
        if (!entry.endsWith('.skill.yaml') && !entry.endsWith('.skill.yml')) continue;
        
        const skillFilePath = pathModule.join(resolvedPath, entry);
        const skill = parseSkillFile(skillFilePath);
        if (skill) {
          discovered.push(skill);
        }
      }
    } catch (err) {
      console.warn(`Failed to scan skill directory ${resolvedPath}:`, err);
    }
  }

  return discovered;
}

/** Parse a single .skill.yaml file into an internal skill representation */
function parseSkillFile(filePath: string): DiscoveredSkill | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Simple YAML-like parsing (we use a minimal subset of YAML)
    const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
    
    let name = '';
    let description = '';
    const triggerFiles: string[] = [];
    const suggestedWhen: string[] = [];
    const tools: SkillTool[] = [];
    
    let currentTool: Partial<SkillTool> | null = null;
    
    for (const line of lines) {
      // Skip comments and empty lines
      if (line.trim().startsWith('#') || !line.trim()) continue;
      
      // Parse key-value pairs at top level
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (!match) {
        // Check for list item (- tool: name, etc.)
        const listItemMatch = line.match(/^\s*-\s+(\w+):\s*(.+)$/);
        if (listItemMatch && currentTool !== null) {
          // Tool-specific list items
          const [_, key, value] = listItemMatch;
          switch (key) {
            case 'name': currentTool.name = value.trim(); break;
            case 'description': currentTool.description = value.trim(); break;
            case 'command': currentTool.commandTemplate = value.trim().replace(/\$\{([^}]+)\}/g, '{}'); break;
            case 'approval_cost': currentTool.approvalCost = (value.trim() || 'medium') as 'low' | 'medium' | 'high'; break;
          }
        }
        continue;
      }
      
      const [_, key, value] = match;
      
      switch (key) {
        case 'name': name = value.trim(); break;
        case 'description': description = value.trim(); break;
        case 'trigger_files': 
          // Parse comma-separated file patterns
          triggerFiles.push(...value.split(',').map(s => s.trim()).filter(Boolean));
          break;
        case 'suggested_when':
          suggestedWhen.push(...value.split(',').map(s => s.trim()).filter(Boolean));
          break;
        case 'tools':
          // Start of tools section — tools are defined as list items below
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

    if (!name) return null; // Invalid skill file — no name found
    
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

/** Build a map of file patterns -> skills that should be suggested when those files are present */
export function buildTriggerMap(skills: DiscoveredSkill[]): Map<string, string[]> {
  const triggerMap = new Map<string, string[]>();
  
  for (const skill of skills) {
    if (!skill.triggerFiles && !skill.suggestedWhen) continue;
    
    const triggers = [...(skill.triggerFiles || []), ...(skill.suggestedWhen || [])];
    for (const trigger of triggers) {
      // Normalize the trigger — could be a file extension, glob pattern, or keyword
      if (!triggerMap.has(trigger)) {
        triggerMap.set(trigger, []);
      }
      triggerMap.get(trigger)!.push(skill.id);
    }
  }
  
  return triggerMap;
}

/** Get all skills that should be suggested given current project context */
export function getSuggestedSkills(projectRoot: string, filesInProject: Set<string>): DiscoveredSkill[] {
  // This would be called during the suggestion engine's analysis
  const skills = discoverSkills(projectRoot);
  // Note: The actual async discovery is handled by the suggestion engine
  return [];
}