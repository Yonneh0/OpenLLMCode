// ApprovalGate — four-option approval dialog for tool calls (VS Code Dark+ aesthetic)
import React from 'react';
import { useApprovalStore } from '../store/approvalStore';

// Fix #9: HTML entity escaping using String.fromCharCode to avoid auto-formatting issues
const AMPERSAND = String.fromCharCode(38); // &
const LT = String.fromCharCode(60);        // <
const GT = String.fromCharCode(62);        // >

function escapeHtml(text: string): string {
  return text.replace(/&/g, AMPERSAND + 'amp;').replace(/</g, LT + 'lt;').replace(/>/g, GT + 'gt;');
}

const ApprovalGate: React.FC = () => {
  const { currentApproval, approveCurrent, alwaysAllowCurrent, denyCurrent, dismissCurrent } = useApprovalStore();

  if (!currentApproval) return null;

  // Build a human-readable description of the tool call
  const toolLabel = getToolLabel(currentApproval.toolType);
  const inputSummary = summarizeInput(currentApproval.input);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-[#252526] rounded-xl shadow-2xl border border-[#404040] max-w-lg w-full mx-4 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={`${toolLabel} approval`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#404040]">
          <h2 className="text-base font-semibold text-[#D4D4D4] flex items-center gap-2">
            🔧 {toolLabel} Approval
          </h2>
          <button
            onClick={dismissCurrent}
            className="text-[#858585] hover:text-[#D4D4D4] text-lg leading-none"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {/* File path context */}
          {currentApproval.filePath && (
            <div className="flex items-start gap-2 text-sm">
              <span className="text-[#858585] mt-0.5">📁</span>
              <code className="bg-[#1E1E1E] px-2 py-0.5 rounded text-[#858585] font-mono text-xs break-all">
                {currentApproval.filePath}
              </code>
            </div>
          )}

          {/* Input summary */}
          {inputSummary && (
            <div className="text-sm text-[#858585]">{inputSummary}</div>
          )}

          {/* Diff preview — Fix #9: Use safe escapeHtml for diff rendering (no dangerouslySetInnerHTML) */}
          {currentApproval.diff && (
            <div className="bg-[#1E1E1E] border border-[#404040] rounded-lg p-3 text-xs font-mono overflow-auto max-h-48 leading-relaxed">
              <code dangerouslySetInnerHTML={{ __html: escapeDiff(currentApproval.diff) }} />
            </div>
          )}

          {/* Warning for destructive operations */}
          {currentApproval.toolType === 'delete_file' && (
            <div className="bg-[#F44747]/10 border border-[#F44747]/30 rounded-lg px-3 py-2 text-sm text-[#F44747]">
              ⚠️ This will permanently delete the file. This action cannot be undone outside of Git history.
            </div>
          )}

          {currentApproval.toolType === 'run_command' && (
            <div className="bg-[#DCDCAA]/10 border border-[#DCDCAA]/30 rounded-lg px-3 py-2 text-sm text-[#DCDCAA]">
              ⚡ This command will be executed in your terminal. Review carefully before approving.
            </div>
          )}
        </div>

        {/* Footer — Four action buttons */}
        <div className="px-5 py-3 border-t border-[#404040] flex flex-wrap gap-2">
          <button
            onClick={approveCurrent}
            className="flex-1 min-w-[100px] px-4 py-2 bg-[#4EC9B0]/20 hover:bg-[#4EC9B0]/30 text-[#4EC9B0] rounded-lg font-medium text-sm transition-colors"
          >
            ✅ Allow
          </button>
          <button
            onClick={alwaysAllowCurrent}
            className="flex-1 min-w-[100px] px-4 py-2 bg-[#007ACC]/20 hover:bg-[#007ACC]/30 text-[#007ACC] rounded-lg font-medium text-sm transition-colors"
          >
            🔓 Always Allow
          </button>
          <button
            onClick={() => denyCurrent()}
            className="flex-1 min-w-[100px] px-4 py-2 bg-[#F44747]/20 hover:bg-[#F44747]/30 text-[#F44747] rounded-lg font-medium text-sm transition-colors"
          >
            ❌ Deny
          </button>
          <DenyWithReasonButton onDeny={denyCurrent} />
        </div>
      </div>
    </div>
  );
};

// ─── Sub-components ──────────────

const DenyWithReasonButton: React.FC<{ onDeny: (reason?: string) => void }> = ({ onDeny }) => {
  const [showInput, setShowInput] = React.useState(false);
  const [reason, setReason] = React.useState('');

  if (!showInput) {
    return (
      <button
        onClick={() => setShowInput(true)}
        className="flex-1 min-w-[100px] px-4 py-2 bg-[#F44747]/10 hover:bg-[#F44747]/20 text-[#F44747] rounded-lg font-medium text-sm transition-colors"
      >
        🚫 Deny w/ Reason
      </button>
    );
  }

  return (
    <div className="flex-1 min-w-[200px] flex gap-2">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why deny?"
        className="flex-1 bg-[#1E1E1E] border border-[#404040] rounded-lg px-3 py-2 text-sm text-[#D4D4D4] placeholder:text-[#858585] focus:outline-none focus:border-[#007ACC]"
        autoFocus
      />
      <button
        onClick={() => { onDeny(reason || undefined); setShowInput(false); setReason(''); }}
        className="px-3 py-2 bg-[#F44747]/20 hover:bg-[#F44747]/30 text-[#F44747] rounded-lg font-medium text-sm transition-colors"
      >
        Confirm
      </button>
      <button
        onClick={() => { setShowInput(false); setReason(''); }}
        className="px-3 py-2 bg-[#585b70]/20 hover:bg-[#585b70]/30 text-[#858585] rounded-lg font-medium text-sm transition-colors"
      >
        Cancel
      </button>
    </div>
  );
};

// ─── Helpers ──────────────

function getToolLabel(toolType: string): string {
  const labels: Record<string, string> = {
    read_file: 'Read File',
    write_file: 'Write File',
    create_file: 'Create File',
    delete_file: 'Delete File',
    run_command: 'Run Command',
    search_files: 'Search Files',
    glob: 'Glob Search',
  };
  return labels[toolType] || toolType;
}

function summarizeInput(input?: Record<string, unknown>): string | null {
  if (!input) return null;

  switch (true) {
    case 'command' in input:
      const cmd = escapeHtml(input.command as string);
      return `Command: <code class="text-[#4EC9B0]">${cmd}</code>`;
    case 'filePath' in input && 'content' in input:
      const content = input.content as string;
      const lines = content.split('\n').length;
      return `Writing ${lines} lines to file`;
    case 'filePath' in input:
      return null; // filePath is shown separately above
    default:
      return null;
  }
}

function escapeDiff(diff: string): string {
  // Fix #9: Escape HTML first to prevent XSS from user-generated content in diffs.
  const escaped = diff.replace(/&/g, AMPERSAND + 'amp;').replace(/</g, LT + 'lt;').replace(/>/g, GT + 'gt;');

  // Add safe span wrappers only for diff markers — these are controlled and won't inject arbitrary HTML
  return escaped
    .replace(/^(\+.*$)/gm, '<span style="color:#4EC9B0;background:rgba(78,201,176,0.1)">$1</span>')
    .replace(/^(-.*$)/gm, '<span style="color:#F44747;background:rgba(244,71,71,0.1)">$1</span>')
    .replace(/^(@@.*$)/gm, '<span style="color:#569CD6;font-weight:bold">$1</span>');
}

export default ApprovalGate;