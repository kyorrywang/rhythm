import React from 'react';
import { AlertCircle } from 'lucide-react';
import { usePluginHostStore } from './usePluginHostStore';
import { themeRecipes } from '@/shared/theme/recipes';

interface PluginErrorBoundaryProps {
  pluginId: string;
  surface: string;
  children: React.ReactNode;
}

interface PluginErrorBoundaryState {
  error: Error | null;
}

export class PluginErrorBoundary extends React.Component<PluginErrorBoundaryProps, PluginErrorBoundaryState> {
  state: PluginErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): PluginErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    usePluginHostStore.getState().reportPluginError(this.props.pluginId, error);
  }

  componentDidUpdate(prevProps: PluginErrorBoundaryProps) {
    if (prevProps.pluginId !== this.props.pluginId || prevProps.surface !== this.props.surface) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="h-full overflow-auto px-5 py-5">
        <div className={themeRecipes.errorState()}>
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--theme-danger-text)]">
            <AlertCircle size={16} className="text-[var(--theme-danger-text)]" />
            <span>插件视图崩溃</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[color:color-mix(in_srgb,var(--theme-danger-text)_88%,transparent)]">
            `{this.props.pluginId}` 在 `{this.props.surface}` 渲染时出错，已上报到插件运行时状态。
          </p>
          <pre className="mt-3 whitespace-pre-wrap rounded-[var(--theme-radius-control)] bg-[var(--theme-surface)]/80 px-[var(--theme-control-padding-x-sm)] py-[calc(var(--theme-row-padding-y)*0.9)] text-xs leading-5 text-[var(--theme-danger-text)]">
            {this.state.error.message}
          </pre>
        </div>
      </div>
    );
  }
}
