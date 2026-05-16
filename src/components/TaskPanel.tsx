// TaskPanel — displays the current task plan with step statuses and progress (VS Code Dark+ aesthetic)
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
    <div className="px-3 py-2 border-t border-[#404040] space-y-2">
      {/* Task header */}
      <div>
        <h3 className="text-xs font-semibold text-[#CCCCCC]">{currentTask.title}</h3>
        <p className="text-[11px] text-[#858585] mt-0.5">{getStatusLabel(currentTask.status)}</p>
      </div>

      {/* Progress bar — thin VS Code style */}
      {totalSteps > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-[#858585]">
            <span>{completedSteps}/{totalSteps} steps</span>
            <span>{progressPct}%</span>
          </div>
          <div className="w-full h-0.5 bg-[#1E1E1E] rounded overflow-hidden">
            <div
              className="h-full bg-[#007ACC]"
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
         <div className="bg-[#4EC9B0]/10 border border-[#4EC9B0]/20 rounded px-3 py-1.5 text-[11px] text-[#4EC9B0]">
           ✅ {currentTask.completionSummary}
         </div>
       )}

       {/* Squash button — shown when task has steps but no summary yet */}
       {currentTask.status === 'completed' && !currentTask.completionSummary && (
         <button
           onClick={handleSquash}
           className="w-full px-3 py-1.5 bg-[#007ACC]/20 hover:bg-[#007ACC]/30 text-[#007ACC] rounded text-[11px] font-medium transition-colors"
         >
           🔧 Squash Task Commits
         </button>
       )}

       {/* Failed state */}
      {currentTask.status === 'failed' && (
        <div className="bg-[#F44747]/10 border border-[#F44747]/20 rounded px-3 py-1.5 text-[11px] text-[#F44747]">
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
    <div className="flex items-start gap-2 text-[11px]">
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <span className={`flex-1 ${step.status === 'completed' ? 'text-[#858585] line-through' : step.status === 'executing' ? 'text-[#DCDCAA]' : 'text-[#858585]'}`}>
        {step.description}
      </span>
      {/* Tools required badges */}
      {step.toolsRequired && step.toolsRequired.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {step.toolsRequired.map((tool) => (
            <span key={tool} className="text-[9px] bg-[#404040]/50 text-[#858585] px-1 py-0.5 rounded font-mono">
              {tool}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default TaskPanel;