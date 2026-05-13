// Task Store — manages the full task lifecycle (planning → executing → completed/failed)
import { create } from 'zustand';
import type { Task, PlanStep, Checkpoint, AgentMode, TaskStatus } from '../types';

interface TaskState {
  // Current active task
  currentTask: Task | null;
  // History of completed tasks
  taskHistory: Task[];

  // Actions — Task lifecycle
  createTask: (title: string, description: string) => string;
  updateTaskStatus: (status: TaskStatus) => void;
  failTask: (reason: string) => void;

  // Plan management
  addPlanStep: (description: string, toolsRequired?: string[]) => string;
  updateStepStatus: (stepId: string, status: PlanStep['status']) => void;
  completeStep: (stepId: string) => void;

  // Checkpoint management
  createCheckpoint: (label: string, gitCommitHash: string, messageIndex: number, fileChanges?: string[]) => string;
  restoreToCheckpoint: (checkpointId: string) => boolean;
  deleteContextAfterCheckpoint: (checkpointId: string) => void;

  // Completion
  completeTask: (summary?: string) => void;

  // Utility
  clearCurrentTask: () => void;
}

let taskIdCounter = Date.now();
let stepIdCounter = 0;
let checkpointIdCounter = 0;

export const useTaskStore = create<TaskState>((set, get) => ({
  currentTask: null,
  taskHistory: [],

  // ─── Task lifecycle ──────────────

  createTask: (title: string, description: string) => {
    stepIdCounter = 0;
    checkpointIdCounter = 0;
    const id = String(taskIdCounter++);
    const task: Task = {
      id,
      title,
      description,
      status: 'planning',
      plan: [],
      stepsCompleted: 0,
      compressedHistory: [],
      checkpoints: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    set({ currentTask: task });
    return id;
  },

  updateTaskStatus: (status: TaskStatus) => {
    set((s) => ({
      currentTask: s.currentTask ? { ...s.currentTask, status, updatedAt: Date.now() } : null,
    }));
  },

  failTask: (reason: string) => {
    set((s) => {
      if (!s.currentTask) return s;
      const task = { ...s.currentTask, status: 'failed' as TaskStatus, updatedAt: Date.now() };
      // Add to history
      return { currentTask: null, taskHistory: [...s.taskHistory, task] };
    });
  },

  // ─── Plan management ──────────────

  addPlanStep: (description: string, toolsRequired: string[] = []) => {
    const stepId = `step-${++stepIdCounter}`;
    const step: PlanStep = {
      id: stepId,
      description,
      toolsRequired: toolsRequired as PlanStep['toolsRequired'],
      status: 'pending',
    };

    set((s) => ({
      currentTask: s.currentTask
        ? { ...s.currentTask, plan: [...(s.currentTask.plan || []), step], updatedAt: Date.now() }
        : null,
    }));

    return stepId;
  },

  updateStepStatus: (stepId: string, status: PlanStep['status']) => {
    set((s) => {
      if (!s.currentTask || !s.currentTask.plan) return s;
      const plan = s.currentTask.plan.map((step) =>
        step.id === stepId ? { ...step, status } : step
      );
      // Recalculate steps completed
      const stepsCompleted = plan.filter((p) => p.status === 'completed').length;
      return {
        currentTask: { ...s.currentTask, plan, stepsCompleted, updatedAt: Date.now() },
      };
    });
  },

  completeStep: (stepId: string) => {
    get().updateStepStatus(stepId, 'completed');
  },

  // ─── Checkpoint management ──────────────

  createCheckpoint: (label: string, gitCommitHash: string, messageIndex: number, fileChanges: string[] = []) => {
    const cpId = `cp-${++checkpointIdCounter}`;
    const checkpoint: Checkpoint = {
      id: cpId,
      label,
      gitCommitHash,
      messageIndex,
      fileChanges,
    };

    set((s) => ({
      currentTask: s.currentTask
        ? { ...s.currentTask, checkpoints: [...s.currentTask.checkpoints, checkpoint], updatedAt: Date.now() }
        : null,
    }));

    return cpId;
  },

  restoreToCheckpoint: (checkpointId: string) => {
    const task = get().currentTask;
    if (!task) return false;

    const cp = task.checkpoints.find((c) => c.id === checkpointId);
    if (!cp) return false;

    // The actual git reset is handled by the electron main process via IPC.
    // This store method just updates the UI state to reflect the restored checkpoint.
    set({
      currentTask: {
        ...task,
        checkpoints: task.checkpoints.filter((c) => c.id !== checkpointId),
        updatedAt: Date.now(),
      },
    });

    return true;
  },

  deleteContextAfterCheckpoint: (checkpointId: string) => {
    const task = get().currentTask;
    if (!task) return;

    // Remove all checkpoints after the specified one and truncate chat context.
    // The actual message truncation is handled by the chat store.
    set({
      currentTask: {
        ...task,
        checkpoints: task.checkpoints.filter((c) => c.id !== checkpointId),
        updatedAt: Date.now(),
      },
    });
  },

  // ─── Completion ──────────────

  completeTask: (summary?: string) => {
    set((s) => {
      if (!s.currentTask) return s;
      const task = {
        ...s.currentTask,
        status: 'completed' as TaskStatus,
        completionSummary: summary || '',
        updatedAt: Date.now(),
      };
      // Move to history and clear current
      return { currentTask: null, taskHistory: [...s.taskHistory, task] };
    });

    // Auto-trigger squash of task commits (handled by IPC call in the component layer)
  },

  // ─── Utility ──────────────

  clearCurrentTask: () => {
    set({ currentTask: null });
  },
}));

// Helper to get the current mode label for display
export function getModeLabel(mode: AgentMode): string {
  switch (mode) {
    case 'plan': return '📋 Plan';
    case 'act': return '⚡ Act';
    case 're': return '🔍 R/E';
    case 'audit': return '🛡 Audit';
  }
}

// Helper to get the current status label for display
export function getStatusLabel(status: TaskStatus): string {
  switch (status) {
    case 'planning': return '📋 Planning';
    case 'executing': return '⚡ Executing';
    case 'completed': return '✅ Completed';
    case 'failed': return '❌ Failed';
  }
}

// Helper to get step status icon
export function getStepStatusIcon(status: PlanStep['status']): string {
  switch (status) {
    case 'pending': return '⏳';
    case 'approved': return '👍';
    case 'executing': return '▶️';
    case 'completed': return '✅';
    case 'skipped': return '⏭️';
  }
}