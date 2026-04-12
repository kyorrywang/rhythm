import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/shared/utils/utils';
import { themeRecipes } from '@/ui/theme/recipes';

type PillTone = 'default' | 'muted' | 'success' | 'warning' | 'danger';

interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  children: ReactNode;
}

export function Pill({ tone = 'default', children, className, ...props }: PillProps) {
  return (
    <span
      className={cn(themeRecipes.badge(tone), 'px-[var(--theme-control-padding-x-md)]', className)}
      {...props}
    >
      {children}
    </span>
  );
}
