import { Package, PackagePlus, RefreshCw } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useMemo } from 'react';
import type { WorkbenchProps } from '@/core/plugin/sdk';
import { useToast } from '@/ui/hooks/useToast';
import { usePluginStore } from '@/core/plugin/usePluginStore';
import { useActiveWorkspace } from '@/core/workspace/useWorkspaceStore';
import { Badge, Button, Card, InfoList, PropertyList, StatsGrid, Toolbar, WorkbenchPage, WorkbenchSection } from '@/ui/components';

export function CorePluginsOverview({ ctx }: WorkbenchProps) {
  const plugins = usePluginStore((state) => state.plugins);
  const fetchPlugins = usePluginStore((state) => state.fetchPlugins);
  const previewInstallFromPath = usePluginStore((state) => state.previewInstallFromPath);
  const installPluginFromPath = usePluginStore((state) => state.installPluginFromPath);
  const workspace = useActiveWorkspace();
  const { success, error } = useToast();

  const enabledCount = plugins.filter((plugin) => plugin.status === 'enabled').length;
  const blockedCount = plugins.filter((plugin) => plugin.status === 'blocked').length;
  const errorCount = plugins.filter((plugin) => plugin.status === 'error').length;
  const installedCount = plugins.filter((plugin) => plugin.installed).length;
  const activeCount = plugins.filter((plugin) => plugin.is_active).length;
  const shadowedCount = plugins.filter((plugin) => !plugin.is_active && !!plugin.shadowed_by).length;
  const installedNames = useMemo(
    () => plugins.map((plugin) => `${plugin.name} · ${plugin.version} · ${formatPluginSource(plugin.source)}${plugin.installed ? ' · 已安装' : ''}${plugin.is_active ? ' · 当前生效' : ''}`),
    [plugins],
  );
  const blockedNames = useMemo(() => plugins.filter((plugin) => plugin.status === 'blocked').map((plugin) => `${plugin.name} · ${plugin.blocked_reason || '依赖不满足'}`), [plugins]);
  const enabledNames = useMemo(
    () => plugins.filter((plugin) => plugin.status === 'enabled').map((plugin) => `${plugin.name} · ${plugin.version} · ${formatPluginSource(plugin.source)}${plugin.is_active ? ' · 当前生效' : ''}`),
    [plugins],
  );
  const topPlugin = plugins[0];
  const blockedPlugin = plugins.find((plugin) => plugin.status === 'blocked');

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
      ].join('\n'));
      if (!confirmed) return;
      const installed = await installPluginFromPath(workspace.path, selectedPath);
      success(`已安装插件：${installed.name}`);
    } catch (installError) {
      error(installError instanceof Error ? installError.message : '插件安装失败');
    }
  };

  return (
    <WorkbenchPage
      icon={<Package size={16} />}
      eyebrow="Plugins"
      title="插件概览"
      description="这里是插件生态的 landing page。先看安装、运行和风险摘要，再从左侧进入具体插件。"
      showHeader={false}
    >
      <Card tone="muted">
        <div className="text-[length:var(--theme-meta-size)] leading-7 text-[var(--theme-text-secondary)]">
          这里集中查看插件生态状态、常用操作和索引入口。顶部标题已经负责说明当前页，内容区直接进入概览。
        </div>
      </Card>
      <WorkbenchSection title="当前工作区生态" description="先看全局状态，再决定是安装插件、刷新列表，还是继续进入某个具体插件。">
        <div className="grid gap-[var(--theme-section-gap)] xl:grid-cols-[1.7fr_1fr]">
          <StatsGrid
            items={[
              { label: '已安装', value: String(plugins.length) },
              { label: '全局已安装', value: String(installedCount) },
              { label: '已启用', value: String(enabledCount), tone: 'success' },
              { label: '当前生效', value: String(activeCount) },
              { label: '已覆盖', value: String(shadowedCount), tone: shadowedCount > 0 ? 'warning' : 'default' },
              { label: '阻塞', value: String(blockedCount), tone: blockedCount > 0 ? 'warning' : 'default' },
              { label: '错误', value: String(errorCount), tone: errorCount > 0 ? 'danger' : 'default' },
            ]}
            columnsClassName="md:grid-cols-2 xl:grid-cols-3"
          />
          <Card tone={blockedCount > 0 || errorCount > 0 ? 'warning' : 'muted'}>
            <div className="space-y-[var(--theme-toolbar-gap)]">
              <div className="text-[length:var(--theme-eyebrow-size)] uppercase tracking-[var(--theme-eyebrow-spacing)] text-[var(--theme-text-muted)]">状态提示</div>
              <div className="text-[length:var(--theme-section-title-size)] font-[var(--theme-title-weight)] text-[var(--theme-text-primary)]">
                {blockedCount > 0 || errorCount > 0 ? '需要处理的插件问题' : '插件生态运行正常'}
              </div>
              <PropertyList
                items={[
                  { label: '阻塞', value: blockedCount > 0 ? `${blockedCount} 个插件等待依赖或授权` : '无' },
                  { label: '错误', value: errorCount > 0 ? `${errorCount} 个插件加载失败` : '无' },
                  { label: '建议', value: blockedCount > 0 || errorCount > 0 ? '先从左侧进入对应插件详情排查' : '可以直接安装新插件或查看详情' },
                ]}
              />
            </div>
          </Card>
        </div>
      </WorkbenchSection>

      <WorkbenchSection
        title="快速入口"
        description="Overview 负责提供常用操作和常见入口，避免左侧再堆一大块说明和统计。"
      >
        <div className="grid gap-[var(--theme-section-gap)] lg:grid-cols-3">
          <Card>
            <div className="space-y-[var(--theme-toolbar-gap)]">
              <div className="text-[length:var(--theme-section-title-size)] font-[var(--theme-title-weight)] text-[var(--theme-text-primary)]">安装新插件</div>
              <div className="text-[length:var(--theme-meta-size)] leading-6 text-[var(--theme-text-secondary)]">从本地文件夹读取插件 manifest，预检后安装到全局插件目录。</div>
              <Button variant="secondary" onClick={() => void handleInstall()}>
                <PackagePlus size={15} />
                安装本地插件
              </Button>
            </div>
          </Card>
          <Card>
            <div className="space-y-[var(--theme-toolbar-gap)]">
              <div className="text-[length:var(--theme-section-title-size)] font-[var(--theme-title-weight)] text-[var(--theme-text-primary)]">刷新生态状态</div>
              <div className="text-[length:var(--theme-meta-size)] leading-6 text-[var(--theme-text-secondary)]">重新扫描当前工作区中的插件目录、依赖状态和权限授权情况。</div>
              <Button variant="secondary" onClick={() => void handleRefresh()}>
                <RefreshCw size={15} />
                刷新插件列表
              </Button>
            </div>
          </Card>
          <Card tone={topPlugin ? 'muted' : 'default'}>
            <div className="space-y-[var(--theme-toolbar-gap)]">
              <div className="text-[length:var(--theme-section-title-size)] font-[var(--theme-title-weight)] text-[var(--theme-text-primary)]">继续查看详情</div>
              <div className="text-[length:var(--theme-meta-size)] leading-6 text-[var(--theme-text-secondary)]">
                {topPlugin ? `当前工作区最近可见插件：${topPlugin.name}` : '当前还没有发现插件，可先安装本地插件。'}
              </div>
              <Button
                variant="secondary"
                disabled={!topPlugin}
                onClick={() =>
                  topPlugin
                    ? ctx.ui.workbench.open({
                      viewId: 'core.plugin.detail',
                      title: topPlugin.name,
                      description: '插件详情',
                      payload: { pluginName: topPlugin.name },
                      layoutMode: 'replace',
                    })
                    : undefined
                }
              >
                查看第一个插件
              </Button>
            </div>
          </Card>
        </div>
      </WorkbenchSection>

      <WorkbenchSection title="状态摘要" description="这块负责回答两个问题：哪些插件运行正常，哪些插件需要你优先处理。">
        <div className="grid gap-[var(--theme-section-gap)] xl:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-[var(--theme-section-gap)] lg:grid-cols-2">
            <InfoList title="已启用" items={enabledNames} empty="暂无已启用插件" />
            <InfoList title="依赖阻塞" items={blockedNames} empty="当前没有阻塞插件" />
          </div>
          <Card tone={blockedPlugin ? 'warning' : 'muted'}>
            <div className="space-y-[var(--theme-toolbar-gap)]">
              <Toolbar
                leading={<div className="text-[length:var(--theme-section-title-size)] font-[var(--theme-title-weight)] text-[var(--theme-text-primary)]">优先处理</div>}
                trailing={<Badge tone={blockedPlugin ? 'warning' : 'muted'}>{blockedPlugin ? 'blocked' : 'none'}</Badge>}
              />
              <div className="text-[length:var(--theme-meta-size)] leading-6 text-[var(--theme-text-secondary)]">
                {blockedPlugin
                  ? `${blockedPlugin.name} 当前被阻塞。建议先进入详情页检查依赖、权限和运行时状态。`
                  : '当前没有优先需要处理的阻塞插件。'}
              </div>
              {blockedPlugin ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    ctx.ui.workbench.open({
                      viewId: 'core.plugin.detail',
                      title: blockedPlugin.name,
                      description: '插件详情',
                      payload: { pluginName: blockedPlugin.name },
                      layoutMode: 'replace',
                    })
                  }
                >
                  打开阻塞插件
                </Button>
              ) : null}
            </div>
          </Card>
        </div>
      </WorkbenchSection>

      <WorkbenchSection title="已安装插件" description="这块不是详情页，而是概览页里的索引区：帮助你快速判断当前工作区都装了什么。">
        <InfoList title="插件列表" items={installedNames} empty="当前工作区没有发现插件" />
      </WorkbenchSection>
    </WorkbenchPage>
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
