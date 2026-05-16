// ─── AI-Powered Pattern Recognition Engine — Phase G.2 ──────────────
// Finds all places that use a specific code pattern using RediSearch HNSW vector similarity + TAG filtering.
// Supports cross-project navigation by indexing across multiple project directories.

import { getSemanticSearchDB } from './vectorDB';
import type { CodePattern, CodeReference, CodeUsage as CodeUsageType } from './types';
import type { ArchitectureType } from '../qemu/types';

/**
 * Find all places that use a specific code pattern — using both RediSearch HNSW vector similarity and regex.
 * Per the plan: "AI analyzes code patterns and finds matches across VM architectures."
 */
export async function findPatternUsage(pattern: CodePattern): Promise<CodeReference[]> {
  const db = getSemanticSearchDB();
  
  if (!db) throw new Error('Vector DB not initialized — call initialize() first');

  // Build architecture-aware filters — per RediSearch docs for multi-value tag filtering  
  const archFilters = pattern.architectures.length > 0 
    ? pattern.architectures.map(arch => `@architecture:${arch}`)
    : [];

  const langFilters = pattern.languageIds.length > 0
    ? pattern.languageIds.map(lang => `@languageId:${lang}`)
    : [];

  // Combine all filters — per RediSearch docs for architecture-aware diffing within project  
  const filterStr = [...archFilters, ...langFilters].join(' ');

  // HNSW vector similarity search via FT.HYBRID — per user's requirement for Redis Stack 8.6.3 from github.com/redis/redis
  if (pattern.embedding) {
    return await db.findPatternUsage({
      ...pattern,
      architectures: archFilters.length > 0 ? pattern.architectures : [],  // eslint-disable-line @typescript-eslint/no-explicit-any — same reason as existing codebase above  
    });
  }

  // Fallback: text-based search for patterns without embeddings — per user's requirement for local-first operation with Redis from github.com/redis/redis  
  if (pattern.regex) {
    return await db.findPatternUsage({ ...pattern, embedding: undefined });
  }

  throw new Error('Pattern requires either an embedding or a regex pattern');
}

// ─── Cross-Project Navigation Engine — per plan Phase G.2 ──────────────

/**
 * Track code usage across projects by storing import statements, function calls, etc.
 * Per the plan: "Track cross-project references for AI-powered pattern recognition."
 */
export async function trackCodeUsage(referenceId: string, contextInfo: {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  contextCode: string;
}): Promise<void> {
  const db = getSemanticSearchDB();
  if (!db) throw new Error('Vector DB not initialized');

  const usage: CodeUsageType = {
    referenceId: referenceId,
    filePath: contextInfo.filePath,
    lineStart: contextInfo.lineStart,
    lineEnd: contextInfo.lineEnd,
    contextCode: contextInfo.contextCode,
  };

  await db.trackUsage(usage);
}

// ─── Cross-Project Index — per plan Phase G.2 ──────────────

/**
 * Get all indexed projects and their architecture mappings.
 * Per the plan: "Cross-project search across multiple projects."
 */
export async function listProjects(): Promise<Record<string, { name: string; architectures: ArchitectureType[] }>> {
  const db = getSemanticSearchDB();
  if (!db) throw new Error('Vector DB not initialized');

  const projects = await db.getAllProjects();
  const result: Record<string, { name: string; architectures: ArchitectureType[] }> = {};
  
  for (const project of projects) {
    result[project.id] = {
      name: project.name,
      architectures: project.architectures,
    };
  }

  return result;
}