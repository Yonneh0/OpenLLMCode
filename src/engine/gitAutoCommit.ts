// Git auto-commit for AI actions — only after successful tool calls
import { spawnSync } from 'child_process';

export interface GitOptions {
  projectPath?: string;
}

// Get current git status (staged changes)
export function getGitStatus(projectPath: string): { changed: string[]; staged: string[] } {
  try {
    const output = spawnSync('git', ['status', '--porcelain'], {
      cwd: projectPath, encoding: 'utf-8'
    }).stdout;

    const lines = output.trim().split('\n');
    return {
      changed: [],
      staged: lines.filter(Boolean),
    };
  } catch {
    return { changed: [], staged: [] };
  }
}

// Commit changes with a descriptive message
export function gitCommit(
  message: string,
  projectPath?: string
): boolean {
  try {
    const result = spawnSync('git', [
      'commit', '-m', message
    ], { cwd: projectPath });

    return result.status === 0;
  } catch {
    return false;
  }
}

// Squash all commits from a task into one
export function gitSquashCommits(
  commitMessage: string,
  projectPath?: string
): boolean {
  try {
    const result = spawnSync('git', [
      'reset', '--soft', 'HEAD~5' // squash last ~5 commits (configurable)
    ], { cwd: projectPath });

    if (result.status !== 0) return false;

    // Now commit with the provided message
    return gitCommit(commitMessage, projectPath);
  } catch {
    return false;
  }
}

// Get a list of recent commits (for task completion squash detection)
export function getRecentCommits(count: number = 10): Array<{ hash: string; message: string }> {
  try {
    const output = spawnSync('git', [
      'log', '--format=%H %s', `-n`, String(count),
    ]).stdout.toString();

    return output.trim().split('\n').map(line => {
      const parts = line.split(' ');
      return { hash: parts[0], message: parts.slice(1).join(' ') };
    });
  } catch {
    return [];
  }
}

// Create a checkpoint commit (for Cline-style rollback)
export function gitCreateCheckpoint(label: string): string {
  try {
    const hash = spawnSync('git', ['rev-parse', 'HEAD']).stdout.toString().trim();
    spawnSync('git', [
      'tag', `checkpoint-${label}-${Date.now()}`, '-f'
    ]);
    return hash;
  } catch {
    return '';
  }
}

// Restore to a checkpoint (rollback)
export function gitRestoreToCheckpoint(checkpointHash: string): boolean {
  try {
    const result = spawnSync('git', ['reset', '--hard', checkpointHash]);
    return result.status === 0;
  } catch {
    return false;
  }
}

// Auto-commit after a successful tool call (e.g., file write)
export function autoCommitAfterAction(
  actionType: string,
  filePath?: string,
  projectPath?: string
): boolean {
  const message = `OpenLLMCode: ${actionType}${filePath ? ' — ' + filePath : ''}`;

  // Get current state before commit
  const status = getGitStatus(projectPath || process.cwd());
  if (status.staged.length === 0) return true; // nothing to commit

  return gitCommit(message, projectPath);
}
