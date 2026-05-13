// Approval Gate Store — manages pending approval requests for tool calls
import { create } from 'zustand';
import type { ApprovalRequest, ToolType } from '../types';
import { addAlwaysAllowRule } from '../engine/toolRegistry';

interface ApprovalState {
  // Pending approvals queue
  pendingApprovals: ApprovalRequest[];
  currentApproval: ApprovalRequest | null; // the one currently shown to user

  // Actions
  requestApproval: (req: Omit<ApprovalRequest, 'id' | 'status'>) => string;
  approveCurrent: () => void;
  alwaysAllowCurrent: () => void;
  denyCurrent: (reason?: string) => void;
  dismissCurrent: () => void;
  clearAll: () => void;

  // Check if there's a pending approval blocking execution
  isBlocked: boolean;
}

let approvalIdCounter = Date.now();

export const useApprovalStore = create<ApprovalState>((set, get) => ({
  pendingApprovals: [],
  currentApproval: null,
  isBlocked: false,

  // Create a new approval request and show it to the user
  requestApproval: (req: Omit<ApprovalRequest, 'id' | 'status'>) => {
    const id = String(approvalIdCounter++);
    const fullReq: ApprovalRequest = { ...req, id, status: 'pending' };

    set((s) => ({
      pendingApprovals: [...s.pendingApprovals, fullReq],
      currentApproval: fullReq,
      isBlocked: true,
    }));

    return id;
  },

  // Approve the current approval request
  approveCurrent: () => {
    const { currentApproval } = get();
    if (!currentApproval) return;

    set((s) => ({
      pendingApprovals: s.pendingApprovals.map((a) =>
        a.id === currentApproval!.id ? { ...a, status: 'approved' as const } : a
      ),
      currentApproval: null,
      isBlocked: false,
    }));
  },

  // Always allow this pattern — adds to .openllmcode-rules and approves
  alwaysAllowCurrent: () => {
    const { currentApproval } = get();
    if (!currentApproval) return;

    // Add the "always allow" rule based on tool type and file path
    const category = getCategoryForTool(currentApproval.toolType);
    const pattern = currentApproval.filePath || '*';
    addAlwaysAllowRule(category, pattern, `Auto-allowed by user for ${currentApproval.toolType}`);

    // Also approve this specific request
    set((s) => ({
      pendingApprovals: s.pendingApprovals.map((a) =>
        a.id === currentApproval!.id ? { ...a, status: 'approved' as const } : a
      ),
      currentApproval: null,
      isBlocked: false,
    }));
  },

  // Deny the current approval request (optionally with reason)
  denyCurrent: (reason?: string) => {
    const { currentApproval } = get();
    if (!currentApproval) return;

    set((s) => ({
      pendingApprovals: s.pendingApprovals.map((a) =>
        a.id === currentApproval!.id
          ? { ...a, status: 'denied' as const, deniedReason: reason }
          : a
      ),
      currentApproval: null,
      isBlocked: false,
    }));
  },

  // Dismiss the current approval without approving or denying (e.g., user closed the dialog)
  dismissCurrent: () => {
    set({ currentApproval: null, isBlocked: false });
  },

  // Clear all pending approvals
  clearAll: () => {
    set({ pendingApprovals: [], currentApproval: null, isBlocked: false });
  },
}));

// Helper to map tool type to approval category
function getCategoryForTool(toolType: ToolType): string {
  switch (toolType) {
    case 'read_file': return 'file_read';
    case 'write_file':
    case 'create_file': return 'file_write';
    case 'delete_file': return 'file_delete';
    case 'run_command': return 'command_execute';
    case 'search_files':
    case 'glob': return 'file_search';
    default: return 'unknown';
  }
}

// Synchronous helper for the tool registry to wait on approval
export function waitForApproval(approvalId: string): Promise<ApprovalRequest> {
  return new Promise((resolve) => {
    const check = setInterval(() => {
      const req = useApprovalStore.getState().pendingApprovals.find(a => a.id === approvalId);
      if (req && req.status !== 'pending') {
        clearInterval(check);
        resolve(req);
      }
    }, 50);

    // Safety timeout after 60 seconds — auto-deny
    setTimeout(() => {
      clearInterval(check);
      const req = useApprovalStore.getState().pendingApprovals.find(a => a.id === approvalId);
      if (req && req.status === 'pending') {
        useApprovalStore.getState().denyCurrent('Timed out after 60 seconds');
        resolve({ ...req, status: 'denied', deniedReason: 'Timed out' });
      }
    }, 60_000);
  });
}