// ─── Semantic Search Panel — Phase G.1-G.2 ──────────────
// Architecture-aware semantic search with RediSearch HNSW vector index for code navigation.
// Per plan: "Find code by meaning, not just text" + architecture-specific filtering.

import React, { useCallback, useEffect, useState } from 'react';
import type { ArchitectureType } from '../engine/qemu/types';
import { getSemanticSearchDB } from '../engine/search/vectorDB';
import { findPatternUsage, listProjects } from '../engine/search/patternEngine';
import { getPromptTemplates, generatePrompt } from '../engine/search/promptEngine';

const ARCHITECTURES: ArchitectureType[] = [
  'x86_64', 'i386', 'aarch64', 'armv7l', 'riscv64', 'riscv32', 'avr',
  'mips', 'mips64', 'mipsel', 'mips64el', 'ppc', 'ppc64', 'ppcemb', 'sparc', 'sparc64'
];

const LANGUAGES = ['typescript', 'javascript', 'cpp', 'python', 'rust', 'go', 'java', 'c'];

// ─── Main Panel Component ──────────────

export const SemanticSearchPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'search' | 'patterns' | 'projects'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [architectureFilter, setArchitectureFilter] = useState<string>('');
  const [languageFilter, setLanguageFilter] = useState<string>('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [patterns, setPatterns] = useState<Array<{ id: string; description: string }>>([]);

  // Search handler — uses RediSearch HNSW vector similarity search (Phase G.1)
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    try {
      const db = getSemanticSearchDB();
      if (!db) throw new Error('Vector DB not initialized');

      const query: any = { text: searchQuery };
      
      // Apply architecture filter (Phase G.1 — architecture-aware context filtering)
      if (architectureFilter) {
        query.architectureFilter = architectureFilter as ArchitectureType;
      }
      
      // Apply language filter (Phase G.1 — per Monaco language ID filtering)
      if (languageFilter) {
        query.languageFilter = [languageFilter];
      }

      const searchResults = await db.search(query);
      setResults(searchResults || []);
    } catch (err: any) {
      console.error('Semantic search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, architectureFilter, languageFilter]);

  // Load patterns on mount (Phase G.2 — pattern recognition engine)
  useEffect(() => {
    async function loadPatterns() {
      try {
        const templates = getPromptTemplates('code-generation');
        setPatterns(templates.map(t => ({ id: t.id, description: t.description })));
      } catch {}
    }
    loadPatterns();
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="px-3 py-2 bg-[#181825]/80 border-b border-[#313244] flex gap-2">
        {(['search', 'patterns', 'projects'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === tab ? 'bg-[#89b4fa]/10 text-[#89b4fa]' : 'text-[#6c7086] hover:bg-[#313244]'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div className="flex flex-col h-full">
          {/* Search input area */}
          <div className="p-3 space-y-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search code by meaning (e.g., 'find all places that use this pattern')..."
              className="w-full px-3 py-2 bg-[#1e1e2e] border border-[#313244] rounded-lg text-xs text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
            />

            {/* Filters row */}
            <div className="flex gap-2">
              <select
                value={architectureFilter}
                onChange={(e) => setArchitectureFilter(e.target.value)}
                className="px-2 py-1 bg-[#1e1e2e] border border-[#313244] rounded text-xs text-[#cdd6f4]"
              >
                <option value="">All Architectures</option>
                {ARCHITECTURES.map(arch => (
                  <option key={arch} value={arch}>{arch}</option>
                ))}
              </select>

              <select
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
                className="px-2 py-1 bg-[#1e1e2e] border border-[#313244] rounded text-xs text-[#cdd6f4]"
              >
                <option value="">All Languages</option>
                {LANGUAGES.map(lang => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>

              <button
                onClick={handleSearch}
                disabled={!searchQuery.trim() || loading}
                className="px-3 py-1 bg-[#89b4fa] hover:bg-[#74c7ec] text-[#1e1e2e] font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>

            {/* Architecture note */}
            <p className="text-[10px] text-[#6c7086]">
              ℹ️ Results are ranked by similarity score with architecture-aware filtering per RediSearch HNSW index.
            </p>
          </div>

          {/* Results area */}
          <div className="flex-1 overflow-y-auto px-3 pb-2 scrollbar-thin">
            {loading && (
              <div className="text-center py-4 text-xs text-[#6c7086]">Searching...</div>
            )}

            {!loading && results.length === 0 && searchQuery.trim() && (
              <div className="text-center py-4 text-xs text-[#6c7086]">No results found</div>
            )}

            {/* Search result items — each shows code snippet with architecture context */}
            {results.map((result: any, idx: number) => (
              <ResultItem key={idx} result={result} />
            ))}
          </div>
        </div>
      )}

      {/* Patterns Tab (Phase G.2 — AI-powered pattern recognition) */}
      {activeTab === 'patterns' && (
        <div className="flex flex-col h-full">
          <div className="p-3 overflow-y-auto scrollbar-thin space-y-2">
            <h4 className="text-xs font-semibold text-[#9399b2] uppercase tracking-wider mb-1">Code Patterns</h4>

            {patterns.length === 0 && (
              <div className="text-center py-4 text-xs text-[#6c7086]">No patterns loaded yet. Search code first to discover patterns.</div>
            )}

            {/* Pattern items — shows description and allows searching for pattern usage */}
            {patterns.map(pattern => (
              <PatternItem key={pattern.id} pattern={pattern} />
            ))}
          </div>
        </div>
      )}

      {/* Projects Tab (Phase G.2 — cross-project navigation) */}
      {activeTab === 'projects' && (
        <ProjectsList />
      )}
    </div>
  );
};

// ─── Individual Search Result Item ──────────────

const ResultItem: React.FC<{ result: any }> = ({ result }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-[#1E1E1E]/60 border border-[#404040] rounded p-2.5 space-y-1.5">
      {/* Header row with score */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#D4D4D4]">{result.filePath}</span>
        <span className="px-1.5 py-0.5 rounded bg-[#89b4fa]/20 text-[#89b4fa] text-[9px]">
          Score: {Math.round(result.score * 100)}%
        </span>
      </div>

      {/* Line range */}
      <div className="text-[10px] text-[#858585]">
        Lines {result.lineStart}-{result.lineEnd}
        {result.architectureMatch && (
          <> • <span className="text-[#a6e3a1]">Architecture match</span></>
        )}
      </div>

      {/* Code snippet */}
      <pre className="bg-[#181825]/60 border border-[#404040] rounded p-2 text-[10px] font-mono text-[#cdd6f4] overflow-x-auto">
        {expanded ? result.content : `${result.content.slice(0, 300)}${result.content.length > 300 ? '...' : ''}`}
      </pre>

      {/* Expand/collapse */}
      {result.content.length > 300 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-[#89b4fa] hover:text-[#74c7ec]"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {/* Commit hash and branch info (for Git blame integration — Phase G.3) */}
      {result.commitHash && (
        <div className="text-[10px] text-[#6c7086]">
          Commit: <code className="bg-[#3C3C3C]/60 px-1 rounded">{result.commitHash.slice(0, 8)}</code>
          {result.branchName && <> • Branch: {result.branchName}</>}
        </div>
      )}

      {/* Architecture context (from .openllmcode-toolchainrc) */}
      {result.vmContexts && result.vmContexts.length > 0 && (
        <div className="text-[10px] text-[#6c7086]">
          VM Contexts: {result.vmContexts.join(', ')}
        </div>
      )}
    </div>
  );
};

// ─── Pattern Item — shows pattern description and allows searching for usage ──────────────

const PatternItem: React.FC<{ pattern: { id: string; description: string } }> = ({ pattern }) => {
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  // Search for all places that use this pattern (Phase G.2 — AI-powered pattern recognition)
  const handleSearchPattern = useCallback(async () => {
    setSearching(true);
    try {
      const usageResults = await findPatternUsage({
        id: pattern.id,
        description: pattern.description,
        architectures: [] as ArchitectureType[], // No filter — search all arches
        languageIds: [], // No filter — search all languages
        templateCode: '', // Pattern-specific code example (not provided here)
      });
      setResults(usageResults || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [pattern]);

  return (
    <div className="bg-[#1E1E1E]/60 border border-[#404040] rounded p-2.5 space-y-1.5">
      {/* Pattern header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#D4D4D4]">{pattern.description}</span>
        <button
          onClick={handleSearchPattern}
          disabled={searching}
          className="px-2 py-0.5 rounded bg-[#89b4fa]/20 hover:bg-[#89b4fa]/30 text-xs transition-colors disabled:opacity-50"
        >
          {searching ? 'Searching...' : 'Find Usage'}
        </button>
      </div>

      {/* Pattern usage results */}
      {results.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] text-[#6c7086]">Found {results.length} usages:</span>
          {results.map((result: any, idx: number) => (
            <ResultItem key={idx} result={result} />
          ))}
        </div>
      )}

      {/* Pattern description */}
      <p className="text-[10px] text-[#6c7086]">
        Click "Find Usage" to find all places in the codebase that use this pattern.
      </p>
    </div>
  );
};

// ─── Cross-Project Index — lists indexed projects and their architecture mappings (Phase G.2) ──────────────

const ProjectsList: React.FC = () => {
  const [projects, setProjects] = useState<Array<{ id: string; name: string; architectures: ArchitectureType[] }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProjects() {
      try {
        const projList = await listProjects();
        setProjects(Object.entries(projList).map(([id, info]) => ({ id, ...info })));
      } catch {} finally {
        setLoading(false);
      }
    }
    loadProjects();
  }, []);

  return (
    <div className="p-3 overflow-y-auto scrollbar-thin space-y-2">
      <h4 className="text-xs font-semibold text-[#9399b2] uppercase tracking-wider mb-1">Indexed Projects</h4>

      {loading && <div className="text-center py-4 text-xs text-[#6c7086]">Loading projects...</div>}

      {!loading && projects.length === 0 && (
        <div className="text-center py-4 text-xs text-[#6c7086]">No projects indexed. Search code in a project to index it.</div>
      )}

      {projects.map(project => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
};

// ─── Individual Project Card — shows name, architectures, and file count ──────────────

const ProjectCard: React.FC<{ project: { id: string; name: string; architectures: ArchitectureType[] } }> = ({ project }) => (
  <div className="bg-[#1E1E1E]/60 border border-[#404040] rounded p-2.5 space-y-1.5">
    {/* Header */}
    <span className="text-xs font-semibold text-[#D4D4D4]">{project.name}</span>

    {/* Architecture tags */}
    {project.architectures.length > 0 && (
      <div className="flex flex-wrap gap-1">
        {project.architectures.map(arch => (
          <span key={arch} className="px-1.5 py-0.5 rounded bg-[#89b4fa]/20 text-[#89b4fa] text-[9px]">{arch}</span>
        ))}
      </div>
    )}

    {/* File count placeholder (would be populated from project metadata) */}
    <span className="text-[10px] text-[#6c7086]">Indexed — {project.architectures.length > 0 ? `${project.architectures.length} architecture(s)` : 'No architecture context'}</span>
  </div>
);

export default SemanticSearchPanel;