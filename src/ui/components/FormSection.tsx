import { cn } from '@/shared/utils/utils';
import { themeRecipes } from '@/ui/theme/recipes';
import type { ReactNode } from 'react';

interface FormSectionProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function FormSection({
  title,
  description,
  actions,
  children,
  className,
}: FormSectionProps) {
  return (
    <section className={cn(themeRecipes.formSection(), className)}>
      {(title || description || actions) && (
        <div className="flex items-start justify-between gap-[var(--theme-toolbar-gap)]">
          <div>
            {title ? <div className={themeRecipes.sectionTitle()}>{title}</div> : null}
            {description ? <div className={cn('mt-1', themeRecipes.description())}>{description}</div> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
