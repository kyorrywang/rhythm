import { cn } from '@/shared/lib/utils';
import type { ReactNode } from 'react';
import { Panel } from './Panel';
import { SectionHeader } from './SectionHeader';

export function WorkbenchPage({
  icon,
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('h-full overflow-y-auto px-6 py-6', className)}>
      <div className="mx-auto w-full max-w-[1120px]">
        <WorkbenchHeader icon={icon} eyebrow={eyebrow} title={title} description={description} actions={actions} />
        <div className="mt-[calc(var(--theme-panel-content-gap)*1.1)] space-y-[var(--theme-section-gap)]">{children}</div>
      </div>
    </div>
  );
}

export function WorkbenchHeader({
  icon,
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return <SectionHeader icon={icon} eyebrow={eyebrow} title={title} description={description} actions={actions} className={className} />;
}

export function WorkbenchSection({
  title,
  description,
  icon,
  actions,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Panel
      title={title}
      description={description}
      icon={icon}
      actions={actions}
      className={className}
      contentClassName={contentClassName}
    >
      {children}
    </Panel>
  );
}
