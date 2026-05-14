// Sidebar component — replaced by inline JSX in App.tsx (no longer imported)
// Kept here for reference — can be deleted if unused.
import React from 'react';
import { useFileTreeStore, FileItem } from '../store/fileTreeStore';

// ─── Recursive file tree item ──────────────────────────────
function TreeItem({ item, depth = 0 }: { item: FileItem; depth?: number }) {
  const { expandedDirs, toggleDir, selectFile, selectedFile } = useFileTreeStore();
  const isExpanded = expandedDirs.has(item.path);
  const isSelected = selectedFile === item.path;

  if (item.type === 'directory') {
    return (
      <>
        <li
          className="flex items-center gap-1.5 py-1 rounded hover:bg-[#313244]/60 cursor-pointer text-sm transition select-none"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => toggleDir(item.path)}
        >
          <span className="text-xs">{isExpanded ? '📂' : '📁'}</span>
          <span className={isSelected ? 'text-[#cba6f7] font-semibold' : 'text-[#cdd6f4]'}>{item.name}/</span>
        </li>
        {isExpanded && item.children?.map((child) => (
          <TreeItem key={child.path} item={child} depth={depth + 1} />
        ))}
      </>
    );
  }

  return (
    <li
      className="flex items-center gap-1.5 py-1 rounded hover:bg-[#313244]/60 cursor-pointer text-sm transition select-none"
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      onClick={() => selectFile(item.path)}
    >
      <span className="text-xs">{getFileIcon(item.name)}</span>
      <span className={isSelected ? 'text-[#cba6f7] font-semibold' : 'text-[#cdd6f4]'}>{item.name}</span>
      {item.sizeMB !== undefined && (
        <span className="text-[#6c7086] text-xs ml-auto">{item.sizeMB} MB</span>
      )}
    </li>
  );
}

// ─── File icon helper ──────────────────────────────────────
function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const icons: Record<string, string> = {
    tsx: '📄', ts: '📘', js: '📜', jsx: '📄',
    css: '🎨', html: '🌐', json: '⚙️', md: '📝',
    py: '🐍', go: '🔵', rs: '🦀', java: '☕',
    sh: '⚡', yml: '📋', yaml: '📋', toml: '📋',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️',
    gguf: '🧠', bin: '⚙️', exe: '⚙️', dll: '⚙️',
  };
  return icons[ext] || '📄';
}

// ─── Sidebar component ──────────────────────────────────────
// Note: This component is no longer used — App.tsx renders sidebar inline instead.
export function Sidebar() {
  const { files, loading, setRootPath } = useFileTreeStore();

  // NOTE: File watcher initialization was moved to App.tsx useEffect (Issue #4 fix)
  const handleChangeFolder = async () => {
    try {
      const folder = await window.api.dialog.selectFolder();
      if (folder) setRootPath(folder);
    } catch { /* dialog not available in dev */ }
  };

  return (
    <aside className="w-60 flex-shrink-0 bg-[#181825] border-r border-[#45475a] flex flex-col">
      {/* Project Controls */}
      <div className="px-3 py-3 border-b border-[#45475a]">
        <h2 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-1">Project</h2>
        <div className="flex gap-1.5 mt-2">
          <button
            className="flex-1 px-2 py-1.5 rounded bg-[#313244] hover:bg-[#45475a] text-sm transition"
            title="Change Root Folder"
            onClick={handleChangeFolder}
          >
            📂 Open Folder
          </button>
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <h2 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-1 mt-1">Files</h2>
        {loading ? (
          <div className="text-sm text-[#6c7086] py-4 text-center">Loading...</div>
        ) : (
          <ul className="space-y-0.5">
            {files.map((item) => (
              <TreeItem key={item.path} item={item} />
            ))}
          </ul>
        )}
      </div>

      {/* MCP Servers */}
      <div className="px-3 py-2 border-t border-[#45475a] space-y-1.5">
        <h2 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wider mb-1 mt-1">MCP</h2>
        <div className="flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100 cursor-pointer transition-opacity">✅ Git Server</div>
      </div>
    </aside>
  );
}