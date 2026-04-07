import { ChevronDown, ChevronUp, CheckSquare, X, Check, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { TaskDockProps } from '../types';

const TaskItem = ({ task }: { task: TaskDockProps['tasks'][number] }) => {
  const isCompleted = task.status === 'completed';
  const isRunning = task.status === 'running';
  const isError = task.status === 'error';

  return (
    <div className={cn(
      "flex items-center gap-2 text-[13px] transition-colors",
      isCompleted ? "text-gray-400" : isRunning ? "text-gray-800" : isError ? "text-red-600" : "text-gray-500"
    )}>
      <div className={cn(
        "w-3.5 h-3.5 flex items-center justify-center shrink-0 rounded-[4px]",
        isCompleted ? "bg-gray-100 border border-gray-200" : 
        isRunning ? "bg-amber-50 border border-amber-200" : 
        isError ? "border border-red-200 bg-red-50" : 
        "border border-gray-200 bg-transparent"
      )}>
        {isCompleted && <Check size={10} className="text-gray-400" strokeWidth={3} />}
        {isRunning && <Loader2 size={10} className="animate-spin text-amber-600" />}
        {isError && <X size={10} className="text-red-500" />}
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
        className="border-b border-slate-100 bg-[#fbfbfb] px-4 py-2 rounded-t-[28px] transition-all cursor-pointer hover:bg-slate-100 flex items-center justify-between"
        onClick={onToggleMinimize}
      >
        <div className="flex items-center gap-2 text-[12px] text-gray-600">
          <CheckSquare size={13} className={allDone ? "text-green-500" : "text-gray-400"} />
          <span>已完成 {completed}/{total} 个任务</span>
        </div>
        <ChevronUp size={14} className="text-gray-400" />
      </div>
    );
  }

  return (
    <div className="border-b border-slate-100 bg-[#fbfbfb] px-4 py-3 rounded-t-[28px] transition-all">
      <div className="mb-3 flex items-center justify-between text-[12px] font-medium text-slate-800">
        <div className="flex items-center gap-2">
          <span>任务进度 {completed}/{total}</span>
          {!allDone && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">运行中</span>}
          {tasks.some((task) => task.status === 'error') && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-700">
              <AlertTriangle size={10} />
              错误
            </span>
          )}
        </div>
        <Button variant="unstyled" size="none" onClick={onToggleMinimize} className="text-gray-400 hover:text-gray-600 transition-colors" title="最小化">
          <ChevronDown size={14} />
        </Button>
      </div>
      <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
};
