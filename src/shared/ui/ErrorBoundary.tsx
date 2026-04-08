import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/shared/ui/Button';
import { themeRecipes } from '@/shared/theme/recipes';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className={`flex flex-col items-center justify-center p-8 text-center ${themeRecipes.description()}`}>
          <div className="mb-2 text-[var(--theme-danger-text)]">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 className={`mb-1 ${themeRecipes.sectionTitle()}`}>Something went wrong</h3>
          <p className="max-w-sm text-xs text-[var(--theme-text-muted)]">{this.state.error?.message}</p>
          <Button
            variant="unstyled"
            size="none"
            onClick={() => this.setState({ hasError: false, error: null })}
            className={`mt-4 rounded-[var(--theme-radius-control)] bg-[var(--theme-surface-muted)] px-[var(--theme-control-padding-x-sm)] py-[calc(var(--theme-row-padding-y)*0.85)] text-xs transition-colors hover:bg-[var(--theme-surface)]`}
          >
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
