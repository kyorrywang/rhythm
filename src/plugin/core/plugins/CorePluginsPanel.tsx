import { Puzzle } from 'lucide-react';
import { usePluginStore } from '@/shared/state/usePluginStore';
import { Badge, EmptyState, NavItem, NavList, NavSectionLabel, SidebarPage } from '@/shared/ui';
import type { LeftPanelProps } from '@/plugin/sdk';
import { StatusPill } from '../components/CoreUi';
import { useEffect } from 'react';
import { useSessionStore } from '@/shared/state/useSessionStore';
import { themeRecipes } from '@/shared/theme/recipes';

export function CorePluginsPanel({ ctx, width }: LeftPanelProps) {
  const plugins = usePluginStore((state) => state.plugins);
  const pluginsLoading = usePluginStore((state) => state.isLoading);
  const workbench = useSessionStore((state) => state.workbench);
  const activePluginName = (workbench?.item.payload as { pluginName?: string } | undefined)?.pluginName;
  const enabledPlugins = plugins.filter((plugin) => plugin.configured_enabled);
  const disabledPlugins = plugins.filter((plugin) => !plugin.configured_enabled);

  const openPluginDetail = (pluginName: string) =>
    ctx.ui.workbench.open({
      viewId: 'core.plugin.detail',
      title: pluginName,
      description: '插件详情',
      payload: { pluginName },
      layoutMode: 'replace',
    });

  const openOverview = () =>
    ctx.ui.workbench.open({
      viewId: 'core.plugins.overview',
      title: '插件概览',
      description: '查看插件概况',
      payload: {},
      layoutMode: 'replace',
    });

  useEffect(() => {
    if (!workbench || workbench.item.viewType !== 'core.plugins.overview') {
      openOverview();
    }
  }, []);

  return (
    <SidebarPage width={width}>
      <div className="px-4 pb-3 pt-5">
        <div className={`text-[11px] uppercase tracking-[0.18em] ${themeRecipes.eyebrow()}`}>Plugin</div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <NavList className="space-y-[calc(var(--theme-toolbar-gap)*0.55)]">
          <NavItem
            title="Overview"
            description="查看插件安装、状态与常用操作概览"
            trailing={<Badge tone="muted">{plugins.length}</Badge>}
            active={workbench?.item.viewType === 'core.plugins.overview'}
            onClick={openOverview}
          />
          {enabledPlugins.length > 0 && <NavSectionLabel>Enabled</NavSectionLabel>}
          {enabledPlugins.map((plugin) => {
            const viewCount =
              plugin.contributes.views.length
              + plugin.contributes.left_panel_views.length
              + plugin.contributes.workbench_views.length;
            const active =
              workbench?.item.viewType === 'core.plugin.detail'
              && (
                activePluginName === plugin.name
                || workbench.item.title === plugin.name
              );
            return (
              <NavItem
                key={plugin.name}
                title={plugin.name}
                description={plugin.description}
                meta={(
                  <>
                    <span>{plugin.version}</span>
                    <span className="opacity-50">·</span>
                    <span>{viewCount} views</span>
                    <span className="opacity-50">·</span>
                    <span>{plugin.contributes.commands.length} commands</span>
                  </>
                )}
                trailing={<StatusPill status={plugin.status} />}
                active={active}
                onClick={() => openPluginDetail(plugin.name)}
              />
            );
          })}
          {disabledPlugins.length > 0 && <NavSectionLabel>Disabled</NavSectionLabel>}
          {disabledPlugins.map((plugin) => {
            const viewCount =
              plugin.contributes.views.length
              + plugin.contributes.left_panel_views.length
              + plugin.contributes.workbench_views.length;
            const active =
              workbench?.item.viewType === 'core.plugin.detail'
              && (
                activePluginName === plugin.name
                || workbench.item.title === plugin.name
              );
            return (
              <NavItem
                key={plugin.name}
                title={plugin.name}
                description={plugin.description}
                meta={(
                  <>
                    <span>{plugin.version}</span>
                    <span className="opacity-50">·</span>
                    <span>{viewCount} views</span>
                    <span className="opacity-50">·</span>
                    <span>{plugin.contributes.commands.length} commands</span>
                  </>
                )}
                trailing={<StatusPill status={plugin.status} />}
                active={active}
                onClick={() => openPluginDetail(plugin.name)}
              />
            );
          })}
        </NavList>
        {!pluginsLoading && plugins.length === 0 && (
          <EmptyState title="当前工作区没有发现插件" description="你可以先安装本地插件，或者刷新插件列表重新扫描。" icon={<Puzzle size={18} />} />
        )}
      </div>
    </SidebarPage>
  );
}
