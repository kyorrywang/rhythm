import { cn } from '@/shared/lib/utils';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link' | 'unstyled';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'none';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  isLoading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-black text-white hover:bg-gray-800 disabled:bg-gray-300',
  secondary: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:bg-gray-100',
  ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-800 disabled:text-gray-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  link: 'px-0 py-0 text-sky-700 underline-offset-2 hover:text-sky-900 hover:underline disabled:text-gray-300',
  unstyled: '',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
  icon: 'h-7 w-7 p-0',
  none: '',
};

const LINK_SIZE_CLASSES: Record<Exclude<ButtonSize, 'icon'>, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  none: '',
};

export const Button = ({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  children,
  isLoading,
  disabled,
  ...props
}: ButtonProps) => {
  const sizeClass = variant === 'link' && size !== 'icon' ? LINK_SIZE_CLASSES[size] : SIZE_CLASSES[size];

  return (
    <button
      type={type}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
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
};
