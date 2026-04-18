import { ScrollText } from 'lucide-react';
import { themeRecipes } from '@/shared/theme/recipes';
import { Card } from './Card';

export function LogPanel({
  title = 'Logs',
  content,
  empty = '暂无日志',
}: {
  title?: string;
  content?: string;
  empty?: string;
}) {
  return (
    <Card tone="muted" className="overflow-hidden">
      <div className={`mb-3 flex items-center gap-2 ${themeRecipes.eyebrow()}`}>
        <ScrollText size={14} />
        <span>{title}</span>
      </div>
      <div className="rounded-[calc(var(--theme-radius-card)-0.25rem)] bg-[var(--theme-surface)] p-4">
        <pre className="overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-[var(--theme-text-secondary)]">
          {content || empty}
        </pre>
      </div>
    </Card>
  );
}

