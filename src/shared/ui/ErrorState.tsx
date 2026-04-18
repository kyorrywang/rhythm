import { AlertCircle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { themeRecipes } from '@/shared/theme/recipes';
import type { ReactNode } from 'react';

interface ErrorStateProps {
  title?: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function ErrorState({
  title = '出现问题',
  description,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn(themeRecipes.errorState(), className)}>
      <div className="flex items-start gap-3">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-[var(--theme-danger-text)]" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--theme-danger-text)]">{title}</div>
          <div className="mt-1 text-sm leading-6 text-[color:color-mix(in_srgb,var(--theme-danger-text)_88%,transparent)]">{description}</div>
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

