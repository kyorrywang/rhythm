import { cn } from '@/shared/utils/utils';
import { themeRecipes } from '@/ui/theme/recipes';
import type { ReactNode } from 'react';

export function NavList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('space-y-[calc(var(--theme-toolbar-gap)*0.7)]', className)}>{children}</div>;
}

export function NavSectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('px-1 pt-[calc(var(--theme-section-gap)*0.75)]', themeRecipes.eyebrow(), className)}>{children}</div>;
}

export function NavItem({
  title,
  description,
  meta,
  leading,
  trailing,
  active = false,
  onClick,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(`group ${themeRecipes.listRow(active)}`, className)}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-[var(--theme-toolbar-gap)]">
          {leading ? <div className="shrink-0 pt-0.5 text-[var(--theme-text-muted)]">{leading}</div> : null}
          <div className="min-w-0 flex-1">
            <div className={cn('truncate text-left text-[length:var(--theme-section-title-size)] font-[var(--theme-title-weight)] leading-5', themeRecipes.listRowTitle(active))}>
              {title}
            </div>
            {description ? (
              <div className={cn('mt-1 line-clamp-2 text-left text-[length:var(--theme-meta-size)] leading-5', themeRecipes.listRowMeta(active))}>
                {description}
              </div>
            ) : null}
            {meta ? (
              <div className={cn('mt-[calc(var(--theme-toolbar-gap)*0.55)] inline-flex max-w-full items-center gap-[var(--theme-toolbar-gap)] text-[length:var(--theme-meta-size)] leading-5', themeRecipes.listRowMeta(active))}>
                {meta}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {trailing ? <div className="ml-[var(--theme-toolbar-gap)] shrink-0">{trailing}</div> : null}
    </button>
  );
}
