import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/shared/utils/utils';
import { themeRecipes } from '@/ui/theme/recipes';
import { Button } from './Button';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  label?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({
  children,
  className,
  label,
  title,
  ...props
}, ref) {
  return (
    <Button
      ref={ref}
      variant="unstyled"
      size="none"
      title={title || label}
      aria-label={label || title}
      className={cn(
        themeRecipes.iconButton(),
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  );
});
