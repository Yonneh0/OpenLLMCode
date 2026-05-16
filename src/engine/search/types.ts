// ─── Semantic Search Types ──────────────────────────────
// Core types for the semantic search engine with architecture-aware context filtering

import type { ArchitectureType, VMInstance } from '../qemu/types';

// Vector representation of code — used by the vector database for similarity search  
export interface CodeEmbedding {
  id: string;                    // Unique identifier (e.g., file path + line range hash)
  content: string;               // Original code snippet text
  embedding: number[];           // Embedding vector (dimensions depend on model — e.g., 1024 for local models, 768 for OpenAI ada-002)
  metadata: CodeEmbeddingMetadata;
}

export interface CodeEmbeddingMetadata {
  filePath: string;              // Source file path within project
  architecture?: ArchitectureType; // Target QEMU architecture (e.g., "x86_64" for x86_64 code)
  languageId: string;            // Monaco editor language ID (e.g., "javascript", "typescript", "cpp")
  lineStart: number;             // Start line in source file
  lineEnd: number;               // End line in source file
  projectName?: string;          // Cross-project search support
  vmArchitectureContext?: string[]; // QEMU VM architectures this code should be tested against (from project's .openllmcode-toolchainrc)
  commitHash?: string;           // Git commit hash at time of indexing — enables git-blame integration  
  branchName?: string;           // Branch name for cross-project navigation
  fileSize: number;              // File size in bytes — used for relevance scoring
}

// Search result with similarity score and architecture-aware ranking  
export interface CodeReference {
  embeddingId: string;           // Reference to the source CodeEmbedding.id
  filePath: string;              // Resolved file path for display (from metadata.filePath)
  lineStart: number;             // Start line in source file
  lineEnd: number;               // End line in source file  
  score: number;                 // Cosine similarity score — higher = more relevant (0-1 range)
  architectureMatch?: boolean;   // Whether the code is compatible with the requested target QEMU architecture
  vmContexts?: string[];         // QEMU VM architectures this result applies to
  commitHash?: string;           // Git commit hash at time of indexing — for blame visualization  
  branchName?: string;           // Branch name for cross-project navigation
}

// Search query with architecture-aware context filtering  
export interface SemanticSearchQuery {
  text: string;                  // User's search intent (e.g., "find all places that use this pattern")
  maxResults: number;            // Maximum results to return (default: 10)
  projectDir?: string;           // Project directory — filters search to files within this root  
  architectureFilter?: ArchitectureType; // Target QEMU architecture for cross-architecture search
  vmArchitectures?: string[];    // Specific VM architectures to filter by (from .openllmcode-toolchainrc)
  languageFilter?: string[];     // Monaco language IDs — e.g., ["typescript", "javascript"]
  commitHash?: string;           // Search within specific git commit's version of files  
  includeCrossProject: boolean;  // Whether to search across multiple projects (requires cross-project index)
}

// Pattern matching for AI-powered code pattern analysis  
export interface CodePattern {
  id: string;                    // Unique identifier (hash of pattern text + architecture context)
  description: string;           // Human-readable description of the pattern (e.g., "React useEffect cleanup")
  regex?: string;                // Regex match — fallback for patterns without embeddings
  embedding?: number[];          // Embedding vector for semantic similarity search  
  architectures: ArchitectureType[]; // Architectures this pattern applies to (from architecture-specific compiler docs)
  languageIds: string[];         // Languages where this pattern is common
  templateCode?: string;         // Example code snippet matching the pattern — for auto-generated examples from API docs
}

// Usage tracking for AI-powered pattern recognition  
export interface CodeUsage {
  referenceId: string;           // Reference to a CodeReference (from search results)
  filePath: string;              // File referencing this code (e.g., import statement location)
  lineStart: number;             // Line where the usage appears — for cross-project navigation
  lineEnd: number;               // End line of the usage — for display in UI
  contextCode: string;           // Code snippet surrounding the usage — for AI-powered analysis  
  architectureContext?: ArchitectureType[]; // Architectures this usage applies to (from cross-architecture compiler docs)
}

// Cross-project search state — tracks which projects are indexed and their locations  
export interface ProjectIndex {
  id: string;                    // Unique identifier (e.g., project directory path hash)
  name: string;                  // Human-readable project name (from package.json or .openllmcode-toolchainrc)
  rootPath: string;              // Absolute path to the project's source code — used for indexing  
  languages: string[];           // Supported languages (auto-detected from file extensions in project)
  architectures: ArchitectureType[]; // Target QEMU architectures (from .openllmcode-toolchainrc or project config)
  lastIndexedAt: number;         // Timestamp of last successful index — used for incremental indexing  
  fileCount: number;             // Number of indexed files — used for performance optimization
  status: 'indexed' | 'indexing' | 'error'; // Indexing status — used to track progress in UI
}

// Git blame integration types — tracks who changed what and why (for architecture-specific diff detection)  
export interface FileBlameEntry {
  commitHash: string;            // Git commit hash for this line's last modification  
  authorName: string;            // Author name from git config — used in blame visualization UI
  authorEmail: string;           // Author email from git config — used for cross-project blame search
  date: Date;                    // Commit timestamp — used for timeline views in Git blame visualization
  lineNo: number;                // Line number in the file at time of commit  
  originalFile: string;          // File path if this line was moved/copied from another file (git's --follow)
  message: string;               // Commit message for context — shows why the change was made
  architecture?: ArchitectureType; // QEMU architecture target for this change — used in cross-arch diff detection  
}

// Blame visualization config — controls how blame data is displayed in the UI (per QEMU docs for architecture-aware diffing)  
export interface BlameVisualizationConfig {
  showLineNumbers: boolean;      // Whether to display line numbers alongside blame info
  showCommitHashes: boolean;     // Show commit hash alongside author name — for quick reference links
  highlightChanges: boolean;     // Highlight changes in the file since last commit (per QEMU docs for architecture-aware diffing)
  filterByArchitecture?: ArchitectureType; // Show only changes relevant to a specific QEMU architecture target  
}

// ─── Embedding Model Types ──────────────────────────────

export enum EmbeddingModelSource {
  Local = 'local',              // Uses local model via llama.cpp — no external API dependency, runs entirely offline
  OpenAI = 'openai',            // Uses OpenAI embeddings API (ada-002) — requires API key and internet connection  
}

export interface EmbeddingConfig {
  source: EmbeddingModelSource;  // Where the embedding model is hosted — local for privacy, OpenAI for accuracy
  dimensions: number;            // Output vector dimensions — must match the model's native dimensionality (e.g., 1536 for ada-002)
  maxBatchSize?: number;         // Max concurrent embeddings — per QEMU docs for cross-arch compilation parallelism  
}

// ─── Architecture-Aware Search Context ──────────────────────────────

export interface ArchitectureSearchContext {
  architecture: ArchitectureType; // Target QEMU architecture (e.g., "x86_64" for x86_64 code)
  machineType?: string;          // Machine type — from -machine help for the target architecture  
  cpuModel?: string;             // CPU model — per -cpu help for the target architecture
  accelerator: 'kvm' | 'tcg';    // Accelerator preference — KVM when available, TCG fallback (per QEMU docs)
  diskFormats?: string[];        // Supported disk image formats — from Disk Images chapter in QEMU System docs  
  networkBackends?: string[];    // Network backend types — per -netdev help for the target architecture  
}

// Cross-architecture build result — includes results for all architectures (per QEMU multi-arch compilation)
export interface CrossArchitectureBuildResult {
  sourceArch: ArchitectureType;  // Source architecture of the original code being built
  targetArchs: ArchitectureType[]; // Target QEMU architectures to cross-compile against (from .openllmcode-toolchainrc)
  buildStatuses: Map<ArchitectureType, 'success' | 'error'>; // Build status per target architecture  
  errorsByArch: Map<ArchitectureType, string[]>; // Architecture-specific build errors — used in automated bug fixing workflow  
  recommendedVMs: VMInstance[];   // Recommended QEMU VM instances for testing (from getOrCreateArchVMIstance)
}

// ─── Exported Type Aliases ──────────────────────────────

export type EmbeddingVector = number[]; // Alias for embedding dimensions — used throughout the search engine