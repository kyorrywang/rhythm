import { Puzzle } from 'lucide-react';
import { usePluginStore } from '@/shared/state/usePluginStore';
import { Badge, EmptyState, NavItem, NavList, NavSectionLabel, SidebarPage } from '@/shared/ui';
import type { LeftPanelProps } from '@/plugin/sdk';
import { StatusPill } from '../components/CoreUi';
import { useEffect } from 'react';
import { useSessionStore } from '@/shared/state/useSessionStore';
import { themeRecipes } from '@/shared/theme/recipes';
import type { BackendPluginSummary } from '@/shared/types/api';

export function CorePluginsPanel({ ctx, width }: LeftPanelProps) {
  const plugins = usePluginStore((state) => state.plugins);
  const pluginsLoading = usePluginStore((state) => state.isLoading);
  const workbench = useSessionStore((state) => state.workbench);
  const activePlugin = workbench?.item.payload as { pluginName?: string; pluginPath?: string } | undefined;
  const activeEnabledPlugins = plugins.filter((plugin) => plugin.configured_enabled && plugin.is_active);
  const shadowedEnabledPlugins = plugins.filter((plugin) => plugin.configured_enabled && !plugin.is_active);
  const disabledPlugins = plugins.filter((plugin) => !plugin.configured_enabled);

  const openPluginDetail = (pluginName: string, pluginPath: string) =>
    ctx.ui.workbench.open({
      viewId: 'core.plugin.detail',
      title: pluginName,
      description: '插件详情',
      payload: { pluginName, pluginPath },
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
          {activeEnabledPlugins.length > 0 && <NavSectionLabel>Active</NavSectionLabel>}
          {activeEnabledPlugins.map((plugin) => {
            const viewCount =
              plugin.contributes.views.length
              + plugin.contributes.left_panel_views.length
              + plugin.contributes.workbench_views.length;
            const active =
              workbench?.item.viewType === 'core.plugin.detail'
              && (
                activePlugin?.pluginPath === plugin.path
                || (activePlugin?.pluginName === plugin.name && workbench.item.title === plugin.name)
              );
            return (
              <NavItem
                key={`${plugin.name}:${plugin.path}`}
                title={plugin.name}
                description={buildPluginDescription(plugin)}
                meta={(
                  <>
                    <span>{plugin.version}</span>
                    <span className="opacity-50">·</span>
                    <span>{formatPluginSource(plugin.source)}</span>
                    <span className="opacity-50">·</span>
                    <span>{viewCount} views</span>
                    <span className="opacity-50">·</span>
                    <span>{plugin.contributes.commands.length} commands</span>
                  </>
                )}
                trailing={<StatusPill status={plugin.status} />}
                active={active}
                onClick={() => openPluginDetail(plugin.name, plugin.path)}
              />
            );
          })}
          {shadowedEnabledPlugins.length > 0 && <NavSectionLabel>Shadowed</NavSectionLabel>}
          {shadowedEnabledPlugins.map((plugin) => {
            const viewCount =
              plugin.contributes.views.length
              + plugin.contributes.left_panel_views.length
              + plugin.contributes.workbench_views.length;
            const active =
              workbench?.item.viewType === 'core.plugin.detail'
              && (
                activePlugin?.pluginPath === plugin.path
                || (activePlugin?.pluginName === plugin.name && workbench.item.title === plugin.name)
              );
            return (
              <NavItem
                key={`${plugin.name}:${plugin.path}`}
                title={plugin.name}
                description={buildPluginDescription(plugin)}
                meta={(
                  <>
                    <span>{plugin.version}</span>
                    <span className="opacity-50">·</span>
                    <span>{formatPluginSource(plugin.source)}</span>
                    <span className="opacity-50">·</span>
                    <span>{viewCount} views</span>
                    <span className="opacity-50">·</span>
                    <span>{plugin.contributes.commands.length} commands</span>
                  </>
                )}
                trailing={<Badge tone="warning">shadowed</Badge>}
                active={active}
                onClick={() => openPluginDetail(plugin.name, plugin.path)}
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
                activePlugin?.pluginPath === plugin.path
                || (activePlugin?.pluginName === plugin.name && workbench.item.title === plugin.name)
              );
            return (
              <NavItem
                key={`${plugin.name}:${plugin.path}`}
                title={plugin.name}
                description={buildPluginDescription(plugin)}
                meta={(
                  <>
                    <span>{plugin.version}</span>
                    <span className="opacity-50">·</span>
                    <span>{formatPluginSource(plugin.source)}</span>
                    <span className="opacity-50">·</span>
                    <span>{viewCount} views</span>
                    <span className="opacity-50">·</span>
                    <span>{plugin.contributes.commands.length} commands</span>
                  </>
                )}
                trailing={<StatusPill status={plugin.status} />}
                active={active}
                onClick={() => openPluginDetail(plugin.name, plugin.path)}
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

function formatPluginSource(source: 'global' | 'project' | 'workspace_dev') {
  switch (source) {
    case 'global':
      return 'Global';
    case 'project':
      return 'Project';
    default:
      return 'Workspace Dev';
  }
}

function buildPluginDescription(plugin: BackendPluginSummary) {
  const parts = [plugin.description || '暂无描述'];
  parts.push(plugin.installed ? '已安装' : '未安装');
  if (plugin.is_active) {
    parts.push('当前生效');
  } else if (plugin.shadowed_by) {
    parts.push('被更高优先级版本覆盖');
  }
  return parts.join(' · ');
}
