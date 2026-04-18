import { cn } from '@/shared/lib/utils';

export function Skeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-[var(--theme-radius-card)] bg-[linear-gradient(90deg,var(--theme-surface-muted)_25%,var(--theme-surface)_50%,var(--theme-surface-muted)_75%)] bg-[length:200%_100%]',
        className,
      )}
    />
  );
}

