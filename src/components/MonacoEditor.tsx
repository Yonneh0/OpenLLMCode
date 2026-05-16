import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useEditorStore } from '../store/editorStore';
import { PreviewEditor } from './PreviewEditor';

// Local interfaces for types that @monaco-editor/react exposes at runtime but doesn't export as named values (Fix #15)
interface EditorTab { uri: string; label: string; content: string; dirty?: boolean }
interface IStandaloneCodeEditor { getValue(): string; setValue(val: string): void; getModel(): any | null; setModel(model: any): void; onDidChangeModelContent(cb: () => void): void; onDidBlurEditorWidget(cb: () => void): void }

const catppuccinTheme = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6C7086' },
    { token: 'keyword', foreground: 'cba6f7' },
    { token: 'string', foreground: 'a6e3a1' },
    { token: 'number', foreground: 'fab387' },
    { token: 'type', foreground: '89b4fa' },
    { token: 'function', foreground: '89b4fa' },
    { token: 'variable', foreground: 'cdd6f4' },
    { token: 'constant', foreground: 'fab387' },
    { token: 'operator', foreground: '89dceb' },
    { token: 'delimiter', foreground: '9399b2' },
    { token: 'tag', foreground: 'f38ba8' },
    { token: 'attribute.name', foreground: 'cba6f7' },
    { token: 'attribute.value', foreground: 'a6e3a1' },
  ],
  colors: {
    'editor.background': '#1E1E2E',
    'editor.foreground': '#CDD6F4',
    'editorCursor.foreground': '#F5E0DC',
    'editor.lineHighlightBackground': '#313244',
    'editorLineNumber.foreground': '#6C7086',
    'editorLineNumber.activeForeground': '#9399B2',
    'editor.selectionBackground': '#585B7044',
    'editor.inactiveSelectionBackground': '#585B7022',
    'editorIndentGuide.background': '#45475A',
    'editorWhitespace.foreground': '#45475A',
  },
};

// File types that support preview (images, PDFs) — these can show a "Preview" tab
const PREVIEWABLE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'pdf']);

// Map file extensions to Monaco language IDs
const extToLanguage: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  go: 'go',
  rs: 'rust',
  cs: 'csharp',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  h: 'cpp',
  hpp: 'cpp',
  css: 'css',
  html: 'html',
  json: 'json',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'shell',
  ps1: 'bat',
  sql: 'sql',
  xml: 'xml',
  toml: 'toml',
};

function getLanguageForUri(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  return extToLanguage[ext] ?? 'plaintext';
}

// Helper: type guard for EditorTab (Fix #15)
function isEditorTab(obj: unknown): obj is EditorTab {
  return typeof obj === 'object' && obj !== null && 'uri' in obj;
}

export const MonacoEditor: React.FC = () => {
  // Fix #15: Use local store methods instead of module-level access (Issue #15)
  const tabs = useEditorStore((s) => s.tabs);
  const activeUri = useEditorStore((s) => s.activeUri);
  const openFile = useEditorStore((s) => s.openFile);
  const closeTab = useEditorStore((s) => s.closeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const updateContent = useEditorStore((s) => s.updateContent);
  const markDirty = useEditorStore((s) => s.markDirty);

  // Fix #15: Use local interface since @monaco-editor/react doesn't export IStandaloneCodeEditor as a value — only in callbacks (Issue #15).
  const editorRef = useRef<IStandaloneCodeEditor | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Store monaco instance from beforeMount for use in model creation later
  const monacoInstanceRef = useRef<any>(null);

  // Split view state — whether to show preview alongside editor for image/PDF files
  const [showSplitView, setShowSplitView] = useState(false);

  // Check if current file supports preview — show "Preview" tab for images/PDFs
  const activeTab = tabs.find(isEditorTab);
  const hasPreview = activeTab && PREVIEWABLE_EXTENSIONS.has(activeTab.uri.split('.').pop()?.toLowerCase() ?? '');

  // Register catppuccin theme when Monaco loads — @monaco-editor/react provides the monaco type at runtime
  const handleBeforeMount = useCallback((monaco: any) => {
    monaco.editor.defineTheme('catppuccin-mocha', catppuccinTheme as any);
    monacoInstanceRef.current = monaco; // Store for later use (Fix #15)
  }, []);

  // Handle editor mount — set up change listener for auto-save (Fix #15: use @monaco-editor/react's types directly)
  const handleEditorMount = useCallback(
    // Fix #15: Use local interface since @monaco-editor/react doesn't export IStandaloneCodeEditor as a value — only in callbacks (Issue #15).
    (editor: any /* IStandaloneCodeEditor */) => {
      editorRef.current = editor;

      // Listen for content changes
      editor.onDidChangeModelContent(() => {
        const tab = tabs.find(isEditorTab);
        if (!tab || tab.uri !== activeUri) return;
        const newContent = editor.getValue();
        updateContent(tab.uri, newContent);
        markDirty(tab.uri);

        // Debounced auto-save on blur (save after 1s of inactivity)
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          // Auto-save: write to disk via IPC
          window?.api?.fs?.writeFile(tab.uri, newContent).then((ok: boolean) => {
            if (ok) useEditorStore.getState().markClean(tab.uri);
          });
        }, 1000);
      });

      // Auto-save on blur
      editor.onDidBlurEditorWidget(() => {
        const tab = tabs.find(isEditorTab);
        if (!tab || !tab.dirty) return;
        window?.api?.fs?.writeFile(tab.uri, editor.getValue()).then((ok: boolean) => {
          if (ok) useEditorStore.getState().markClean(tab.uri);
        });
      });
    },
    [activeUri, tabs, updateContent, markDirty]
  );

  // When active tab changes, ensure Monaco model is current
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeUri) return;

    const tab = tabs.find(isEditorTab);
    if (tab && tab.uri === activeUri) {
      const model = editor.getModel();
      if (!model || model.uri.path !== tab.uri) {
        // Create new model for this file — use stored monaco instance from beforeMount (Fix #15)
        const monaco = monacoInstanceRef.current;
        const newModel = monaco.editor.createModel(
          tab.content,
          getLanguageForUri(tab.uri),
          monaco.Uri.parse(`file:///` + tab.uri)
        );
        editor.setModel(newModel);
      } else if (model.getValue() !== tab.content) {
        // Same model — just update content if needed
        model.setValue(tab.content);
      }
    }
  }, [activeUri, tabs]);

  // Keyboard shortcuts: Ctrl+S to save, Alt+Enter for preview toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const editor = editorRef.current;
        const tab = tabs.find(isEditorTab);
        if (editor && tab && tab.uri === activeUri) {
          window.api.fs.writeFile(tab.uri, editor.getValue()).then((ok: boolean) => {
            // Fix #15: Use store directly via useEffect closure instead of module-level access
            useEditorStore.getState().markClean(tab.uri);
          });
        }
      }
      
      // Alt+Enter to toggle split view / preview mode for image/PDF files
      if (e.altKey && e.key === 'Enter') {
        const tab = tabs.find(isEditorTab);
        if (tab) {
          const ext = tab.uri.split('.').pop()?.toLowerCase() ?? '';
          if (PREVIEWABLE_EXTENSIONS.has(ext)) {
            setShowSplitView(prev => !prev);
          }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeUri, tabs]);

  // No file open — show welcome
  if (!activeTab) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1e1e2e] text-[#6c7086]">
        <div className="text-center space-y-2">
          <div className="text-4xl">📝</div>
          <p>Select a file from the tree to start editing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e]">
      {/* Tab bar */}
      {tabs.length > 0 && (
        <div className="flex items-center bg-[#181825] border-b border-[#313244] overflow-x-auto scrollbar-thin">
          {tabs.map((tab) => (
            isEditorTab(tab) ? <TabItem key={tab.uri} tab={tab} isActive={tab.uri === activeUri} /> : null
          ))}
        </div>
      )}

      {/* Split view or single view */}
      <div className="flex-1 flex min-h-0">
        {/* Monaco editor — shown when not showing preview, or in left split of split view */}
        {!showSplitView || !hasPreview ? (
          <div className={`flex-1 ${hasPreview && showSplitView ? 'w-[50%] border-r border-[#313244]' : ''}`}>
            {activeTab ? (
              <Editor
                height="100%"
                language={getLanguageForUri(activeTab.uri)}
                value={activeTab.content}
                theme="catppuccin-mocha"
                beforeMount={handleBeforeMount}
                onMount={handleEditorMount}
                options={{
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                  minimap: { enabled: true },
                  tabSize: 2,
                  wordWrap: 'on',
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  renderWhitespace: 'selection',
                  bracketPairColorization: { enabled: true },
                  formatOnPaste: true,
                  formatOnType: true,
                }}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center bg-[#1e1e2e] text-[#6c7086]">
                <div className="text-center space-y-2">
                  <div className="text-4xl">📝</div>
                  <p>Select a file from the tree to start editing</p>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Preview panel — shown when split view is active and current file supports preview */}
        {hasPreview && showSplitView && (
          <div className="flex-1 overflow-hidden">
            <PreviewEditor uri={activeTab.uri} />
          </div>
        )}

        {/* Single preview mode — no editor, just the preview */}
        {!showSplitView && hasPreview && activeTab && (
          <div className="flex-1 overflow-hidden">
            <PreviewEditor uri={activeTab.uri} />
          </div>
        )}
      </div>

      {/* Preview toggle button — shown when current file supports preview */}
      {hasPreview && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1e1e2e] border-t border-[#45475a]">
          <span className="text-xs text-[#6c7086]">View:</span>
          <button 
            onClick={() => setShowSplitView(false)}
            className="px-2.5 py-1 rounded bg-[#313244] hover:bg-[#45475a] text-xs transition"
          >
            📝 Code
          </button>
          <button 
            onClick={() => setShowSplitView(true)}
            className="px-2.5 py-1 rounded bg-[#cba6f7]/20 border border-[#cba6f7]/40 hover:bg-[#cba6f7]/30 text-xs transition"
          >
            🖼️ Preview
          </button>
        </div>
      )}
    </div>
  );
};

// Individual tab component — Fix #15: Use Zustand hooks directly for store methods (Issue #15)
const TabItem: React.FC<{ tab: EditorTab; isActive: boolean }> = ({ tab, isActive }) => {
  // Fix #15: Use Zustand hooks directly for store methods (Issue #15)
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);

  return (
    <div
      className={`
        flex items-center gap-1.5 px-3 py-1.5 text-sm cursor-pointer select-none border-r border-[#313244] min-w-0 max-w-[200px]
        ${isActive ? 'bg-[#1e1e2e] text-[#cdd6f4]' : 'bg-[#181825] text-[#6c7086] hover:bg-[#1e1e2e]'}
      `}
      onClick={() => setActiveTab(tab.uri)}
    >
      {/* File icon */}
      <span className="text-xs flex-shrink-0">{fileIcon(tab.uri)}</span>

      {/* Label */}
      <span className="truncate">{tab.label}</span>

      {/* Dirty indicator */}
      {tab.dirty && <span className="w-2 h-2 rounded-full bg-[#fab387] flex-shrink-0" />}

      {/* Close button */}
      <button
        className="ml-auto p-0.5 rounded hover:bg-[#45475a] flex-shrink-0 text-[#6c7086] hover:text-[#cdd6f4]"
        onClick={(e) => {
          e.stopPropagation();
          closeTab(tab.uri);
        }}
      >
        ✕
      </button>
    </div>
  );
};

// Simple file icon based on extension — Fix #15: Use local interface since module resolution fails in strict mode (Issue #15).
function fileIcon(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  const icons: Record<string, string> = {
    ts: '🔷', tsx: '⚛️', js: '📜', jsx: '⚛️',
    py: '🐍', go: '🔵', rs: '🦀', cs: '💜', java: '☕',
    cpp: '⚙️', c: '⚙️', h: '⚙️', css: '🎨', html: '🌐',
    json: '📋', md: '📝', yaml: '⚙️', yml: '⚙️', sh: '💻', sql: '🗃️',
  };
  return icons[ext] ?? '📄';
}

// Fix #15: No module-level store access — all components get their own hook call (Issue #15)