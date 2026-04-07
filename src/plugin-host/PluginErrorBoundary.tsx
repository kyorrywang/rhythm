import React from 'react';
import { AlertCircle } from 'lucide-react';
import { usePluginHostStore } from './usePluginHostStore';

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
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-5 text-rose-800">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertCircle size={16} />
            <span>插件视图崩溃</span>
          </div>
          <p className="mt-2 text-sm leading-6">
            `{this.props.pluginId}` 在 `{this.props.surface}` 渲染时出错，已上报到插件运行时状态。
          </p>
          <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-white/70 px-3 py-3 text-xs leading-5">
            {this.state.error.message}
          </pre>
        </div>
      </div>
    );
  }
}
