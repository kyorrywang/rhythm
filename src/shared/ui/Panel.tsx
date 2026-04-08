import { cn } from '@/shared/lib/utils';
import { themeRecipes } from '@/shared/theme/recipes';
import type { ReactNode } from 'react';
import { SectionHeader } from './SectionHeader';

interface PanelProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function Panel({
  title,
  description,
  icon,
  eyebrow,
  actions,
  children,
  className,
  contentClassName,
}: PanelProps) {
  return (
    <section className={cn(themeRecipes.panelShell(), className)}>
      <SectionHeader
        icon={icon}
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions}
      />
      <div className={cn('mt-[var(--theme-panel-content-gap)]', contentClassName)}>{children}</div>
    </section>
  );
}
