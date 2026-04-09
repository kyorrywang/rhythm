import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { themeRecipes } from '@/shared/theme/recipes';
import type { ReactNode } from 'react';

export const MenuRoot = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuPortal = DropdownMenu.Portal;
export const MenuSeparator = DropdownMenu.Separator;
export const MenuSub = DropdownMenu.Sub;
export const MenuSubTrigger = DropdownMenu.SubTrigger;
export const MenuSubContent = DropdownMenu.SubContent;

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
      {icon ? <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span> : null}
      <span className={cn('min-w-0 flex-1 leading-5', themeRecipes.description())}>{children}</span>
    </DropdownMenu.Item>
  );
}

export function MenuSubmenuTrigger({
  icon,
  children,
  className,
  ...props
}: DropdownMenu.DropdownMenuSubTriggerProps & { icon?: ReactNode }) {
  return (
    <MenuSubTrigger
      className={cn(
        'flex min-h-[var(--theme-control-height-sm)] w-full cursor-pointer items-center gap-[var(--theme-toolbar-gap)] rounded-[var(--theme-menu-item-radius)] px-[var(--theme-control-padding-x-sm)] text-left text-[length:var(--theme-meta-size)] text-[var(--theme-text-secondary)] outline-none transition-colors data-[state=open]:bg-[var(--theme-menu-item-hover-bg)] data-[state=open]:text-[var(--theme-menu-item-hover-text)] hover:bg-[var(--theme-menu-item-hover-bg)] hover:text-[var(--theme-menu-item-hover-text)] focus:bg-[var(--theme-menu-item-hover-bg)] focus:text-[var(--theme-menu-item-hover-text)]',
        className,
      )}
      {...props}
    >
      {icon ? <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span> : null}
      <span className={cn('min-w-0 flex-1 leading-5', themeRecipes.description())}>{children}</span>
      <ChevronRight size={13} className="shrink-0 text-[var(--theme-text-muted)]" />
    </MenuSubTrigger>
  );
}

export function MenuSubmenuContent({
  children,
  className,
  ...props
}: DropdownMenu.DropdownMenuSubContentProps) {
  return (
    <MenuSubContent
      className={cn(
        themeRecipes.floatingSurface(),
        'min-w-44 p-[calc(var(--theme-floating-padding)*0.8)]',
        className,
      )}
      sideOffset={8}
      alignOffset={-6}
      {...props}
    >
      {children}
    </MenuSubContent>
  );
}

export function MenuDivider({ className, ...props }: DropdownMenu.DropdownMenuSeparatorProps) {
  return (
    <MenuSeparator
      className={cn('my-[calc(var(--theme-floating-group-gap)*0.75)] h-px bg-[var(--theme-floating-header-border)]', className)}
      {...props}
    />
  );
}
