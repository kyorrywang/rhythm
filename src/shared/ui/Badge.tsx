import { cn } from '@/shared/lib/utils';
import { themeRecipes } from '@/shared/theme/recipes';
import type { HTMLAttributes, ReactNode } from 'react';

type BadgeTone = 'default' | 'muted' | 'success' | 'warning' | 'danger';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone = 'default', children, className, ...props }: BadgeProps) {
  return (
    <span className={cn(themeRecipes.badge(tone), className)} {...props}>
      {children}
    </span>
  );
}

