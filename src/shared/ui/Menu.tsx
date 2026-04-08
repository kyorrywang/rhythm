import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/shared/lib/utils';
import { themeRecipes } from '@/shared/theme/recipes';
import type { ReactNode } from 'react';

export const MenuRoot = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuPortal = DropdownMenu.Portal;

export function MenuContent({
  children,
  className,
  ...props
}: DropdownMenu.DropdownMenuContentProps) {
  return (
    <DropdownMenu.Content
      className={cn(
        cn(themeRecipes.floatingSurface(), 'min-w-40 p-[calc(var(--theme-floating-padding)*0.8)]'),
        className,
      )}
      {...props}
    >
      {children}
    </DropdownMenu.Content>
  );
}

export function MenuItem({
  icon,
  danger,
  children,
  className,
  ...props
}: DropdownMenu.DropdownMenuItemProps & { icon?: ReactNode; danger?: boolean }) {
  return (
    <DropdownMenu.Item
      className={cn(
        'flex min-h-[var(--theme-control-height-sm)] w-full cursor-pointer items-center gap-[var(--theme-toolbar-gap)] rounded-[var(--theme-menu-item-radius)] px-[var(--theme-control-padding-x-sm)] text-left text-[length:var(--theme-meta-size)] outline-none transition-colors',
        danger
          ? 'text-[var(--theme-danger-text)] hover:bg-[var(--theme-menu-danger-hover-bg)] hover:text-[var(--theme-menu-danger-hover-text)] focus:bg-[var(--theme-menu-danger-hover-bg)] focus:text-[var(--theme-menu-danger-hover-text)]'
          : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-menu-item-hover-bg)] hover:text-[var(--theme-menu-item-hover-text)] focus:bg-[var(--theme-menu-item-hover-bg)] focus:text-[var(--theme-menu-item-hover-text)]',
        className,
      )}
      {...props}
    >
      {icon}
      <span className={themeRecipes.description()}>{children}</span>
    </DropdownMenu.Item>
  );
}
