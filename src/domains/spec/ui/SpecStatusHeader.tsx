import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, PauseCircle, PlayCircle, ShieldAlert, Sparkles } from 'lucide-react';
import { Badge, Button, Card } from '@/ui/components';
import { themeRecipes } from '@/ui/theme/recipes';
import type { SpecReview, SpecRun, SpecState, SpecTask } from '../domain/types';
import { badgeToneForSpecStatus, describeSpecStatus } from './helpers';

interface SpecStatusHeaderProps {
  state: SpecState;
  latestRun: SpecRun | null;
  pendingHumanTask: SpecTask | null;
  failedTask: SpecTask | null;
  latestReview: SpecReview | null;
  isSaving: boolean;
  onSync: () => void;
}

export function SpecStatusHeader({
  state,
  latestRun,
  pendingHumanTask,
  failedTask,
  latestReview,
  isSaving,
  onSync,
}: SpecStatusHeaderProps) {
  const currentTask = state.metrics.tasks.currentTaskTitle || 'No active task';
  const attentionLabel = pendingHumanTask
    ? `Waiting for approval on ${pendingHumanTask.title}`
    : failedTask
      ? `Retry available for ${failedTask.title}`
      : latestReview?.decision === 'changes_requested'
        ? 'Latest review requested rework'
        : 'No immediate blockers';

  return (
    <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className={themeRecipes.eyebrow()}>Spec Overview</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={badgeToneForSpecStatus(state.change.status)}>{describeSpecStatus(state.change.status)}</Badge>
              <Badge tone="muted">{state.metrics.tasks.completed}/{state.metrics.tasks.total || 0} tasks complete</Badge>
              <Badge tone={latestRun?.status === 'paused' ? 'warning' : latestRun?.status === 'completed' ? 'success' : 'default'}>
                Run: {latestRun?.status || 'not started'}
              </Badge>
            </div>
            <div className="mt-3 text-sm leading-7 text-[var(--theme-text-primary)]">
              {state.change.overview || state.change.goal}
            </div>
          </div>
          <Button variant="secondary" onClick={onSync} isLoading={isSaving}>Sync</Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <StatusMetric icon={<PlayCircle size={16} />} label="Current" value={currentTask} />
          <StatusMetric icon={<Clock3 size={16} />} label="Engine" value={latestRun?.engineHealthSummary || 'Idle'} />
          <StatusMetric icon={<Sparkles size={16} />} label="Attention" value={attentionLabel} />
        </div>
      </Card>

      <Card tone={pendingHumanTask || failedTask ? 'warning' : state.change.status === 'completed' ? 'success' : 'muted'} className="space-y-3">
        <div className={themeRecipes.eyebrow()}>At A Glance</div>
        <AttentionRow
          icon={pendingHumanTask ? <ShieldAlert size={16} /> : failedTask ? <AlertTriangle size={16} /> : state.change.status === 'paused' ? <PauseCircle size={16} /> : <CheckCircle2 size={16} />}
          label={pendingHumanTask ? 'Human gate' : failedTask ? 'Failure' : state.change.status === 'paused' ? 'Paused' : 'Healthy'}
          detail={pendingHumanTask
            ? pendingHumanTask.title
            : failedTask
              ? failedTask.title
              : state.change.status === 'paused'
                ? 'Markdown can be adjusted before resuming.'
                : 'The spec is moving through its current state cleanly.'}
        />
        <AttentionRow
          icon={<Sparkles size={16} />}
          label="Latest review"
          detail={latestReview ? latestReview.summary : 'No review findings recorded yet.'}
        />
      </Card>
    </div>
  );
}

function StatusMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3">
      <div className={`flex items-center gap-2 text-xs ${themeRecipes.eyebrow()}`}>
        {icon}
        {label}
      </div>
      <div className="mt-2 text-sm leading-6 text-[var(--theme-text-primary)]">{value}</div>
    </div>
  );
}

function AttentionRow({ icon, label, detail }: { icon: ReactNode; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-3">
      <div className="mt-0.5 text-[var(--theme-text-secondary)]">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--theme-text-primary)]">{label}</div>
        <div className={`mt-1 text-sm leading-6 ${themeRecipes.description()}`}>{detail}</div>
      </div>
    </div>
  );
}
