import type { ReactNode } from 'react';
import { AlertTriangle, Clock3, ShieldAlert } from 'lucide-react';
import { Card, WorkbenchSection } from '@/ui/components';
import { themeRecipes } from '@/ui/theme/recipes';
import type { SpecReview, SpecRun, SpecTask } from '../domain/types';

export function SpecRunSnapshot({
  currentTaskTitle,
  latestRun,
  pendingHumanTask,
  failedTask,
  latestReview,
  waitingReviewCount,
}: {
  currentTaskTitle: string | null;
  latestRun: SpecRun | null;
  pendingHumanTask: SpecTask | null;
  failedTask: SpecTask | null;
  latestReview: SpecReview | null;
  waitingReviewCount: number;
}) {
  return (
    <WorkbenchSection title="Run Snapshot" description="A compact reading of the current execution state, without leaving the markdown workflow.">
      <div className="grid gap-4 md:grid-cols-2">
        <Card tone="muted" className="space-y-3">
          <div className={themeRecipes.eyebrow()}>Current</div>
          <SnapshotRow icon={<Clock3 size={14} />} label="Task" value={currentTaskTitle || 'No active task'} />
          <SnapshotRow icon={<Clock3 size={14} />} label="Engine" value={latestRun?.engineHealthSummary || 'Idle'} />
          <SnapshotRow icon={<Clock3 size={14} />} label="Review queue" value={`${waitingReviewCount}`} />
        </Card>
        <Card tone={pendingHumanTask || failedTask ? 'warning' : 'muted'} className="space-y-3">
          <div className={themeRecipes.eyebrow()}>Needs Attention</div>
          <SnapshotRow
            icon={pendingHumanTask ? <ShieldAlert size={14} /> : <AlertTriangle size={14} />}
            label="Human gate"
            value={pendingHumanTask ? `Approval needed for ${pendingHumanTask.title}` : 'No human gate is blocking the run.'}
          />
          <SnapshotRow
            icon={<AlertTriangle size={14} />}
            label="Failure"
            value={failedTask ? `Retry available for ${failedTask.title}` : 'No failed task needs a retry.'}
          />
          <SnapshotRow
            icon={<Clock3 size={14} />}
            label="Latest review"
            value={latestReview?.summary || 'No review findings yet.'}
          />
        </Card>
      </div>
    </WorkbenchSection>
  );
}

function SnapshotRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-[var(--theme-text-primary)]">
      <div className="mt-0.5 text-[var(--theme-text-secondary)]">{icon}</div>
      <div className="min-w-0">
        <div className={`text-xs ${themeRecipes.eyebrow()}`}>{label}</div>
        <div className="mt-1 leading-6">{value}</div>
      </div>
    </div>
  );
}
