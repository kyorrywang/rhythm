import { cn } from '@/shared/lib/utils';
import { themeRecipes } from '@/shared/theme/recipes';
import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  description?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, description, error, children, className }: FieldProps) {
  return (
    <label className={cn('block space-y-2', className)}>
      <div>
        <div className="text-[length:var(--theme-body-size)] font-medium text-[var(--theme-text-secondary)]">{label}</div>
        {description ? (
          <div className={cn('mt-1 text-[length:var(--theme-meta-size)] leading-5', themeRecipes.description())}>{description}</div>
        ) : null}
      </div>
      {children}
      {error ? <div className="text-[length:var(--theme-meta-size)] text-[var(--theme-danger-text)]">{error}</div> : null}
    </label>
  );
}

