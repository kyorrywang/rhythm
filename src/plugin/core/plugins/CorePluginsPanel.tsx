import { open } from '@tauri-apps/plugin-dialog';
import { PackagePlus, Puzzle, RefreshCw } from 'lucide-react';
import { usePluginStore } from '@/shared/state/usePluginStore';
import { useActiveWorkspace } from '@/shared/state/useWorkspaceStore';
import { useToast } from '@/shared/hooks/useToast';
import { Badge, Button, EmptyState, NavItem, NavList } from '@/shared/ui';
import type { LeftPanelProps } from '@/plugin/sdk';
import { PanelShell, StatusPill } from '../components/CoreUi';
import { useEffect } from 'react';
import { useSessionStore } from '@/shared/state/useSessionStore';

export function CorePluginsPanel({ ctx, width }: LeftPanelProps) {
  const plugins = usePluginStore((state) => state.plugins);
  const pluginsLoading = usePluginStore((state) => state.isLoading);
  const fetchPlugins = usePluginStore((state) => state.fetchPlugins);
  const previewInstallFromPath = usePluginStore((state) => state.previewInstallFromPath);
  const installPluginFromPath = usePluginStore((state) => state.installPluginFromPath);
  const workspace = useActiveWorkspace();
  const workbench = useSessionStore((state) => state.workbench);
  const activePluginName = (workbench?.item.payload as { pluginName?: string } | undefined)?.pluginName;
  const { success, error } = useToast();

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

  const handleRefresh = async () => {
    try {
      await fetchPlugins(workspace.path);
      success('插件列表已刷新');
    } catch {
      error('插件列表刷新失败');
    }
  };

  const handleInstall = async () => {
    const selectedPath = await open({
      directory: true,
      multiple: false,
      title: '选择插件文件夹',
    });
    if (typeof selectedPath !== 'string') return;
    try {
      const preview = await previewInstallFromPath(selectedPath);
      const confirmed = window.confirm([
        `确认安装插件“${preview.name}”？`,
        '',
        `版本：${preview.version}`,
        `描述：${preview.description || '暂无描述'}`,
        `来源：${preview.source_path}`,
        `目标：${preview.destination_path}`,
        preview.will_overwrite ? '注意：将覆盖已有同名插件。' : '将作为新插件安装。',
        preview.permissions.length > 0 ? `权限：${preview.permissions.join(', ')}` : '权限：无',
        preview.requires.commands.length > 0 ? `依赖 Commands：${preview.requires.commands.join(', ')}` : '依赖 Commands：无',
        preview.requires.tools.length > 0 ? `依赖 Tools：${preview.requires.tools.join(', ')}` : '依赖 Tools：无',
        preview.warnings.length > 0 ? `警告：${preview.warnings.join('; ')}` : '',
      ].filter(Boolean).join('\n'));
      if (!confirmed) return;
      const installed = await installPluginFromPath(workspace.path, selectedPath);
      success(`已安装插件：${installed.name}`);
      openPluginDetail(installed.name);
    } catch (installError) {
      error(installError instanceof Error ? installError.message : '插件安装失败');
    }
  };

  return (
    <PanelShell width={width} icon={<Puzzle size={16} />} title="插件" subtitle="查看已安装插件与运行能力">
      <div className="space-y-3 px-4 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-[var(--theme-toolbar-gap)]">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleInstall()}
            className="flex items-center justify-center gap-[var(--theme-toolbar-gap)]"
          >
            <PackagePlus size={15} />
            安装本地插件
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleRefresh()}
            className="flex items-center justify-center gap-[var(--theme-toolbar-gap)]"
          >
            <RefreshCw size={15} />
            刷新插件列表
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <NavList>
          <NavItem
            title="Overview"
            description="查看插件安装、状态与常用操作概览"
            trailing={<Badge tone="muted">{plugins.length}</Badge>}
            active={workbench?.item.viewType === 'core.plugins.overview'}
            onClick={openOverview}
          />
          {plugins.map((plugin) => {
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
    </PanelShell>
  );
}
