import { useMemo } from 'react';
import { createPluginContext } from '@/core/plugin/host/createPluginContext';
import { PluginErrorBoundary } from '@/core/plugin/host/PluginErrorBoundary';
import { usePluginHostStore } from '@/core/plugin/host/usePluginHostStore';
import { useSessionStore } from '@/core/sessions/useSessionStore';
import { themeRecipes } from '@/ui/theme/recipes';

export const LeftPanelHost = ({ width }: { width: number }) => {
  const activeLeftPanelViewId = useSessionStore((state) => state.activeLeftPanelViewId);
  const leftPanels = usePluginHostStore((state) => state.leftPanels);
  const panelView = leftPanels[activeLeftPanelViewId];
  const pluginId = panelView?.pluginId || 'unknown';
  const ctx = useMemo(() => createPluginContext(pluginId), [pluginId]);

  if (!panelView) {
    return (
      <div className={`flex h-full shrink-0 items-center justify-center px-6 text-center text-sm text-[var(--theme-text-muted)] ${themeRecipes.leftPanelShell()}`} style={{ width }}>
        未找到左侧面板：{activeLeftPanelViewId}
      </div>
    );
  }

  const View = panelView.component;

  return (
    <PluginErrorBoundary pluginId={pluginId} surface={panelView.id}>
      <View ctx={ctx} width={width} />
    </PluginErrorBoundary>
  );
};
