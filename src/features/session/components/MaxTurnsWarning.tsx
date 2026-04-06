import { AlertTriangle } from 'lucide-react';

interface MaxTurnsWarningProps {
  turns: number;
  maxTurns?: number;
}

export const MaxTurnsWarning = ({ turns, maxTurns = 100 }: MaxTurnsWarningProps) => {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-700">
      <AlertTriangle size={16} className="shrink-0" />
      <span>已达到最大轮次限制（{turns}/{maxTurns}），会话已停止。</span>
    </div>
  );
};
