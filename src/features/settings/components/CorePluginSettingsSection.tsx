import { createPluginContext } from '@/features/plugins/services/host/createPluginContext';
import { PluginErrorBoundary } from '@/features/plugins/services/host/PluginErrorBoundary';
import { usePluginHostStore } from '@/features/plugins/services/host/usePluginHostStore';
import type { WorkbenchProps } from '@/features/plugins/services/sdk';
import { Card, EmptyState, WorkbenchPage, WorkbenchSection } from '@/shared/ui';
import { themeRecipes } from '@/shared/theme/recipes';

export function CorePluginSettingsSection({ payload }: WorkbenchProps<{ sectionId?: string }>) {
  const section = usePluginHostStore((state) => payload.sectionId ? state.settingsSections[payload.sectionId] : undefined);
  if (!section) {
    return (
      <div className="h-full overflow-auto px-5 py-4">
        <EmptyState title="插件设置项不存在" description="插件可能尚未加载，或者这个设置项已经被移除。" />
      </div>
    );
  }
  const Section = section.component;
  const pluginId = section.pluginId || 'unknown';
  return (
    <PluginErrorBoundary pluginId={pluginId} surface={section.id}>
      <WorkbenchPage
        eyebrow="Plugin Settings"
        title={section.title}
        description={section.description || pluginId}
        showHeader={false}
        >
        <Card tone="muted" className={`leading-7 ${themeRecipes.description()}`}>
          {section.description || `${pluginId} 提供的设置区域。这里直接展示配置内容，不再重复页面标题。`}
        </Card>
        <WorkbenchSection title="配置内容" description="在这里查看和调整这个插件暴露出来的设置项。">
          <Section ctx={createPluginContext(pluginId)} />
        </WorkbenchSection>
      </WorkbenchPage>
    </PluginErrorBoundary>
  );
}


