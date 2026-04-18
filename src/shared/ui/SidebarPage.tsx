import { cn } from '@/shared/lib/utils';
import { themeRecipes } from '@/shared/theme/recipes';
import type { ReactNode } from 'react';

export function SidebarPage({
  width,
  children,
  className,
}: {
  width: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(`flex h-full shrink-0 flex-col ${themeRecipes.leftPanelShell()}`, className)}
      style={{ width }}
    >
      {children}
    </div>
  );
}

export function SidebarHeader({
  icon,
  title,
  subtitle,
  actions,
  className,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('px-[var(--theme-panel-padding-x)] pb-[calc(var(--theme-panel-padding-y)*0.85)] pt-[calc(var(--theme-panel-padding-y)*0.95)]', className)}>
      <div className="flex items-start justify-between gap-[var(--theme-toolbar-gap)]">
        <div className="min-w-0">
          <div className={cn('flex items-center gap-[var(--theme-toolbar-gap)]', themeRecipes.eyebrow())}>
            {icon}
            <span>{title}</span>
          </div>
          <div className="mt-[calc(var(--theme-toolbar-gap)*0.85)] text-[calc(var(--theme-section-title-size)*1.1)] font-[var(--theme-title-weight)] leading-tight text-[var(--theme-text-primary)]">
            {title}
          </div>
          {subtitle ? (
            <div className={cn('mt-[calc(var(--theme-toolbar-gap)*0.7)] max-w-[26rem] text-[length:var(--theme-meta-size)] leading-6', themeRecipes.description())}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}

export function SidebarFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('mt-auto px-[var(--theme-panel-padding-x)] pb-[var(--theme-panel-padding-y)]', className)}>{children}</div>;
}

