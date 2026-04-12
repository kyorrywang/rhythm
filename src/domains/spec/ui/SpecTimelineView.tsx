import { EmptyState } from '@/ui/components';
import { themeRecipes } from '@/ui/theme/recipes';
import type { SpecTimelineEvent } from '../domain/types';

export function SpecTimelineView({ events }: { events: SpecTimelineEvent[] }) {
  return (
    <div className="rounded-[var(--theme-radius-shell)] border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-surface)] px-6 py-6">
      <div className="space-y-3">
        {events.length === 0 ? (
          <EmptyState title="No timeline entries yet" description="Run activity will appear here as the spec progresses." />
        ) : (
          events
            .slice()
            .reverse()
            .map((event) => (
              <div key={event.id} className="rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="font-medium text-[var(--theme-text-primary)]">{event.title}</div>
                  <div className={`text-xs ${themeRecipes.description()}`}>{new Date(event.createdAt).toLocaleString()}</div>
                </div>
                <div className={`mt-2 text-sm ${themeRecipes.description()}`}>{event.detail}</div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
