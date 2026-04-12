// 简化的 SpecStatusHeader
import { AlertTriangle, CheckCircle2, PlayCircle, Square } from 'lucide-react';
import { Badge, Button, Card } from '@/ui/components';
import { themeRecipes } from '@/ui/theme/recipes';
import type { SpecState } from '../domain/types';
import { badgeToneForSpecStatus, describeSpecStatus } from './helpers';

interface SpecStatusHeaderProps {
  state: SpecState;
  showHumanWarning: boolean;
  isRunning: boolean;
  onRun: () => void;
  onInterrupt: () => void;
}

export function SpecStatusHeader({
  state,
  showHumanWarning,
  isRunning,
  onRun,
  onInterrupt,
}: SpecStatusHeaderProps) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={themeRecipes.eyebrow()}>Spec 概览</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={badgeToneForSpecStatus(state.status)}>{describeSpecStatus(state.status)}</Badge>
            <Badge tone="muted">{state.progress.done}/{state.progress.total || 0} 任务完成</Badge>
            {showHumanWarning && (
              <Badge tone="warning">
                <AlertTriangle size={12} className="inline mr-1" />
                需要人工确认
              </Badge>
            )}
          </div>
          <div className="mt-3 text-sm leading-7 text-[var(--theme-text-primary)]">
            {state.overview || state.goal}
          </div>
        </div>

        <div className="flex gap-2">
          {state.status === 'draft' && (
            <Button size="sm" onClick={onRun} disabled={isRunning}>
              <PlayCircle size={14} className="mr-1" />
              Run
            </Button>
          )}
          {state.status === 'active' && (
            <Button variant="secondary" size="sm" onClick={onInterrupt} disabled={isRunning}>
              <Square size={14} className="mr-1" />
              中断
            </Button>
          )}
        </div>
      </div>

      {state.status === 'done' && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle2 size={16} />
          所有任务已完成
        </div>
      )}
    </Card>
  );
}
