import { cn } from '@/shared/lib/utils';
import { themeRecipes } from '@/shared/theme/recipes';
import type { ReactNode } from 'react';

export function ActionBar({
  leading,
  trailing,
  className,
}: {
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        themeRecipes.actionBar(),
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-[var(--theme-toolbar-gap)]">{leading}</div>
      <div className="flex shrink-0 items-center gap-[var(--theme-toolbar-gap)]">{trailing}</div>
    </div>
  );
}
