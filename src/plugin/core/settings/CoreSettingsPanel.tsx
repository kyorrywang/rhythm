import { Settings2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { usePluginHostStore } from '@/plugin/host/usePluginHostStore';
import { Badge, NavItem, NavList, NavSectionLabel } from '@/shared/ui';
import { useSessionStore } from '@/shared/state/useSessionStore';
import type { LeftPanelProps } from '@/plugin/sdk';
import { settingItems } from '../constants';
import { PanelShell } from '../components/CoreUi';

export function CoreSettingsPanel({ ctx, width }: LeftPanelProps) {
  const settingsSections = usePluginHostStore((state) => state.settingsSections);
  const pluginSettingsSections = useMemo(() => Object.values(settingsSections), [settingsSections]);
  const workbench = useSessionStore((state) => state.workbench);
  const activeSection = (workbench?.item.payload as { section?: string } | undefined)?.section;
  const activePluginSectionId = (workbench?.item.payload as { sectionId?: string } | undefined)?.sectionId;

  const openOverview = () =>
    ctx.ui.workbench.open({
      viewId: 'core.settings.overview',
      title: '设置概览',
      description: '查看核心与插件设置概况',
      payload: {},
      layoutMode: 'replace',
    });

  useEffect(() => {
    if (!workbench || workbench.item.viewType !== 'core.settings.overview') {
      openOverview();
    }
  }, []);

  return (
    <PanelShell width={width} icon={<Settings2 size={16} />} title="设置" subtitle="选择一个设置项，在工作台中查看详情">
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <NavList>
          <NavItem
            title="Overview"
            description="查看核心设置、插件设置与常用入口概览"
            trailing={<Badge tone="muted">{settingItems.length + pluginSettingsSections.length}</Badge>}
            active={workbench?.item.viewType === 'core.settings.overview'}
            onClick={openOverview}
          />
          <NavSectionLabel>Core Settings</NavSectionLabel>
          {settingItems.map((item) => {
            const active =
              workbench?.item.viewType === 'core.settings.section'
              && activeSection === item.id;
            return (
              <NavItem
                key={item.id}
                title={item.name}
                description={item.description}
                trailing={<Badge tone="muted">核心</Badge>}
                active={active}
                onClick={() =>
                  ctx.ui.workbench.open({
                    viewId: 'core.settings.section',
                    title: item.name,
                    description: item.description,
                    payload: { section: item.id },
                    layoutMode: 'replace',
                  })
                }
              />
            );
          })}
          {pluginSettingsSections.length > 0 && <NavSectionLabel>Plugin Settings</NavSectionLabel>}
          {pluginSettingsSections.map((section) => {
            const active =
              workbench?.item.viewType === 'core.plugin.settings.section'
              && activePluginSectionId === section.id;
            return (
              <NavItem
                key={section.id}
                title={section.title}
                description={section.description || section.pluginId || section.id}
                trailing={<Badge tone="success">{section.pluginId || 'plugin'}</Badge>}
                active={active}
                onClick={() =>
                  ctx.ui.workbench.open({
                    viewId: 'core.plugin.settings.section',
                    title: section.title,
                    description: section.description,
                    payload: { sectionId: section.id },
                    layoutMode: 'replace',
                  })
                }
              />
            );
          })}
        </NavList>
      </div>
    </PanelShell>
  );
}
