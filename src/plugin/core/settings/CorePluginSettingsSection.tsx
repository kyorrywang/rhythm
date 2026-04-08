import { createPluginContext } from '@/plugin/host/createPluginContext';
import { PluginErrorBoundary } from '@/plugin/host/PluginErrorBoundary';
import { usePluginHostStore } from '@/plugin/host/usePluginHostStore';
import type { WorkbenchProps } from '@/plugin/sdk';
import { EmptyState, WorkbenchPage, WorkbenchSection } from '@/shared/ui';

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
        >
          <WorkbenchSection title={section.title} description={section.description || pluginId}>
            <Section ctx={createPluginContext(pluginId)} />
          </WorkbenchSection>
      </WorkbenchPage>
    </PluginErrorBoundary>
  );
}
