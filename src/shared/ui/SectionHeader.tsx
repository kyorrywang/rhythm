import { cn } from '@/shared/lib/utils';
import { themeRecipes } from '@/shared/theme/recipes';
import type { ReactNode } from 'react';

interface SectionHeaderProps {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function SectionHeader({
  icon,
  eyebrow,
  title,
  description,
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-[var(--theme-section-gap)]', className)}>
      <div>
        {eyebrow && (
          <div className={cn('flex items-center gap-[var(--theme-toolbar-gap)]', themeRecipes.eyebrow())}>
            {icon}
            <span>{eyebrow}</span>
          </div>
        )}
        <h2 className={cn('mt-[var(--theme-panel-header-gap)]', themeRecipes.title())}>{title}</h2>
        {description && (
          <p className={cn('mt-[var(--theme-toolbar-gap)] max-w-2xl leading-7', themeRecipes.description())}>
            {description}
          </p>
        )}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
