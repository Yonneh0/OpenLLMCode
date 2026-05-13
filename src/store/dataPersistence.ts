// JSON + Markdown data persistence for sessions
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(
  process.platform === 'win32' ? (process.env.APPDATA || '/tmp') : (process.env.HOME || '/tmp'),
  'OpenLLMCode',
);
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const PROJECT_DIR = path.join(DATA_DIR, 'project');

// Ensure directories exist
for (const d of [DATA_DIR, SESSIONS_DIR, PROJECT_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

// ─── Session persistence ──────────────
export interface SessionData {
  id: string;
  title: string;
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
  createdAt: number;
  updatedAt: number;
}

// List all sessions as JSON files
export function listSessions(): SessionData[] {
  const entries = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
  return entries.map((f) => JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8')));
}

// Save a session
export function saveSession(session: SessionData): void {
  const filePath = path.join(SESSIONS_DIR, `${session.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
}

// Load a session by ID
export function loadSession(id: string): SessionData | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, `${id}.json`), 'utf-8'));
  } catch {
    return undefined;
  }
}

// Delete a session
export function deleteSession(id: string): void {
  fs.unlinkSync(path.join(SESSIONS_DIR, `${id}.json`));
}

// ─── Markdown export ──────────────
export function exportSessionToMarkdown(session: SessionData, dest?: string): string {
  const filePath = dest || path.join(DATA_DIR, `session-${session.id}.md`);
  let md = `# ${session.title}\n\n`;
  for (const msg of session.messages) {
    const prefix = msg.role === 'user' ? '**You:**\n' : '**Agent:**\n';
    md += `${prefix}${msg.content.replace(/\n/g, '\n')}\n\n---\n\n`;
  }
  fs.writeFileSync(filePath, md);
  return filePath;
}

// ─── Project file tree (Markdown format) ──────────────
export function exportProjectTree(projectRoot: string): string {
  const lines = ['# OpenLLMCode — Project Context'];
  // Walk the directory and write out as Markdown list
  function walk(dir: string, indent = 0) {
    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        lines.push(`${'  '.repeat(indent)}- 📁 ${entry}`);
        walk(fullPath, indent + 1);
      } else {
        const ext = path.extname(entry);
        const icon = ext === '.ts' || ext === '.tsx' ? '🔷' : ext === '.md' ? '📄' : '📝';
        lines.push(`${'  '.repeat(indent)}- ${icon} ${entry}`);
      }
    }
  }

  walk(projectRoot);
  return lines.join('\n');
}

// ─── Activity log (plaintext, auto-rotated by System AI) ──────────────
const ACTIVITY_LOG = path.join(DATA_DIR, 'activity.log');

export function appendActivityLog(message: string): void {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(ACTIVITY_LOG, `[${timestamp}] ${message}\n`);
}

// ─── Config (JSON) ──────────────
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

export function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); }
  catch { return {}; }
}

export function saveConfig(cfg: Record<string, unknown>) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}