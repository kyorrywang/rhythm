import { ChevronDown, ChevronUp, CheckSquare, X, Check, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { themeRecipes } from '@/shared/theme/recipes';
import { Button } from '@/shared/ui/Button';
import { TaskDockProps } from '../types';

const TaskItem = ({ task }: { task: TaskDockProps['tasks'][number] }) => {
  const isCompleted = task.status === 'completed';
  const isRunning = task.status === 'running';
  const isError = task.status === 'error';

  return (
    <div className={cn(
      "flex items-center gap-[var(--theme-toolbar-gap)] text-[length:var(--theme-body-size)] transition-colors",
      isCompleted ? "text-[var(--theme-text-muted)]" : isRunning ? "text-[var(--theme-text-primary)]" : isError ? "text-[var(--theme-danger-text)]" : "text-[var(--theme-text-secondary)]"
    )}>
      <div className={cn(
        "w-3.5 h-3.5 flex items-center justify-center shrink-0 rounded-[calc(var(--theme-radius-control)*0.35)]",
        isCompleted ? "bg-[var(--theme-surface-muted)] border border-[var(--theme-border)]" : 
        isRunning ? "bg-[var(--theme-warning-surface)] border border-[var(--theme-warning-border)]" : 
        isError ? "border border-[var(--theme-danger-border)] bg-[var(--theme-danger-surface)]" : 
        "border border-[var(--theme-border)] bg-transparent"
      )}>
        {isCompleted && <Check size={10} className="text-[var(--theme-text-muted)]" strokeWidth={3} />}
        {isRunning && <Loader2 size={10} className="animate-spin text-[var(--theme-warning-text)]" />}
        {isError && <X size={10} className="text-[var(--theme-danger-text)]" />}
      </div>
      <span className={cn(isCompleted && "line-through")}>{task.text}</span>
    </div>
  );
};

export const TaskDock = ({ tasks, isMinimized, onToggleMinimize }: TaskDockProps) => {
  const completed = tasks.filter(t => t.status === 'completed').length;
  const total = tasks.length;
  const allDone = completed === total && total > 0;

  if (isMinimized) {
    return (
      <div
        className="border-b-[var(--theme-divider-width)] border-[var(--theme-border)] bg-[linear-gradient(180deg,var(--theme-surface)_0%,var(--theme-panel-bg)_100%)] px-[var(--theme-panel-padding-x)] py-[calc(var(--theme-panel-padding-y)*0.6)] transition-all cursor-pointer hover:bg-[var(--theme-surface-muted)] flex items-center justify-between"
        onClick={onToggleMinimize}
      >
        <div className={`flex items-center gap-[var(--theme-toolbar-gap)] text-[length:var(--theme-meta-size)] ${themeRecipes.description()}`}>
          <CheckSquare size={13} className={allDone ? "text-[var(--theme-success-text)]" : "text-[var(--theme-text-muted)]"} />
          <span>已完成 {completed}/{total} 个任务</span>
        </div>
        <ChevronUp size={14} className="text-[var(--theme-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="border-b-[var(--theme-divider-width)] border-[var(--theme-border)] bg-[linear-gradient(180deg,var(--theme-surface)_0%,var(--theme-panel-bg)_100%)] px-[var(--theme-panel-padding-x)] py-[calc(var(--theme-panel-padding-y)*0.75)] transition-all">
      <div className={`mb-[var(--theme-toolbar-gap)] flex items-center justify-between ${themeRecipes.sectionTitle()}`}>
        <div className="flex items-center gap-[var(--theme-toolbar-gap)]">
          <span>任务进度 {completed}/{total}</span>
          {!allDone && <span className={themeRecipes.badge('warning')}>运行中</span>}
          {tasks.some((task) => task.status === 'error') && (
            <span className={`${themeRecipes.badge('danger')} gap-1`}>
              <AlertTriangle size={10} />
              错误
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onToggleMinimize} className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]" title="最小化">
          <ChevronDown size={14} />
        </Button>
      </div>
      <div className="max-h-[160px] space-y-[var(--theme-toolbar-gap)] overflow-y-auto pr-1">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
};
