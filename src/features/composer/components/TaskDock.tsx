import { ChevronDown, ChevronUp, CheckSquare, X, Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
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
        isRunning ? "bg-gray-100 border border-gray-200" : 
        isError ? "border border-red-200 bg-red-50" : 
        "border border-gray-200 bg-transparent"
      )}>
        {isCompleted && <Check size={10} className="text-gray-400" strokeWidth={3} />}
        {isRunning && <div className="w-[5px] h-[5px] bg-gray-400 rounded-full" />}
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
        className="border-b border-gray-100 bg-[#fbfbfb] px-4 py-2 rounded-t-xl transition-all cursor-pointer hover:bg-gray-100 flex items-center justify-between"
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
    <div className="border-b border-gray-100 bg-[#fbfbfb] px-4 py-3 rounded-t-xl transition-all">
      <div className="flex items-center justify-between text-[12px] text-gray-800 font-medium mb-3">
        <span>已完成 {completed} 个任务 (共 {total} 个)</span>
        <button onClick={onToggleMinimize} className="text-gray-400 hover:text-gray-600 transition-colors" title="最小化">
          <ChevronDown size={14} />
        </button>
      </div>
      <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
};
