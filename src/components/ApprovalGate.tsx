// ApprovalGate — four-option approval dialog for tool calls
import React from 'react';
import { useApprovalStore } from '../store/approvalStore';

const ApprovalGate: React.FC = () => {
  const { currentApproval, approveCurrent, alwaysAllowCurrent, denyCurrent, dismissCurrent } = useApprovalStore();

  if (!currentApproval) return null;

  // Build a human-readable description of the tool call
  const toolLabel = getToolLabel(currentApproval.toolType);
  const inputSummary = summarizeInput(currentApproval.input);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-[#313244] rounded-xl shadow-2xl border border-[#45475a] max-w-lg w-full mx-4 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={`${toolLabel} approval`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#45475a]">
          <h2 className="text-base font-semibold text-[#cdd6f4] flex items-center gap-2">
            🔧 {toolLabel} Approval
          </h2>
          <button
            onClick={dismissCurrent}
            className="text-[#6c7086] hover:text-[#cdd6f4] text-lg leading-none"
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
              <span className="text-[#6c7086] mt-0.5">📁</span>
              <code className="bg-[#1e1e2e] px-2 py-0.5 rounded text-[#a6adc8] font-mono text-xs break-all">
                {currentApproval.filePath}
              </code>
            </div>
          )}

          {/* Input summary */}
          {inputSummary && (
            <div className="text-sm text-[#a6adc8]">{inputSummary}</div>
          )}

          {/* Diff preview */}
          {currentApproval.diff && (
            <pre className="bg-[#1e1e2e] border border-[#45475a] rounded-lg p-3 text-xs font-mono overflow-auto max-h-48 leading-relaxed">
              <code dangerouslySetInnerHTML={{ __html: highlightDiff(currentApproval.diff) }} />
            </pre>
          )}

          {/* Warning for destructive operations */}
          {currentApproval.toolType === 'delete_file' && (
            <div className="bg-[#f38ba8]/10 border border-[#f38ba8]/30 rounded-lg px-3 py-2 text-sm text-[#f38ba8]">
              ⚠️ This will permanently delete the file. This action cannot be undone outside of Git history.
            </div>
          )}

          {currentApproval.toolType === 'run_command' && (
            <div className="bg-[#f9e2af]/10 border border-[#f9e2af]/30 rounded-lg px-3 py-2 text-sm text-[#f9e2af]">
              ⚡ This command will be executed in your terminal. Review carefully before approving.
            </div>
          )}
        </div>

        {/* Footer — Four action buttons */}
        <div className="px-5 py-3 border-t border-[#45475a] flex flex-wrap gap-2">
          <button
            onClick={approveCurrent}
            className="flex-1 min-w-[100px] px-4 py-2 bg-[#a6e3a1]/20 hover:bg-[#a6e3a1]/30 text-[#a6e3a1] rounded-lg font-medium text-sm transition-colors"
          >
            ✅ Allow
          </button>
          <button
            onClick={alwaysAllowCurrent}
            className="flex-1 min-w-[100px] px-4 py-2 bg-[#89b4fa]/20 hover:bg-[#89b4fa]/30 text-[#89b4fa] rounded-lg font-medium text-sm transition-colors"
          >
            🔓 Always Allow
          </button>
          <button
            onClick={() => denyCurrent()}
            className="flex-1 min-w-[100px] px-4 py-2 bg-[#f38ba8]/20 hover:bg-[#f38ba8]/30 text-[#f38ba8] rounded-lg font-medium text-sm transition-colors"
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
        className="flex-1 min-w-[100px] px-4 py-2 bg-[#f38ba8]/10 hover:bg-[#f38ba8]/20 text-[#eba0ac] rounded-lg font-medium text-sm transition-colors"
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
        className="flex-1 bg-[#1e1e2e] border border-[#45475a] rounded-lg px-3 py-2 text-sm text-[#cdd6f4] placeholder:text-[#6c7086] focus:outline-none focus:border-[#cba6f7]"
        autoFocus
      />
      <button
        onClick={() => { onDeny(reason || undefined); setShowInput(false); setReason(''); }}
        className="px-3 py-2 bg-[#f38ba8]/20 hover:bg-[#f38ba8]/30 text-[#f38ba8] rounded-lg font-medium text-sm transition-colors"
      >
        Confirm
      </button>
      <button
        onClick={() => { setShowInput(false); setReason(''); }}
        className="px-3 py-2 bg-[#6c7086]/20 hover:bg-[#6c7086]/30 text-[#a6adc8] rounded-lg font-medium text-sm transition-colors"
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
      const cmd = input.command as string;
      return `Command: <code class="text-[#a6e3a1]">${cmd}</code>`;
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

function highlightDiff(diff: string): string {
  // Simple diff highlighting for unified diff format
  return diff
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/^(\+.*$)/gm, '<span style="color:#a6e3a1;background:#a6e3a1/10">$1</span>')
    .replace(/^(-.*$)/gm, '<span style="color:#f38ba8;background:#f38ba8/10">$1</span>')
    .replace(/^(@@.*$)/gm, '<span style="color:#89b4fa;font-weight:bold">$1</span>');
}

export default ApprovalGate;