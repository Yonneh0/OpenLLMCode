import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useEditorStore } from '../store/editorStore';
import { PreviewEditor } from './PreviewEditor';

// Local interfaces for types that @monaco-editor/react exposes at runtime but doesn't export as named values (Fix #15)
interface EditorTab { uri: string; label: string; content: string; dirty?: boolean }
interface IStandaloneCodeEditor { getValue(): string; setValue(val: string): void; getModel(): any | null; setModel(model: any): void; onDidChangeModelContent(cb: () => void): void; onDidBlurEditorWidget(cb: () => void): void }

// VS Code Dark+ theme
const darkPlusTheme = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6A9955' },
    { token: 'keyword', foreground: '569CD6' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'type', foreground: '4EC9B0' },
    { token: 'function', foreground: 'DCDCAA' },
    { token: 'variable', foreground: '9CDCFE' },
    { token: 'constant', foreground: '4FC1FF' },
    { token: 'operator', foreground: '569CD6' },
    { token: 'delimiter', foreground: '808080' },
    { token: 'tag', foreground: 'F3762A' },
    { token: 'attribute.name', foreground: '569CD6' },
    { token: 'attribute.value', foreground: 'CE9178' },
  ],
  colors: {
    'editor.background': '#1E1E1E',
    'editor.foreground': '#D4D4D4',
    'editorCursor.foreground': '#F8F8F2',
    'editor.lineHighlightBackground': '#26353A',
    'editorLineNumber.foreground': '#606B79',
    'editorLineNumber.activeForeground': '#C6C6C6',
    'editor.selectionBackground': '#264F78',
    'editor.inactiveSelectionBackground': '#3A3D41',
    'editorIndentGuide.background': '#404040',
    'editorWhitespace.foreground': '#404040',
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

  // General split view (second editor group) — independent of media preview split
  const [splitRightActive, setSplitRightActive] = useState(false);
  const [splitRightUri, setSplitRightUri] = useState<string | null>(null);
  const [showSplitPicker, setShowSplitPicker] = useState(false);

  // Store monaco instance for the right panel editor — use a ref to track mounting state (Fix #15)
  const editorRefRight = useRef<IStandaloneCodeEditor | null>(null);
  const monacoInstanceRefRight = useRef<any>(null);

  // Check if current file supports preview — show "Preview" tab for images/PDFs
  const activeTab = tabs.find(isEditorTab);
  const hasPreview = activeTab && PREVIEWABLE_EXTENSIONS.has(activeTab.uri.split('.').pop()?.toLowerCase() ?? '');

  // Get the right panel's tab content (or null if no file selected)
  const splitRightTab = splitRightUri ? tabs.find((t) => isEditorTab(t) && t.uri === splitRightUri) : null;

  // Register Dark+ theme when Monaco loads
  const handleBeforeMount = useCallback((monaco: any) => {
    monaco.editor.defineTheme('dark-plus', darkPlusTheme as any);
    monacoInstanceRef.current = monaco; // Store for later use (Fix #15)
  }, []);

  // Handle editor mount — set up change listener for auto-save (Fix #15: use @monaco-editor/react's types directly)
  const handleEditorMount = useCallback(
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

  // No file open — show welcome (activeTab is null here, so don't try to access its uri)
  if (!activeTab) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1E1E1E] text-[#858585]">
        <div className="text-center space-y-2">
          <p>Select a file from the tree to start editing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#1E1E1E]">
      {/* Tab bar — VS Code style with blue active indicator + split view controls */}
      {tabs.length > 0 && (
        <div className="flex items-center bg-[#252526] border-b border-[#1E1E1E] overflow-x-auto min-h-7">
          {/* Split view toggle button — always visible when there's an active tab */}
          {activeTab && !splitRightActive && (
            <button
              onClick={() => setShowSplitPicker(true)}
              className="ml-2 mr-1 px-2 py-[3px] bg-[#2D2D2D] hover:bg-[#3C3C3C] text-[#9DA5B4] rounded border border-[#3C3C3C] text-xs cursor-default transition-colors flex-shrink-0"
              title="Split right — choose a file to show in the second editor"
            >
              ⎯⎯+
            </button>
          )}
          {activeTab && splitRightActive && (
            <button
              onClick={() => setSplitRightActive(false)}
              className="ml-2 mr-1 px-2 py-[3px] bg-[#2D2D2D] hover:bg-[#3C3C3C] text-[#9DA5B4] rounded border border-[#3C3C3C] text-xs cursor-default transition-colors flex-shrink-0"
              title="Close right panel"
            >
              ✕
            </button>
          )}

          {tabs.map((tab) => (
            isEditorTab(tab) ? <TabItem key={tab.uri} tab={tab} isActive={tab.uri === activeUri} /> : null
          ))}
        </div>
      )}

      {/* General split view picker — select a file for the right panel */}
      {showSplitPicker && (
        <FilePickerOverlay
          onSelect={(uri) => { setSplitRightActive(true); setSplitRightUri(uri); setShowSplitPicker(false); }}
          onClose={() => setShowSplitPicker(false)}
          activeUri={activeTab.uri}
        />
      )}

      {/* Split view or single view */}
      <div className="flex-1 flex min-h-0">
        {/* Left panel — Monaco editor: shown when not showing preview, or in left split of split view */}
        {!showSplitView || !hasPreview ? (
          <div className={`flex-1 ${showSplitView && hasPreview ? 'w-[50%] border-r border-[#3C3C3C]' : ''} ${splitRightActive ? 'border-r border-[#3C3C3C]' : ''}`}>
            {activeTab ? (
              <Editor
                height="100%"
                language={getLanguageForUri(activeTab.uri)}
                value={activeTab.content}
                theme="dark-plus"
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
              <div className="flex-1 flex items-center justify-center bg-[#1E1E1E] text-[#858585]">
                <div className="text-center space-y-2">
                  <p>Select a file from the tree to start editing</p>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Preview panel — shown when split view is active and current file supports preview */}
        {hasPreview && showSplitView && (
          <div className="flex-1 overflow-hidden border-l border-[#3C3C3C]">
            <PreviewEditor uri={activeTab.uri} />
          </div>
        )}

        {/* Single preview mode — no editor, just the preview */}
        {!showSplitView && hasPreview && activeTab && (
          <div className="flex-1 overflow-hidden border-l border-[#3C3C3C]">
            <PreviewEditor uri={activeTab.uri} />
          </div>
        )}

        {/* Right panel — second editor instance */}
        {splitRightActive && splitRightUri ? (
          <div className="flex-1 overflow-hidden border-l border-[#3C3C3C]">
            {/* Right panel tab bar — only shows the right-panel file label */}
            <div className="flex items-center bg-[#252526] border-b border-[#3C3C3C] px-3 py-[4px] text-xs text-[#9DA5B4]">
              <span className="truncate">{splitRightTab?.label ?? splitRightUri}</span>
            </div>
            {/* Right panel Monaco editor */}
            <Editor
              height="calc(100% - 27px)"
              language={getLanguageForUri(splitRightUri)}
              value={splitRightTab?.content ?? ''}
              theme="dark-plus"
              beforeMount={(monaco) => { monaco.editor.defineTheme('dark-plus', darkPlusTheme as any); monacoInstanceRefRight.current = monaco; }}
              onMount={(editor: any) => {
                editorRefRight.current = editor;
                // Listen for content changes in right panel — auto-save on blur (same pattern as left)
                editor.onDidChangeModelContent(() => {});
                editor.onDidBlurEditorWidget(() => {
                  const tab = tabs.find(isEditorTab);
                  if (!tab || !tab.dirty) return;
                  window?.api?.fs?.writeFile(tab.uri, editor.getValue()).then((ok: boolean) => {
                    if (ok) useEditorStore.getState().markClean(tab.uri);
                  });
                });
              }}
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
          </div>
        ) : null}
      </div>

      {/* Preview toggle button — shown when current file supports preview */}
      {hasPreview && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1E1E1E] border-t border-[#3C3C3C]">
          <span className="text-xs text-[#858585]">View:</span>
          <button 
            onClick={() => setShowSplitView(false)}
            className="px-2.5 py-1 rounded bg-[#3C3C3C] hover:bg-[#404040] text-xs transition"
          >
            Code
          </button>
          <button 
            onClick={() => setShowSplitView(true)}
            className="px-2.5 py-1 rounded bg-[#007ACC]/20 border border-[#007ACC]/40 hover:bg-[#007ACC]/30 text-xs transition"
          >
            Preview
          </button>
        </div>
      )}

      {/* Right panel close button — shown when right panel is active */}
      {splitRightActive && splitRightUri && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1E1E1E] border-t border-[#3C3C3C]">
          <span className="text-xs text-[#858585]">Right:</span>
          <button 
            onClick={() => setSplitRightActive(false)}
            className="px-2.5 py-1 rounded bg-[#3C3C3C] hover:bg-[#404040] text-xs transition"
          >
            Close panel
          </button>
        </div>
      )}
    </div>
  );
};

// Individual tab component — VS Code style tabs with active blue border + dirty indicator
const TabItem: React.FC<{ tab: EditorTab; isActive: boolean }> = ({ tab, isActive }) => {
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);

  return (
    <div
      className={`
        group flex items-center gap-2 px-3 py-[7px] text-xs cursor-pointer select-none border-t-2 min-w-0 max-w-[200px] overflow-hidden
        ${isActive ? 'border-t-[#007ACC] bg-[#1E1E1E] text-white' : 'border-transparent bg-[#2D2D2D] hover:bg-[#2A2D2E] text-[#9DA5B4]'}
      `}
      onClick={() => setActiveTab(tab.uri)}
    >
      {/* File icon */}
      <span className="text-xs w-4 flex-shrink-0 opacity-60">{fileIcon(tab.uri)}</span>

      {/* Label */}
      <span className="truncate">{tab.label}</span>

      {/* Dirty indicator — white dot like VS Code */}
      {tab.dirty && <span className="w-[6px] h-[6px] rounded-full bg-white flex-shrink-0" />}

      {/* Close button — only visible on hover (like VS Code) */}
      <button
        className="ml-auto opacity-0 group-hover:opacity-100 p-0.5 rounded text-[#CCCCCC] hover:bg-[#404040] flex-shrink-0"
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

// Simple file icon based on extension — VS Code style monospace prefix approach
function fileIcon(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  const icons: Record<string, string> = {
    ts: 'TS', tsx: 'TS', js: 'JS', jsx: 'JS', py: 'PY', go: 'GO', rs: 'RS', css: 'CSS', html: 'HTML', json: '{}', md: 'MD', yaml: 'YM', yml: 'YM', sh: '#!', sql: 'SQL',
  };
  return icons[ext] ?? '\u{1F4C4}';
}

// ─── File Picker Overlay — select a file for the right panel in split view ──────────────

interface FilePickerOverlayProps {
  onSelect: (uri: string) => void;
  onClose: () => void;
  activeUri: string;
}

const FilePickerOverlay: React.FC<FilePickerOverlayProps> = ({ onSelect, onClose, activeUri }) => {
  const [files] = useEditorStore((s) => s.tabs);
  const [searchQuery, setSearchQuery] = useState('');

  // Get all open files from the store for picker — only include text-editable files
  const openFiles = files.filter(isEditorTab).map((t) => t.uri);

  // Filter out the active file itself (no need to split with self) and filter by search query
  const filteredFiles = openFiles.filter(
    (uri) => uri !== activeUri && (!searchQuery || uri.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[12vh] z-40" onClick={onClose}>
      <div 
        className="w-[420px] bg-[#1e1e2e] border border-[#313244] rounded-lg shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with search */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-[#181825] border-b border-[#313244]">
          <span className="text-xs text-[#a6adc8] uppercase tracking-wider font-semibold">Split Right</span>
        </div>

        {/* Search box */}
        <div className="px-3 py-2 border-b border-[#313244]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full px-2.5 py-1.5 bg-[#181825] border border-[#313244] rounded text-sm text-[#cdd6f4] focus:outline-none focus:border-[#89b4fa]"
          />
        </div>

        {/* File list */}
        <div className="max-h-72 overflow-y-auto scrollbar-thin">
          {filteredFiles.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-[#6c7086]">
              No other files open. Open a file first to split view.
            </div>
          ) : (
            filteredFiles.map((uri) => {
              const label = uri.split('/').pop() ?? uri;
              return (
                <button
                  key={uri}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#313244] transition-colors"
                  onClick={() => onSelect(uri)}
                >
                  <span className="text-xs opacity-60">{fileIcon(uri)}</span>
                  <span className="text-sm text-[#cdd6f4] truncate">{label}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 bg-[#181825] border-t border-[#313244] flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-xs text-[#6c7086] hover:text-[#cdd6f4] transition-colors"
          >
            Cancel
          </button>

          {/* Open from disk button — for files not yet open */}
          <button
            onClick={async () => {
              const path = await window?.api?.dialog?.selectFile();
              if (path) {
                onSelect(path);
                onClose();
              }
            }}
            className="text-xs text-[#89b4fa] hover:text-[#74c7ec] transition-colors"
          >
            Open from disk...
          </button>
        </div>
      </div>
    </div>
  );
};

// Fix #15: No module-level store access — all components get their own hook call (Issue #15)
