import { cn } from '@/shared/utils/utils';
import { themeRecipes } from '@/ui/theme/recipes';
import type { ReactNode } from 'react';

export function Toolbar({
  leading,
  trailing,
  className,
}: {
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(themeRecipes.toolbar(), 'justify-between', className)}>
      <div className="flex min-w-0 items-center gap-[var(--theme-toolbar-gap)]">{leading}</div>
      <div className="flex shrink-0 items-center gap-[var(--theme-toolbar-gap)]">{trailing}</div>
    </div>
  );
}
