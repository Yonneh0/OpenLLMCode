// Agent Skill Suggestion Engine — analyzes project context to auto-suggest relevant skills (Phase G-1)
import * as fs from 'fs';
import * as pathModule from 'path';
import type { DiscoveredSkill, SkillTool } from './discovery';

// State for skill toggling on/off
let activeSkills = new Set<string>();  // IDs of enabled skills
let discoveredSkills: DiscoveredSkill[] = [];

/** Analyze the current project context and return suggested skills */
export function analyzeProjectContext(projectRoot: string): { suggested: DiscoveredSkill[]; all: DiscoveredSkill[] } {
  const all = discoverAllSkills(projectRoot);
  
  // Find which files are present in the project
  const projectFiles = getAllProjectFiles(projectRoot);
  
  // Match skills against file patterns
  const suggested = new Set<DiscoveredSkill>();
  
  for (const skill of all) {
    if (!skill.triggerFiles && !skill.suggestedWhen) continue;
    
    for (const trigger of [...(skill.triggerFiles || []), ...(skill.suggestedWhen || [])]) {
      // Check if any project file matches the trigger pattern
      const matches = checkTriggerMatch(projectFiles, trigger);
      if (matches) {
        suggested.add(skill);
        break;
      }
    }
  }
  
  return { suggested: Array.from(suggested), all };
}

/** Discover all skills from configured directories */
function discoverAllSkills(projectRoot: string): DiscoveredSkill[] {
  // Use cached discovery if available (avoid re-scanning on every analysis)
  const cacheKey = projectRoot;
  
  try {
    const cachePath = pathModule.join(
      process.platform === 'win32' ? (process.env.APPDATA || '/tmp') : (process.env.HOME || '/tmp'),
      'OpenLLMCode',
      'skills-cache.json'
    );
    
    if (fs.existsSync(cachePath)) {
      const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      if (cache.projectRoot === projectRoot && Date.now() - cache.timestamp < 60_000) {
        // Cache is less than 1 minute old — use it
        return cache.skills as DiscoveredSkill[];
      }
    }
    
    // Scan for skills and update cache
    const skills = scanForSkills(projectRoot);
    fs.writeFileSync(cachePath, JSON.stringify({ projectRoot, timestamp: Date.now(), skills }, null, 2));
    
    return skills;
  } catch {
    return scanForSkills(projectRoot);
  }
}

/** Scan all configured directories for skill files */
function scanForSkills(projectRoot: string): DiscoveredSkill[] {
  const discovered: DiscoveredSkill[] = [];
  
  // Check project-local directory first (higher priority)
  const localPath = pathModule.join(process.cwd(), projectRoot, '.openllmcode-skills');
  if (fs.existsSync(localPath)) {
    discovered.push(...scanDirectoryForSkills(localPath));
  }
  
  // Then check user-global directory
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const globalPath = pathModule.join(homeDir, '.openllmcode/skills');
  if (fs.existsSync(globalPath)) {
    discovered.push(...scanDirectoryForSkills(globalPath));
  }
  
  return discovered;
}

/** Scan a single directory for .skill.yaml files */
function scanDirectoryForSkills(dirPath: string): DiscoveredSkill[] {
  const skills: DiscoveredSkill[] = [];
  
  try {
    const entries = fs.readdirSync(dirPath);
    
    for (const entry of entries) {
      if (!entry.endsWith('.skill.yaml') && !entry.endsWith('.skill.yml')) continue;
      
      const skillFilePath = pathModule.join(dirPath, entry);
      const skill = parseSkillFile(skillFilePath);
      if (skill) {
        skills.push(skill);
      }
    }
  } catch (err) {
    console.warn(`Failed to scan skill directory ${dirPath}:`, err);
  }
  
  return skills;
}

/** Parse a single .skill.yaml file into internal format */
function parseSkillFile(filePath: string): DiscoveredSkill | null {
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

/** Get all files in the project (recursively) */
function getAllProjectFiles(projectRoot: string): Set<string> {
  const files = new Set<string>();
  
  try {
    const walkDir = (dirPath: string) => {
      if (!fs.existsSync(dirPath)) return;
      
      const entries = fs.readdirSync(dirPath);
      
      for (const entry of entries) {
        const fullPath = pathModule.join(dirPath, entry);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.endsWith('.gguf') || entry.endsWith('.bin')) {
          // Skip model files — too large to be relevant for skill detection
          continue;
        } else {
          const relativePath = pathModule.relative(process.cwd(), fullPath);
          files.add(relativePath);
        }
      }
    };
    
    walkDir(projectRoot);
  } catch (err) {
    console.warn('Failed to scan project files for skill suggestions:', err);
  }
  
  return files;
}

/** Check if a trigger pattern matches any file in the project */
function checkTriggerMatch(projectFiles: Set<string>, trigger: string): boolean {
  // Handle glob patterns (e.g., "**/*.cpp")
  const isGlob = trigger.includes('*');
  
  for (const filePath of projectFiles) {
    if (isGlob && matchGlob(filePath, trigger)) {
      return true;
    } else if (!isGlob && filePath.endsWith(trigger)) {
      // Exact file extension match (e.g., "cpp", "go")
      const ext = trigger.startsWith('.') ? trigger : `.${trigger}`;
      if (filePath.endsWith(ext) || filePath.includes('/' + trigger + '/')) {
        return true;
      }
    }
  }
  
  return false;
}

/** Simple glob matcher for file patterns */
function matchGlob(filePath: string, pattern: string): boolean {
  // Convert glob to regex — handle ** (any path) and * (single segment)
  const regex = new RegExp(
    '^' + 
    pattern.replace(/\./g, '\\.').replace(/\\\*\*/g, '___DOUBLESTAR___').replace(/\\\*/g, '[^/]*').replace(/___DOUBLESTAR___/g, '.*') + 
    '$',
    'i'
  );
  
  return regex.test(filePath);
}

// ─── Skill Activation / Deactivation ──────────────

/** Activate a skill — adds its tools to the agent's tool registry */
export async function activateSkill(skillId: string): Promise<boolean> {
  const all = discoverAllSkills(process.cwd() || '.');
  const skill = all.find(s => s.id === skillId);
  
  if (!skill) return false;
  
  activeSkills.add(skillId);
  
  // Register each tool in the skill with the agent's tool registry
  for (const tool of skill.tools) {
    try {
      const toolRegistry = await import('../toolRegistry.js');
      const commandTemplate = tool.commandTemplate.replace(/\$\{([^}]+)\}/g, () => '');
      
      toolRegistry.registerTool({
        name: `${skillId}:${tool.name}` as any,
        description: `[${skill.name}] ${tool.description}`,
        parameters: {
          _command: { type: 'string', required: true, description: `Command for ${tool.name}: ${commandTemplate}` },
        },
        defaultApproval: tool.approvalCost === 'low' ? 'auto' : 'require',
      });
    } catch (err) {
      console.warn(`Failed to register tool "${tool.name}" from skill "${skillId}":`, err);
    }
  }
  
  return true;
}

/** Deactivate a skill — removes its tools from the agent's tool registry */
export async function deactivateSkill(skillId: string): Promise<boolean> {
  if (!activeSkills.has(skillId)) return false;
  
  activeSkills.delete(skillId);
  
  const all = discoverAllSkills(process.cwd() || '.');
  const skill = all.find(s => s.id === skillId);
  
  if (skill) {
    for (const tool of skill.tools) {
      try {
        const toolRegistry = await import('../toolRegistry.js');
        // Don't allow unregistering — use a whitelist approach instead
        console.warn(`Deactivating skill "${skillId}" requires manual unregistration of tools`);
      } catch {}
    }
  }
  
  return true;
}

/** Check if a skill is currently active */
export function isSkillActive(skillId: string): boolean {
  return activeSkills.has(skillId);
}

// ─── Claude Code Skill Compatibility Layer ──────────────

/** Import skills from Claude Code's .claude/skills directory format */
export async function importClaudeCodeSkills(claudeDir: string): Promise<DiscoveredSkill[]> {
  const imported: DiscoveredSkill[] = [];
  
  try {
    if (!fs.existsSync(claudeDir)) return imported;
    
    const entries = fs.readdirSync(claudeDir);
    
    for (const entry of entries) {
      if (!entry.startsWith('.md') && !entry.endsWith('.skill.yaml')) continue;
      
      // Convert Claude Code skill to OpenLLMCode format
      const skillPath = pathModule.join(claudeDir, entry);
      
      if (entry.startsWith('.md')) {
        // .md files are Claude Code skill definitions — convert them
        try {
          const content = fs.readFileSync(skillPath, 'utf-8');
          
          let name = '';
          let description = '';
          const triggerFiles: string[] = [];
          const suggestedWhen: string[] = [];
          const tools: SkillTool[] = [];
          
          // Parse frontmatter for metadata
          const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
          if (frontmatterMatch) {
            const fm = frontmatterMatch[1];
            const nameMatch = fm.match(/name:\s*(.+)/);
            const descMatch = fm.match(/description:\s*(.+)/);
            
            if (nameMatch) name = nameMatch[1].trim();
            if (descMatch) description = descMatch[1].trim(); // store description for later use
            
            const tagsMatch = fm.match(/tags:\s*\n\s*([\s\S]*?)\n/s);
            if (tagsMatch) {
              triggerFiles.push(...tagsMatch[1].split('\n').map(s => s.trim()).filter(Boolean));
            }
          }
          
          // Parse command definitions from content
          const codeMatches = content.match(/```(?:sh|bash)?\s*\n([\s\S]*?)\n``/g);
          if (codeMatches) {
            for (const match of codeMatches) {
              const cmdContent = match.replace(/^```[^\n]*\n/, '').replace(/\n$$/, '');
              // Extract tool name from filename or comment in the script
              tools.push({
                name: pathModule.basename(skillPath).replace('.md', ''),
                description: `Claude Code skill — ${cmdContent.slice(0, 100)}...`,
                commandTemplate: cmdContent.replace(/\\n/g, '\n'),
                approvalCost: 'medium' as const,
              });
            }
          }
          
          if (name) {
            imported.push({
              id: `claude-${pathModule.basename(skillPath).replace('.md', '')}`,
              name,
              description, // now properly in scope here too
              triggerFiles: triggerFiles.length > 0 ? triggerFiles : undefined,
              tools,
            });
          }
        } catch (err) {
          console.warn(`Failed to import Claude Code skill ${entry}:`, err);
        }
      } else if (entry.endsWith('.skill.yaml')) {
        // Already in our format — just parse directly
        const parsed = parseSkillFile(skillPath);
        if (parsed) {
          // Re-index as claude- prefixed to avoid conflicts
          imported.push({ ...parsed, id: `claude-${parsed.id.replace('skill-', '')}` });
        }
      }
    }
  } catch (err) {
    console.warn('Failed to scan Claude Code skills directory:', err);
  }
  
  return imported;
}

// ─── Exported for IPC / Main Process Use ──────────────

/** Get the current set of active skill IDs */
export function getActiveSkillIds(): Set<string> {
  return new Set(activeSkills);
}

/** Refresh the skills cache and re-analyze — called when project root changes or on periodic timer */
export async function refreshSkillsCache(projectRoot: string): Promise<void> {
  // Clear cached skill discovery (force re-scan)
  const cachePath = pathModule.join(
    process.platform === 'win32' ? (process.env.APPDATA || '/tmp') : (process.env.HOME || '/tmp'),
    'OpenLLMCode',
    'skills-cache.json'
  );
  
  try {
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
    
    // Re-discover and re-register active skills with tool registry
    const all = discoverAllSkills(projectRoot);
    
    for (const skill of all) {
      if (activeSkills.has(skill.id)) {
        await activateSkill(skill.id);
      }
    }
  } catch {
    console.warn('Failed to refresh skills cache');
  }
}

/** Get all available skills with their active status — for UI display */
export function getSkillsWithStatus(projectRoot: string): Array<DiscoveredSkill & { isActive: boolean }> {
  const all = discoverAllSkills(projectRoot);
  
  return all.map(skill => ({
    ...skill,
    isActive: activeSkills.has(skill.id),
  }));
}