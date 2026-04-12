import { cn } from '@/shared/utils/utils';
import { themeRecipes } from '@/ui/theme/recipes';
import type { HTMLAttributes, ReactNode } from 'react';

type CardTone = 'default' | 'muted' | 'success' | 'warning' | 'danger';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone?: CardTone;
}

export function Card({ children, tone = 'default', className, ...props }: CardProps) {
  return (
    <div className={cn(themeRecipes.card(tone), className)} {...props}>
      {children}
    </div>
  );
}
