// CheckpointPanel — Cline-style checkpoint rollback panel
import React from 'react';
import { useTaskStore } from '../store/taskStore';

interface CheckpointPanelProps {
  onRestore: (checkpointHash: string) => void;
  onDeleteContextAfter: (checkpointId: string) => void;
}

const CheckpointPanel: React.FC<CheckpointPanelProps> = ({ onRestore, onDeleteContextAfter }) => {
  const { currentTask } = useTaskStore();
  const [expandedCp, setExpandedCp] = React.useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState('');

  if (!currentTask || currentTask.checkpoints.length === 0) {
    return (
      <div className="px-3 py-2 border-t border-[#45475a]">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-xs font-semibold text-[#6c7086] uppercase tracking-wider">📍 Checkpoints</h3>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="text-xs text-[#89b4fa] hover:text-[#b4d0fb] transition-colors"
          >
            + Create
          </button>
        </div>
        <p className="text-xs text-[#585b70] italic">No checkpoints yet. They are created automatically at task milestones.</p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-t border-[#45475a] space-y-1.5">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-semibold text-[#6c7086] uppercase tracking-wider">📍 Checkpoints</h3>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="text-xs text-[#89b4fa] hover:text-[#b4d0fb] transition-colors"
        >
          + Create
        </button>
      </div>

      {/* Checkpoint list */}
      {currentTask.checkpoints.map((cp, idx) => (
        <CheckpointItem
          key={cp.id}
          checkpoint={cp}
          isCurrent={idx === currentTask.checkpoints.length - 1}
          expanded={expandedCp === cp.id}
          onToggleExpand={() => setExpandedCp(expandedCp === cp.id ? null : cp.id)}
          onRestore={() => onRestore(cp.gitCommitHash)}
          onDeleteContextAfter={() => onDeleteContextAfter(cp.id)}
        />
      ))}

      {/* Auto-creation info */}
      <div className="text-[10px] text-[#585b70] mt-2">
        Checkpoints are created automatically at task start/end and after each approval action.
      </div>

      {/* Create checkpoint dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[#313244] rounded-xl shadow-2xl border border-[#45475a] max-w-sm w-full mx-4 p-5 space-y-3">
            <h3 className="text-base font-semibold text-[#cdd6f4]">Create Checkpoint</h3>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Checkpoint label..."
              className="w-full bg-[#1e1e2e] border border-[#45475a] rounded-lg px-3 py-2 text-sm text-[#cdd6f4] placeholder:text-[#6c7086] focus:outline-none focus:border-[#cba6f7]"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  // Trigger IPC to create checkpoint — handled by parent component
                  if (newLabel.trim()) onRestore(''); // placeholder; actual creation via IPC
                  setShowCreateDialog(false);
                  setNewLabel('');
                }}
                className="flex-1 px-4 py-2 bg-[#a6e3a1]/20 hover:bg-[#a6e3a1]/30 text-[#a6e3a1] rounded-lg font-medium text-sm transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => { setShowCreateDialog(false); setNewLabel(''); }}
                className="flex-1 px-4 py-2 bg-[#6c7086]/20 hover:bg-[#6c7086]/30 text-[#a6adc8] rounded-lg font-medium text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Checkpoint Item ──────────────

interface CheckpointItemProps {
  checkpoint: { id: string; label: string; gitCommitHash: string; messageIndex: number; fileChanges?: string[] };
  isCurrent: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onRestore: () => void;
  onDeleteContextAfter: () => void;
}

const CheckpointItem: React.FC<CheckpointItemProps> = ({ checkpoint, isCurrent, expanded, onToggleExpand, onRestore, onDeleteContextAfter }) => {
  const shortHash = checkpoint.gitCommitHash.slice(0, 8);

  return (
    <div className="bg-[#1e1e2e] rounded-lg border border-[#45475a] overflow-hidden">
      {/* Header row */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#313244]/60 transition-colors"
      >
        <span className={`text-xs ${expanded ? 'rotate-90' : ''} transition-transform`}>▶</span>
        <span className="flex-1">
          <span className="text-sm text-[#cdd6f4]">{checkpoint.label}</span>
          {isCurrent && (
            <span className="ml-2 text-[10px] bg-[#a6e3a1]/20 text-[#a6e3a1] px-1.5 py-0.5 rounded">current</span>
          )}
        </span>
        <span className="text-xs font-mono text-[#6c7086]">{shortHash}</span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 py-2 border-t border-[#45475a] space-y-2">
          {/* File changes count */}
          {checkpoint.fileChanges && checkpoint.fileChanges.length > 0 && (
            <div className="text-xs text-[#a6adc8]">
              ▸ {checkpoint.fileChanges.length} file{checkpoint.fileChanges.length !== 1 ? 's' : ''} changed
            </div>
          )}

          {/* Full hash */}
          <code className="block text-[10px] font-mono text-[#585b70] break-all">
            {checkpoint.gitCommitHash}
          </code>

          {/* Action buttons — two dropdown options per plan.md */}
          <div className="flex flex-col gap-1.5 pt-1">
            <button
              onClick={onRestore}
              className="w-full px-3 py-1.5 bg-[#89b4fa]/10 hover:bg-[#89b4fa]/20 text-[#89b4fa] rounded-lg text-xs font-medium transition-colors"
            >
              🔽 Restore to This Point
            </button>
            <button
              onClick={onDeleteContextAfter}
              className="w-full px-3 py-1.5 bg-[#f38ba8]/10 hover:bg-[#f38ba8]/20 text-[#f38ba8] rounded-lg text-xs font-medium transition-colors"
            >
              🗑 Delete Context After This Point
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CheckpointPanel;