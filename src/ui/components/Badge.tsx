import { cn } from '@/shared/utils/utils';
import { themeRecipes } from '@/ui/theme/recipes';
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
