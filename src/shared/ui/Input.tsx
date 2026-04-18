import { cn } from '@/shared/lib/utils';
import { themeRecipes } from '@/shared/theme/recipes';
import { forwardRef, type InputHTMLAttributes } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(themeRecipes.field(), 'h-[var(--theme-control-height-md)] px-[var(--theme-control-padding-x-md)]', className)}
      {...props}
    />
  ),
);

Input.displayName = 'Input';

