import { Code2 } from 'lucide-react';
import { themeRecipes } from '@/shared/theme/recipes';
import { Card } from './Card';

export function JsonPreview({
  value,
  title = 'JSON',
}: {
  value: unknown;
  title?: string;
}) {
  const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

  return (
    <Card tone="muted" className="overflow-hidden">
      <div className={`mb-3 flex items-center gap-2 ${themeRecipes.eyebrow()}`}>
        <Code2 size={14} />
        <span>{title}</span>
      </div>
      <pre className="overflow-auto rounded-[calc(var(--theme-radius-card)-0.25rem)] bg-[var(--theme-surface)] p-4 text-xs leading-6 text-[var(--theme-text-secondary)]">
        <code>{content}</code>
      </pre>
    </Card>
  );
}

