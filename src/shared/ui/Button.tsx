import { cn } from '@/shared/lib/utils';
import { themeRecipes } from '@/shared/theme/recipes';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link' | 'unstyled';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'none';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  isLoading?: boolean;
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: themeRecipes.buttonSize('sm'),
  md: themeRecipes.buttonSize('md'),
  lg: themeRecipes.buttonSize('lg'),
  icon: themeRecipes.buttonSize('icon'),
  none: '',
};

const LINK_SIZE_CLASSES: Record<Exclude<ButtonSize, 'icon'>, string> = {
  sm: 'text-[length:var(--theme-meta-size)]',
  md: 'text-[length:var(--theme-body-size)]',
  lg: 'text-[length:var(--theme-title-size)]',
  none: '',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  children,
  isLoading,
  disabled,
  ...props
}, ref) {
  const sizeClass = variant === 'link' && size !== 'icon' ? LINK_SIZE_CLASSES[size] : SIZE_CLASSES[size];

  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center rounded-[var(--theme-radius-control)] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-strong)] disabled:cursor-not-allowed',
        themeRecipes.button(variant),
        sizeClass,
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
});
