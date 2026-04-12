import { cn } from '@/shared/utils/utils';
import { themeRecipes } from '@/ui/theme/recipes';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn(themeRecipes.emptyState(), className)}>
      {icon ? <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--theme-surface-muted)] text-[var(--theme-text-muted)]">{icon}</div> : null}
      <div className={cn('text-sm font-medium', themeRecipes.title())}>{title}</div>
      {description ? <div className={cn('mt-2 text-sm', themeRecipes.description())}>{description}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
