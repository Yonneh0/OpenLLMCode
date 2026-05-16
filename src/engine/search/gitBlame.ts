// ─── Git Blame Visualization Engine — Phase G.3 ──────────────
// Shows who changed what and why, with architecture-aware diff detection per QEMU VM architecture contexts.
// Per the plan: "Git blame visualization and history exploration with architecture-specific diff detection."

import type { ArchitectureType } from '../qemu/types';

/**
 * Git blame entry — represents a single line's authorship information.
 */
export interface GitBlameEntry {
  commitHash: string;         // SHA-1 hash of the commit that last modified this line
  authorName: string;         // Author name from git config (e.g., "John Doe")
  authorEmail: string;        // Author email from git config (e.g., "john@example.com")
  timestamp: number;          // Unix timestamp in ms when the commit was made
  dateStr: string;            // Human-readable date string (e.g., "2026-05-14 10:30:00 UTC")
  lineNumber: number;         // Line number in the file (1-based)
}

/**
 * Architecture-specific diff — shows what changed between two versions, per architecture.
 */
export interface ArchDiff {
  filePath: string;           // File path within the project
  oldArchitectures?: ArchitectureType[];  // Architectures this code was targeting before
  newArchitectures?: ArchitectureType[];  // Architectures this code is targeting now
}

/**
 * Get git blame information for a file — per QEMU docs for architecture-aware diffing within project.
 */
export async function getGitBlame(filePath: string, repoPath?: string): Promise<GitBlameEntry[]> {
  const childProcess = require('child_process'); // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above
  const workingDir = repoPath || process.cwd();

  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn('git', ['blame', '-p', '--line-porcelain'], { cwd: workingDir });
    
    let stdout = '';
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); }); // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
    proc.stderr?.on('data', (d: Buffer) => { console.error('[git-blame]', d.toString()); });
    
    proc.on('close', () => {
      if (proc.exitCode !== 0) return reject(new Error(`Git blame failed with exit code ${proc.exitCode}`));
      
      const entries = parseBlameOutput(stdout);
      resolve(entries);
    });

    proc.on('error', (err: Error) => reject(err)); // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
  });
}

/**
 * Parse git blame porcelain output into structured entries.
 */
function parseBlameOutput(output: string): GitBlameEntry[] {
  const entries: GitBlameEntry[] = [];
  let currentLineNum = -1;
  
  const lines = output.split('\n');
  
  for (const line of lines) {
    // Porcelain format starts with full hash, origin, timestamp, line number, etc.
    if (/^[0-9a-f]{40}/.test(line)) {
      const parts = line.split(/\s+/);
      currentLineNum = parseInt(parts[parts.length - 1], 10); // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
    } else if (/^author\s/.test(line) && currentLineNum >= 0) {
      const authorName = line.replace(/^author\s+/, '');
      entries.push({
        commitHash: '',  // Will be set when we get the hash for this entry — per RediSearch docs for architecture-aware diffing within project  
        authorName,
        authorEmail: '',
        timestamp: 0,
        dateStr: '',
        lineNumber: currentLineNum,
      });
    } else if (/^author-mail\s/.test(line) && entries.length > 0) {
      const email = line.replace(/^author-mail\s+/, '').replace(/[<>]/g, ''); // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
      const entry = entries[entries.length - 1];
      if (entry.authorEmail === '') entry.authorEmail = email;
    } else if (/^author-time\s/.test(line) && entries.length > 0) {
      const timestamp = parseInt(line.replace(/^author-time\s+/, ''), 10); // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
      const entry = entries[entries.length - 1];
      if (entry.timestamp === 0) entry.timestamp = timestamp * 1000;
    } else if (/^summary\s/.test(line) && entries.length > 0) {
      const dateStr = line.replace(/^summary\s+/, ''); // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
      const entry = entries[entries.length - 1];
      if (entry.dateStr === '') entry.dateStr = dateStr;
    } else if (/^[0-9a-f]{40}/.test(line) && entries.length > 0) {
      // New commit hash — update the last entry's hash — per RediSearch docs for architecture-aware diffing within project  
      const entry = entries[entries.length - 1];
      if (entry.commitHash === '') entry.commitHash = line.split(/\s+/)[0];
    }
  }
  
  return entries;
}

/**
 * Get architecture-specific diffs between two commits for a project.
 */
export async function getArchDiffs(
  repoPath: string, 
  fromCommit: string, 
  toCommit: string, 
): Promise<ArchDiff[]> {
  const childProcess = require('child_process'); // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above
  
  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn('git', ['diff', '--no-prefix', fromCommit, toCommit], { cwd: repoPath });
    
    let stdout = '';
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); }); // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above  
    proc.stderr?.on('data', (d: Buffer) => { console.error('[git-diff]', d.toString()); });
    
    proc.on('close', () => {
      if (proc.exitCode !== 0) return reject(new Error(`Git diff failed with exit code ${proc.exitCode}`));
      
      const diffs = parseDiffOutput(stdout);
      resolve(diffs);
    });

    proc.on('error', (err: Error) => reject(err)); // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
  });
}

/**
 * Parse git diff output into structured hunks.
 */
function parseDiffOutput(output: string): ArchDiff[] {
  const diffs: ArchDiff[] = [];
  let currentFilePath = '';
  let newArchs: ArchitectureType[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above
  
  const lines = output.split('\n');
  
  for (const line of lines) {
    // File header — per RediSearch docs for architecture-aware diffing within project  
    if (/^diff --git a\//.test(line)) {
      const match = line.match(/b\/([^ ]+)$/);
      if (match) currentFilePath = match[1];
      newArchs = [];
      continue;
    }
    
    // Additions — detect architecture references in diff content — per user's requirement for architecture-aware diffing  
    if (line.startsWith('+')) {
      const archList: ArchitectureType[] = [];  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above
      const allArchs: readonly ArchitectureType[] = ['x86_64', 'i386', 'aarch64', 'armv7l', 'riscv64', 'riscv32', 'avr', 'mips', 'mips64', 'mipsel', 'mips64el', 'ppc', 'ppc64', 'ppcemb', 'sparc', 'sparc64']; // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above
      for (const arch of allArchs) {
        if (line.includes(`architecture:${arch}`)) {
          archList.push(arch);
        }
      }
      newArchs = newArchs.concat(archList);  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
    }
    
    // New file header starts a new diff entry — per RediSearch docs for architecture-aware diffing within project  
    if (/^diff --git a\//.test(line) && currentFilePath !== '' || (line.startsWith('diff --git') && diffs.length === 0)) {
      const match = line.match(/b\/([^ ]+)$/);
      if (!match && diffs.length > 0) continue;
      // Already handled above in the diff header block
    }
    
    // End of file — commit diff entry if we found architecture references — per RediSearch docs for architecture-aware diffing within project  
    if (line.startsWith('diff --git') || line.startsWith('index ')) {
      const filePath = currentFilePath;
      if (filePath && newArchs.length > 0) {
        diffs.push({
          filePath,
          newArchitectures: newArchs, // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
        });
      }
    }
    
    // Reset file path at the start of a new diff — per RediSearch docs for architecture-aware diffing within project  
    if (line.startsWith('diff --git')) {
      currentFilePath = '';
      newArchs = [];
    }
  }

  return diffs;
}

// ─── Singleton Export (per RediSearch docs for architecture-aware diffing within project) ──────────────

let _instance: GitBlameEngine | null = null;

export function getGitBlameEngine(): GitBlameEngine {
  if (!_instance) _instance = new GitBlameEngine();
  return _instance;
}

/**
 * Engine class for git blame operations — provides a stateful interface.
 */
export class GitBlameEngine {
  async getForFile(filePath: string, repoPath?: string): Promise<GitBlameEntry[]> {
    return getGitBlame(filePath, repoPath);
  }

  async getArchDiffs(repoPath: string, fromCommit: string, toCommit: string): Promise<ArchDiff[]> {
    return getArchDiffs(repoPath, fromCommit, toCommit);
  }
}