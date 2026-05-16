// CheckpointPanel — Cline-style checkpoint rollback panel (self-contained, no parent props needed) — VS Code Dark+ aesthetic
import React from 'react';
import { useTaskStore } from '../store/taskStore';

const CheckpointPanel: React.FC = () => {
  const { currentTask } = useTaskStore();
  const [expandedCp, setExpandedCp] = React.useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState('');

  // Restore to checkpoint via IPC
  const handleRestoreCheckpoint = async (checkpointHash: string) => {
    if (!checkpointHash) return;
    try { await window.api.git.restoreToCheckpoint(checkpointHash); } catch {}
  };

  // Delete context after checkpoint (UI-only — actual message truncation happens in store)
  const handleDeleteContextAfter = (checkpointId: string) => {
    useTaskStore.getState().deleteContextAfterCheckpoint(checkpointId);
  };

  // Create checkpoint via IPC
  const handleCreateCheckpoint = async () => {
    if (!newLabel.trim()) return;
    try {
      await window.api.git.createCheckpoint(newLabel.trim());
      setShowCreateDialog(false);
      setNewLabel('');
    } catch {}
  };

  if (!currentTask || currentTask.checkpoints.length === 0) {
    return (
      <div className="px-3 py-2 border-t border-[#404040]">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-xs font-semibold text-[#858585] uppercase tracking-wider">📍 Checkpoints</h3>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="text-xs text-[#4EC9B0] hover:text-[#89DCEB] transition-colors"
          >
            + Create
          </button>
        </div>
        <p className="text-xs text-[#585b70] italic">No checkpoints yet. They are created automatically at task milestones.</p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-t border-[#404040] space-y-1.5">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-semibold text-[#858585] uppercase tracking-wider">📍 Checkpoints</h3>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="text-xs text-[#4EC9B0] hover:text-[#89DCEB] transition-colors"
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
          onRestore={() => handleRestoreCheckpoint(cp.gitCommitHash)}
          onDeleteContextAfter={() => handleDeleteContextAfter(cp.id)}
        />
      ))}

      {/* Auto-creation info */}
      <div className="text-[10px] text-[#585b70] mt-2">
        Checkpoints are created automatically at task start/end and after each approval action.
      </div>

      {/* Create checkpoint dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreateDialog(false)}>
          <div className="bg-[#252526] rounded-xl shadow-2xl border border-[#404040] max-w-sm w-full mx-4 p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[#D4D4D4]">Create Checkpoint</h3>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Checkpoint label..."
              className="w-full bg-[#1E1E1E] border border-[#404040] rounded-lg px-3 py-2 text-sm text-[#D4D4D4] placeholder:text-[#858585] focus:outline-none focus:border-[#007ACC]"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateCheckpoint}
                className="flex-1 px-4 py-2 bg-[#4EC9B0]/20 hover:bg-[#4EC9B0]/30 text-[#4EC9B0] rounded-lg font-medium text-sm transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => { setShowCreateDialog(false); setNewLabel(''); }}
                className="flex-1 px-4 py-2 bg-[#585b70]/20 hover:bg-[#585b70]/30 text-[#858585] rounded-lg font-medium text-sm transition-colors"
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
    <div className="bg-[#1E1E1E] rounded-lg border border-[#404040] overflow-hidden">
      {/* Header row */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#2A2D2E] transition-colors"
      >
        <span className={`text-xs ${expanded ? 'rotate-90' : ''} transition-transform`}>▶</span>
        <span className="flex-1">
          <span className="text-sm text-[#D4D4D4]">{checkpoint.label}</span>
          {isCurrent && (
            <span className="ml-2 text-[10px] bg-[#4EC9B0]/20 text-[#4EC9B0] px-1.5 py-0.5 rounded">current</span>
          )}
        </span>
        <span className="text-xs font-mono text-[#858585]">{shortHash}</span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 py-2 border-t border-[#404040] space-y-2">
          {/* File changes count */}
          {checkpoint.fileChanges && checkpoint.fileChanges.length > 0 && (
            <div className="text-xs text-[#858585]">
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
              className="w-full px-3 py-1.5 bg-[#007ACC]/20 hover:bg-[#007ACC]/30 text-[#007ACC] rounded-lg text-xs font-medium transition-colors"
            >
              🔽 Restore to This Point
            </button>
            <button
              onClick={onDeleteContextAfter}
              className="w-full px-3 py-1.5 bg-[#F44747]/20 hover:bg-[#F44747]/30 text-[#F44747] rounded-lg text-xs font-medium transition-colors"
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