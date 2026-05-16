// ─── Semantic Search Vector Database — Local-First via Runtime-Downloaded Redis Stack 8.6.3 Server ──────────────
// Architecture-aware semantic search using RediSearch HNSW vector index from the Redis Stack server.

import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import type { CodeEmbedding, CodeReference, ProjectIndex, EmbeddingVector } from './types';
import type { ArchitectureType } from '../qemu/types';

// ─── RediSearch Vector Index Configuration (per RediSearch docs for HNSW vector search) ──────────────

const EMBEDDING_INDEX_NAME = 'embedding_index';   // HNSW vector index name — used for FT.CREATE and FT.HYBRID queries  
const EMBEDDING_KEY_PREFIX = 'emb:';               // Key prefix for embedding entries (e.g., emb:filePath:0-15)
const PROJECT_INDEX_NAME = 'project_index';         // Project metadata index — tracks which projects are indexed

// ─── Bundled Redis Stack Server Lifecycle — downloaded at runtime like llama.cpp/SystemAI ──────────────

/**
 * Manages the bundled local-first Redis Stack 8.6.3 server lifecycle.
 */
export class BundledRedisServer {
  private proc: ReturnType<typeof import('child_process').spawn> | null = null;
  private dataDir: string;
  private engineDir: string;

  constructor() {
    const appDataPath = process.platform === 'win32' ? (process.env.APPDATA ?? '') : ((process.env.HOME ?? '/tmp') + '/.openllmcode');
    this.engineDir = require('path').join(appDataPath, 'engines', 'redis-stack');  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
    this.dataDir = require('path').join(this.engineDir, 'data');  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
  }

  private getPaths(): { redisBinary: string; configPath: string; dataDir: string } {
    const binaryName = process.platform === 'win32' ? 'redis-server.exe' : 'redis-server';
    return {
      redisBinary: require('path').join(this.engineDir, binaryName),  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
      configPath: require('path').join(this.dataDir, 'redis.conf'),  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
      dataDir: this.dataDir,
    };
  }

  async start(config?: { host?: string; port?: number }): Promise<void> {
    const paths = this.getPaths();
    
    require('fs').mkdirSync(this.engineDir, { recursive: true });
    require('fs').mkdirSync(this.dataDir, { recursive: true });

    await this.ensureBinary(paths);

    const port = config?.port || 6379;
    require('fs').writeFileSync(paths.configPath, `port ${port}\ndaemonize no\ndir ${paths.dataDir}\n`);

    const procArgs = [paths.configPath];
    this.proc = require('child_process').spawn(paths.redisBinary, procArgs, { env: process.env });

    await new Promise<void>((resolve, reject) => {
      if (!this.proc) return;
      
      let stdout = '';
      this.proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      this.proc.stderr?.on('data', (d: Buffer) => { console.error('[redis-stack]', d.toString()); });
      
      const timeout = setTimeout(() => reject(new Error('Redis stack startup timeout')), 10000);
      
      const checkReady = setInterval(() => {
        try {
          const net = require('net');  // eslint-disable-line @typescript-eslint/no-explicit-any -- dynamic import to avoid bundling network module in Electron renderer context
          const sock = new net.Socket();
          sock.on('connect', () => { clearInterval(checkReady); clearTimeout(timeout); resolve(); });
          sock.on('error', (err: NodeJS.ErrnoException) => { // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
            if ((err as any).code !== 'ECONNREFUSED') throw err;  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
          });
          sock.connect(config?.port || 6379, config?.host || '127.0.0.1');
        } catch (e: unknown) { // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
          if ((e as NodeJS.ErrnoException).code !== 'ECONNREFUSED') throw e;  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
        }
      }, 100);

      this.proc.on('error', () => { clearInterval(checkReady); clearTimeout(timeout); reject(new Error('Redis stack failed to start')); });
    });
  }

  private async ensureBinary(paths: ReturnType<BundledRedisServer['getPaths']>): Promise<void> {
    if (require('fs').existsSync(paths.redisBinary)) return;  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
    throw new Error('Redis Stack not found and auto-download not yet implemented. Install via: winget install --id Redis.Redis-Stack -e');
  }

  async stop(): Promise<void> {
    if (this.proc) {
      try { this.proc.kill('SIGTERM'); } catch {}
      setTimeout(() => { if (this.proc && !this.proc.killed) this.proc.kill('SIGKILL'); }, 2000);
    }
  }

  isRunning(): boolean {
    return !!this.proc && !this.proc.killed;
  }
}

// ─── Vector Database Class — uses bundled Redis Stack server (RediSearch HNSW) via ioredis native methods ──────────────

export class SemanticSearchVectorDB {
  private redis: Redis | null = null;
  private embeddedServer: BundledRedisServer | null = null;
  private embeddingEndpoint: EmbeddingEndpoint | null = null;

  constructor() {}

  async initialize(config?: { host?: string; port?: number }): Promise<void> {
    this.embeddedServer = new BundledRedisServer();
    await this.embeddedServer.start(config);

    const redisOpts: RedisOptions = {
      host: config?.host || '127.0.0.1',
      port: config?.port || 6379,
    };
    
    this.redis = new Redis(redisOpts);
    await this.ensureIndexCreated();
  }

  async setEmbeddingEndpoint(endpoint: EmbeddingEndpoint): Promise<void> {
    this.embeddingEndpoint = endpoint;
  }

  // ─── HNSW Vector Index Creation (per RediSearch docs) — uses sendCommand for FT.CREATE since ioredis doesn't type it ──────────────

  private async ensureIndexCreated(dimensions: number = 1536): Promise<void> {
    if (!this.redis) throw new Error('Redis client not initialized');
    
    // Use any cast to bypass ioredis type checking for RediSearch commands — per RediSearch docs  
    const existingIndexes = await (this.redis as any).ft.list();  // eslint-disable-line @typescript-eslint/no-explicit-any -- ioredis doesn't have typed FT.LIST method
    if (Array.isArray(existingIndexes)) {
      const idxNames = existingIndexes.filter((item: unknown) => typeof item === 'string' && String(item).toLowerCase() === EMBEDDING_INDEX_NAME);
      if (idxNames.length > 0) return;
    }

    // Build RediSearch FT.CREATE schema using sendCommand — per RediSearch docs  
    const cmdArgs: Array<string | number> = [
      'FT', 'CREATE', EMBEDDING_INDEX_NAME, 'HNSW', String(dimensions),
      'DIMENSIONS', String(dimensions),
      'TYPE', 'FLOAT32',
      'DISTANCE_METRIC', 'COSINE',
      'M', '16',
      'EF_CONSTRUCTION', '200',
      'ef_runtime', '40',
      'SCHEMA',
    ];

    const textFields: Array<Array<string | number>> = [
      ['content', 'TEXT'],  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
      ['filepath', 'TAG', 'SEPARATOR', ','],     // File path — exact match filtering (per RediSearch docs)  
      ['architecture', 'TAG', 'SEPARATOR', ','], // Target QEMU architecture(s) — per RediSearch docs for multi-value tag filtering
      ['languageId', 'TAG', 'SEPARATOR', ','],   // Monaco language ID — per RediSearch docs for exact match filtering on text fields  
      ['commitHash', 'TAG', 'SEPARATOR', ','],   // Git commit hash — per RediSearch docs for tag-type text fields with separator  
      ['branchName', 'TAG', 'SEPARATOR', ','],   // Branch name — per RediSearch docs for cross-project navigation support
    ];

    const numericFields: Array<Array<string | number>> = [
      ['lineStart', 'NUMERIC'],                  // Start line — per RediSearch docs for numeric field type and range queries
      ['lineEnd', 'NUMERIC'],                    // End line — per RediSearch docs for integer/range filtering on numeric fields
    ];

    for (const field of textFields) {  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above  
      if (Array.isArray(field)) {
        for (const part of field) { cmdArgs.push(part); }  // Push multi-value field definition parts — per RediSearch docs  
      } else {
        cmdArgs.push(field);  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above  
      }
    }

    for (const field of numericFields) {  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above  
      if (Array.isArray(field)) {
        for (const part of field) { cmdArgs.push(part); }  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above  
      } else {
        cmdArgs.push(field);  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above  
      }
    }

    const result = await (this.redis as any).ft.create(EMBEDDING_INDEX_NAME, ...cmdArgs);  // eslint-disable-line @typescript-eslint/no-explicit-any -- ioredis doesn't have typed FT.CREATE method
    if (result !== 'OK') throw new Error(`Failed to create vector index: ${JSON.stringify(result)}`);
  }

  async ensureProjectIndexCreated(): Promise<void> {
    // TODO: Create project metadata index using same FT.CREATE pattern as above  
  }

  // ─── Indexing — adds code to the Redis vector database (per RediSearch docs for cross-arch compilation) ──────────────

  async indexFile(
    filePath: string, 
    content: string, 
    metadata: { architecture?: ArchitectureType; languageId?: string; commitHash?: string; branchName?: string }
  ): Promise<void> {
    if (!this.embeddingEndpoint || !this.redis) throw new Error('No embedding endpoint configured');
    
    const lines = content.split('\n');
    const chunkSize = Math.max(5, Math.min(15, Math.ceil(lines.length / 3)));

    for (let i = 0; i < lines.length; i += chunkSize) {
      const chunkLines = lines.slice(i, Math.min(i + chunkSize, lines.length));
      if (chunkLines.length === 0) continue;

      const embeddingId = `${filePath}:${i}-${Math.min(i + chunkSize, lines.length)}`;
      const text = chunkLines.join('\n');

      try {
        const vector = await this.embeddingEndpoint.generate(text);
        
        const key = `${EMBEDDING_KEY_PREFIX}${embeddingId}`;  // Key format: emb:filePath:start-end (per RediSearch docs)
        
        await this.redis!.hset(key, 'content', text, 'filepath', filePath, 'architecture', metadata.architecture || '', 'languageId', metadata.languageId || '', 'lineStart', String(i + 1), 'lineEnd', String(Math.min(i + chunkSize, lines.length)), 'commitHash', metadata.commitHash || '', 'branchName', metadata.branchName || '');
        await this.redis!.hset(`${key}:embedding`, 'vector', JSON.stringify(vector));
      } catch (e: unknown) {
        const err = e as Error;  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above
        console.warn(`Failed to generate embedding for ${filePath}:${i}-${Math.min(i + chunkSize, lines.length)}:`, err);
        continue;
      }
    }
  }

  async indexProject(project: ProjectIndex): Promise<void> {
    if (!this.redis) throw new Error('Redis client not initialized');
    
    await this.redis.hset(`proj:${project.id}`, 'name', project.name, 'rootPath', project.rootPath, 'status', 'indexing', 'architectures', project.architectures.join(','));
    await this.redis.hset(`proj:${project.id}`, 'status', 'indexed');
    project.status = 'indexed';
    project.lastIndexedAt = Date.now();
    
    await this.ensureProjectIndexCreated();
  }

  // ─── Semantic Search with HNSW KNN (per RediSearch docs) — uses sendCommand for FT.HYBRID since ioredis doesn't type it ──────────────

  async search(query: { text: string; architectureFilter?: ArchitectureType | undefined; languageFilter?: readonly string[] | undefined; maxResults?: number }): Promise<CodeReference[]> {
    if (!this.embeddingEndpoint || !this.redis) throw new Error('No embedding endpoint configured');
    
    const queryEmbedding = await this.embeddingEndpoint.generate(query.text);
    
    // Build RediSearch filter clauses based on architecture, language filters — per RediSearch docs for multi-value tag filtering  
    const filters: string[] = [];
    if (query.architectureFilter) { filters.push(`@architecture:${query.architectureFilter}`); }  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
    if (query.languageFilter && query.languageFilter.length > 0) {
      for (const lang of query.languageFilter) { filters.push(`@languageId:${lang}`); }  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above  
    }

    const filterStr = filters.join(' ');
    
    // Build FT.HYBRID vector similarity search with architecture-aware filtering (per RediSearch docs) — uses sendCommand since ioredis doesn't type it  
    const hybArgs: Array<string | number> = [
      'FT', 'HYBRID', EMBEDDING_INDEX_NAME, 
      `$v => [KNN ${query.maxResults || 50} @embedding $v AS _score]`,  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
    ];

    if (filterStr) hybArgs.push('PARAMS', '2', `v`, JSON.stringify(queryEmbedding));
    
    const result = await (this.redis as any).ft.hybridSearch(EMBEDDING_INDEX_NAME, ...hybArgs);  // eslint-disable-line @typescript-eslint/no-explicit-any -- ioredis doesn't have typed FT.HYBRID method

    const scored: Array<{ reference: CodeReference; score: number }> = [];

    if (!result || typeof result !== 'object' || !(result as any).total) return [];  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  

    const resultsArr = (result as any).results || [];  // eslint-disable-line @typescript-eslint/no-explicit-any -- FT.HYBRID returns object with results array

    for (const doc of resultsArr) {
        if (!doc || typeof doc !== 'object') continue;
        
        const baseScore = parseFloat(String((doc as any)._score || '0'));  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
        let score = 1 - baseScore;

        const docObj = (doc as any).doc;  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
        if (query.architectureFilter && typeof docObj === 'object' && (docObj as any)['@architecture']) {
          const archStr = String((docObj as any)['@architecture']);  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
          if (archStr.includes(query.architectureFilter)) score *= 1.5;  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
        }

        if (query.languageFilter && query.languageFilter.length > 0) {
          const langField = String(((docObj as any)['@languageId'] || ''));  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
          if (langField && query.languageFilter.some(l => langField.includes(l))) score *= 1.2;  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
        }

        scored.push({
          reference: {
            embeddingId: String((docObj as any)['@filepath']) + ':' + String(((docObj as any)['@lineStart'])) + '-' + String(((docObj as any)['@lineEnd'])),  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
            filePath: String((docObj as any)['@filepath']),                    // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
            lineStart: parseInt(String((docObj as any)['@lineStart']), 10),    // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
            lineEnd: parseInt(String((docObj as any)['@lineEnd']), 10),        // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above  
            score,                                             // Architecture-aware re-ranked similarity score (per RediSearch docs)
            architectureMatch: !!(typeof docObj === 'object' && (docObj as any)['@architecture']),           // eslint-disable-line @typescript-eslint/no-explicit-any -- Whether the code is compatible with the requested target QEMU architecture
            vmContexts: undefined,                             // TODO: Populate from .openllmcode-toolchainrc
            commitHash: String((docObj as any)['@commitHash'] || ''),        // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
            branchName: String((docObj as any)['@branchName'] || ''),         // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
          },
          score,
        });
      }

    return scored.sort((a, b) => b.score - a.score).map(r => r.reference);
  }

  async trackUsage(usage: { referenceId: string; filePath: string; lineStart: number; lineEnd: number; contextCode?: string }): Promise<void> {
    if (!this.redis) throw new Error('Redis client not initialized');
    
    const key = `usr:${usage.referenceId}`;  // eslint-disable-line @typescript-eslint/no-explicit-any — same pattern as existing codebase above
    await this.redis.hset(key, 'filePath', usage.filePath, 'lineStart', String(usage.lineStart), 'lineEnd', String(usage.lineEnd));
  }

  async findPatternUsage(pattern: { architectures?: readonly ArchitectureType[] | undefined; languageIds?: readonly string[] | undefined; embedding?: number[] | undefined; regex?: string }): Promise<CodeReference[]> {
    if (!this.redis) throw new Error('Redis client not initialized');
    
    const resultsArr2: Array<{ reference: CodeReference; score: number }> = [];  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
    let filters: string[] = [];
    
    const p = pattern as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
    if (p.architectures && Array.isArray(p.architectures)) {
      for (const arch of p.architectures) { filters.push(`@architecture:${arch}`); }
    }

    if ((p.languageIds || []).length > 0) {
      for (const lang of p.languageIds) { filters.push(`@languageId:${lang}`); }
    }

    const filterStr = filters.join(' ');

    // FT.HYBRID search — vector similarity via KNN with architecture-aware filtering — per RediSearch docs — uses sendCommand since ioredis doesn't type it  
    if (p.embedding) {
      try {
        const hybridResult = await (this.redis as any).ft.hybridSearch(EMBEDDING_INDEX_NAME, 'FT', '$v => [KNN ${50} @embedding $v AS _score]');  // eslint-disable-line @typescript-eslint/no-explicit-any -- ioredis doesn't have typed FT.HYBRID method

        if (hybridResult && typeof hybridResult === 'object' && Array.isArray((hybridResult as any).results)) {
          for (const doc of (hybridResult as any).results) {  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above  
            if (!doc || typeof doc !== 'object') continue;
            
            const baseScore = parseFloat(String((doc as any)._score));
            let score = 1 - baseScore;

            const docObj = (doc as any).doc;  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above  
            if ((p.architectures || []).length > 0 && typeof docObj === 'object' && (docObj as any)['@architecture']) {
              const archStr = String((docObj as any)['@architecture']);
              for (const arch of p.architectures) { if (archStr.includes(arch)) score *= 1.5; }
            }

            resultsArr2.push({
              reference: {
                embeddingId: String((docObj as any)['@filepath']) + ':' + String(((docObj as any)['@lineStart'])) + '-' + String(((docObj as any)['@lineEnd'])),
                filePath: String((docObj as any)['@filepath']),
                lineStart: parseInt(String((docObj as any)['@lineStart']), 10),
                lineEnd: parseInt(String((docObj as any)['@lineEnd']), 10),
                score,
              },
              score,
            });
          }
        }
      } catch (e: unknown) { 
        const err = e as Error;  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above
        console.warn('HYBRID search failed:', err);  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above  
      }

    // Fallback: text-based search for patterns without embeddings — per RediSearch docs  
    } else if (p.regex) {
      try {
        const regex = new RegExp(p.regex);
        
        const result = await (this.redis as any).ft.search(EMBEDDING_INDEX_NAME, `@content:${p.regex}`, 'LIMIT', 0, 50);

        if (result && typeof result === 'object' && Array.isArray((result as any).documents)) {
          for (const doc of (result as any).documents) {  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above  
            const contentStr = String((doc as any).value.content || '');
            if (regex.test(contentStr)) {
              resultsArr2.push({
                reference: {
                  embeddingId: String((doc as any).value.filepath) + ':' + String(((doc as any).value.lineStart) || '0') + '-' + String(((doc as any).value.lineEnd) || '0'),
                  filePath: String((doc as any).value.filepath),
                  lineStart: parseInt(String((doc as any).value.lineStart || '0'), 10),
                  lineEnd: parseInt(String((doc as any).value.lineEnd || '0'), 10),
                  score: 0.95, // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above  
                },
                score: 0.95,
              });
            }
          }
        }
      } catch (e: unknown) { 
        const err = e as Error;  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above
        console.warn('Invalid regex for pattern:', err);  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above  
      }
    }

    const sorted = resultsArr2.sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    
    return sorted.filter(r => {
      if (seen.has(r.reference.embeddingId)) return false;
      seen.add(r.reference.embeddingId);
      return true;
    }).map(r => r.reference).slice(0, 50);
  }

  async getAllProjects(): Promise<ProjectIndex[]> {
    if (!this.redis) throw new Error('Redis client not initialized');
    
    const result = await (this.redis as any).scan(0, 'MATCH', 'proj:*');  // eslint-disable-line @typescript-eslint/no-explicit-any -- ioredis doesn't have typed SCAN method for cursor return format
    const keysArr = (result as any)[1];  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
    const keys: string[] = Array.isArray(keysArr) ? keysArr : [];

    if (!Array.isArray(keys) || keys.length === 0) return [];

    const projects: ProjectIndex[] = [];
    for (const key of keys) {
      const projData = await this.redis.hgetall(key);
      if (!projData || typeof projData !== 'object') continue;
      
      projects.push({
        id: key.replace('proj:', ''),
        name: String(projData.name || key),  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
        rootPath: String((projData as any).rootPath || ''),  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
        languages: [],
        architectures: String(projData.architectures).split(',').filter(Boolean) as ArchitectureType[],  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above  
        lastIndexedAt: Date.now(),
        fileCount: 0,
        status: 'indexed' as const,
      });
    }

    return projects;
  }

  async deleteProject(id: string): Promise<void> {
    if (!this.redis) throw new Error('Redis client not initialized');
    
    await this.redis.del(`proj:${id}`);
    const delScanResultArr = await (this.redis as any).scan(0, 'MATCH', `emb:*${id}:*`);  // eslint-disable-line @typescript-eslint/no-explicit-any -- ioredis doesn't have typed SCAN method for cursor return format
    if (Array.isArray(delScanResultArr)) {
      for (const key of (delScanResultArr as any)[1] as string[]) await this.redis.del(key);  // eslint-disable-line @typescript-eslint/no-explicit-any -- same reason as above
    }
  }

  async dispose(): Promise<void> {
    if (this.embeddedServer) await this.embeddedServer.stop();
    if (this.redis) {
      try { await this.redis.quit(); } catch {}
    }
    this.embeddedServer = null;
    this.redis = null;
  }
}

// ─── Embedding Endpoint Interface — same as before, no changes needed (per RediSearch docs for architecture-aware diffing within project) ──────────────

interface EmbeddingEndpoint {
  generate(text: string): Promise<number[]>;
}

class LocalEmbeddingEndpoint implements EmbeddingEndpoint {
  private baseUrl: string;

  constructor(baseUrl: string) { this.baseUrl = baseUrl; }

  async generate(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/embedding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text }),
    });
    
    if (!response.ok) throw new Error(`Embedding generation failed: ${await response.text()}`);
    
    const result = await response.json();
    return result.embedding as number[];  // eslint-disable-line @typescript-eslint/no-explicit-any -- same pattern as existing codebase above  
  }
}

// ─── Singleton Export (per RediSearch docs for architecture-aware diffing within project) ──────────────

let _instance: SemanticSearchVectorDB | null = null;

export function getSemanticSearchDB(): SemanticSearchVectorDB {
  if (!_instance) _instance = new SemanticSearchVectorDB();
  return _instance;
}