// Git auto-commit for AI actions — only after successful tool calls
import { spawnSync } from 'child_process';

export interface GitOptions {
  projectPath?: string;
}

const DEFAULT_PROJECT_PATH = process.cwd();

// Get current git status (staged changes)
export function getGitStatus(projectPath: string = DEFAULT_PROJECT_PATH): { changed: string[]; staged: string[] } {
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

// Stage all changes in the project directory
export function gitStageAll(projectPath: string = DEFAULT_PROJECT_PATH): boolean {
  try {
    const result = spawnSync('git', ['add', '.'], { cwd: projectPath });
    return result.status === 0;
  } catch {
    return false;
  }
}

// Commit changes with a descriptive message
export function gitCommit(
  message: string,
  projectPath: string = DEFAULT_PROJECT_PATH
): boolean {
  try {
    // Stage all changes first
    gitStageAll(projectPath);
    const result = spawnSync('git', [
      'commit', '-m', message
    ], { cwd: projectPath });

    return result.status === 0;
  } catch {
    return false;
  }
}

// Get current HEAD hash
export function gitGetHeadHash(projectPath: string = DEFAULT_PROJECT_PATH): string {
  try {
    const output = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectPath, encoding: 'utf-8'
    }).stdout;
    return output.trim();
  } catch {
    return '';
  }
}

// Squash all commits from a task into one
export function gitSquashCommits(
  commitMessage: string,
  count: number = 5,
  projectPath: string = DEFAULT_PROJECT_PATH
): boolean {
  try {
    const result = spawnSync('git', [
      'reset', '--soft', `HEAD~${count}` // squash last N commits (configurable)
    ], { cwd: projectPath });

    if (result.status !== 0) return false;

    // Now commit with the provided message
    return gitCommit(commitMessage, projectPath);
  } catch {
    return false;
  }
}

// Get a list of recent commits (for task completion squash detection)
export function getRecentCommits(count: number = 10, projectPath: string = DEFAULT_PROJECT_PATH): Array<{ hash: string; message: string }> {
  try {
    const output = spawnSync('git', [
      'log', '--format=%H %s', `-n`, String(count),
    ], { cwd: projectPath, encoding: 'utf-8' }).stdout;

    return output.trim().split('\n').map((line: string) => {
      const parts = line.split(' ');
      return { hash: parts[0], message: parts.slice(1).join(' ') };
    });
  } catch {
    return [];
  }
}

// Create a checkpoint commit (for Cline-style rollback)
export function gitCreateCheckpoint(label: string, projectPath: string = DEFAULT_PROJECT_PATH): string {
  try {
    const hash = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectPath, encoding: 'utf-8'
    }).stdout.toString().trim();

    spawnSync('git', [
      'tag', `checkpoint-${label}-${Date.now()}`, '-f'
    ], { cwd: projectPath });

    return hash;
  } catch {
    return '';
  }
}

// Restore to a checkpoint (rollback)
export function gitRestoreToCheckpoint(checkpointHash: string, projectPath: string = DEFAULT_PROJECT_PATH): boolean {
  try {
    const result = spawnSync('git', ['reset', '--hard', checkpointHash], { cwd: projectPath });
    return result.status === 0;
  } catch {
    return false;
  }
}

// Stash current changes (for auto-stashing user edits)
export function gitStash(projectPath: string = DEFAULT_PROJECT_PATH): boolean {
  try {
    const result = spawnSync('git', ['stash', '--include-untracked'], { cwd: projectPath });
    return result.status === 0;
  } catch {
    return false;
  }
}

// Pop the most recent stash (restore user edits after AI action)
export function gitStashPop(projectPath: string = DEFAULT_PROJECT_PATH): boolean {
  try {
    const result = spawnSync('git', ['stash', 'pop'], { cwd: projectPath });
    return result.status === 0;
  } catch {
    return false;
  }
}

// Check if there are uncommitted changes
export function hasUncommittedChanges(projectPath: string = DEFAULT_PROJECT_PATH): boolean {
  try {
    const output = spawnSync('git', ['status', '--porcelain'], {
      cwd: projectPath, encoding: 'utf-8'
    }).stdout;
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

// Auto-commit after a successful tool call (e.g., file write)
export function autoCommitAfterAction(
  actionType: string,
  filePath?: string,
  projectPath: string = DEFAULT_PROJECT_PATH
): boolean {
  const message = `OpenLLMCode: ${actionType}${filePath ? ' — ' + filePath : ''}`;

  // Get current state before commit
  const status = getGitStatus(projectPath);
  if (status.staged.length === 0) return true; // nothing to commit

  return gitCommit(message, projectPath);
}