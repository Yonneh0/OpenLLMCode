// TaskPanel — displays the current task plan with step statuses and progress
import { useTaskStore, getStatusLabel, getStepStatusIcon } from '../store/taskStore';
import React, { useCallback } from 'react';

const TaskPanel: React.FC = () => {
  const { currentTask, completeTask } = useTaskStore();

  // Fix #7: Wire up squash via IPC — called when user clicks the squash button
  const handleSquash = useCallback(async () => {
    if (!currentTask) return;
    try {
      await window.api.git.squashCommits(`Squash: ${currentTask.title}`, currentTask.plan?.length || 5);
      completeTask('Task completed');
    } catch (err: unknown) {
      // Show error in UI — non-fatal, task is already marked as completed
    }
  }, [currentTask]);

  if (!currentTask) return null;

  const totalSteps = currentTask.plan?.length || 0;
  const completedSteps = currentTask.stepsCompleted || 0;
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <div className="px-3 py-2 border-t border-[#45475a] space-y-2">
      {/* Task header */}
      <div>
        <h3 className="text-sm font-semibold text-[#cdd6f4]">{currentTask.title}</h3>
        <p className="text-xs text-[#6c7086] mt-0.5">{getStatusLabel(currentTask.status)}</p>
      </div>

      {/* Progress bar */}
      {totalSteps > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-[#a6adc8]">
            <span>{completedSteps}/{totalSteps} steps</span>
            <span>{progressPct}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#89b4fa] to-[#a6e3a1] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Plan steps */}
      {currentTask.plan && currentTask.plan.length > 0 && (
        <div className="space-y-1">
          {currentTask.plan.map((step) => (
            <PlanStepItem key={step.id} step={step} />
          ))}
        </div>
      )}

       {/* Completion summary + squash button */}
       {currentTask.status === 'completed' && currentTask.completionSummary && (
         <div className="bg-[#a6e3a1]/10 border border-[#a6e3a1]/20 rounded-lg px-3 py-2 text-xs text-[#a6e3a1]">
           ✅ {currentTask.completionSummary}
         </div>
       )}

       {/* Squash button — shown when task has steps but no summary yet */}
       {currentTask.status === 'completed' && !currentTask.completionSummary && (
         <button
           onClick={handleSquash}
           className="w-full px-3 py-1.5 bg-[#89b4fa]/20 hover:bg-[#89b4fa]/30 text-[#89b4fa] rounded-lg text-xs font-medium transition-colors"
         >
           🔧 Squash Task Commits
         </button>
       )}

       {/* Failed state */}
      {currentTask.status === 'failed' && (
        <div className="bg-[#f38ba8]/10 border border-[#f38ba8]/20 rounded-lg px-3 py-2 text-xs text-[#f38ba8]">
          ❌ Task failed. Check the chat for details.
        </div>
      )}
    </div>
  );
};

// ─── Plan Step Item ──────────────

interface PlanStepItemProps {
  step: { id: string; description: string; toolsRequired?: string[]; status: string };
}

const PlanStepItem: React.FC<PlanStepItemProps> = ({ step }) => {
  const icon = getStepStatusIcon(step.status as any);

  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <span className={`flex-1 ${step.status === 'completed' ? 'text-[#6c7086] line-through' : step.status === 'executing' ? 'text-[#f9e2af]' : 'text-[#a6adc8]'}`}>
        {step.description}
      </span>
      {/* Tools required badges */}
      {step.toolsRequired && step.toolsRequired.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {step.toolsRequired.map((tool) => (
            <span key={tool} className="text-[10px] bg-[#45475a]/50 text-[#6c7086] px-1 py-0.5 rounded font-mono">
              {tool}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default TaskPanel;