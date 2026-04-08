import * as RadixPopover from '@radix-ui/react-popover';
import { cn } from '@/shared/lib/utils';
import { themeRecipes } from '@/shared/theme/recipes';

export const PopoverRoot = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverPortal = RadixPopover.Portal;
export const PopoverClose = RadixPopover.Close;

export function PopoverContent({
  className,
  onOpenAutoFocus,
  ...props
}: RadixPopover.PopoverContentProps) {
  return (
    <RadixPopover.Content
      className={cn(themeRecipes.floatingSurface(), className)}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        onOpenAutoFocus?.(event);
      }}
      {...props}
    />
  );
}

export function PopoverArrow({ className, ...props }: RadixPopover.PopoverArrowProps) {
  return <RadixPopover.Arrow className={cn('fill-[var(--theme-floating-bg)]', className)} {...props} />;
}
