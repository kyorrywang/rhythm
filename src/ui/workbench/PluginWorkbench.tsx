import { Package } from 'lucide-react';
import { useMemo } from 'react';
import { usePluginHostStore } from '@/core/plugin/host/usePluginHostStore';
import { useToast } from '@/ui/hooks/useToast';
import { usePluginStore } from '@/core/plugin/usePluginStore';
import { useActiveWorkspace } from '@/core/workspace/useWorkspaceStore';
import { themeRecipes } from '@/ui/theme/recipes';
import {
  ActionBar,
  Badge,
  Button,
  Card,
  ErrorState,
  InfoList,
  PropertyList,
  StatsGrid,
  Toolbar,
  WorkbenchPage,
  WorkbenchSection,
} from '@/ui/components';
import type { BackendPluginSummary } from '@/shared/types/api';

export const PluginWorkbench = ({ plugin }: { plugin: BackendPluginSummary }) => {
  const workspace = useActiveWorkspace();
  const togglePlugin = usePluginStore((s) => s.togglePlugin);
  const setPluginPermission = usePluginStore((s) => s.setPluginPermission);
  const fetchPlugins = usePluginStore((s) => s.fetchPlugins);
  const installPluginFromPath = usePluginStore((s) => s.installPluginFromPath);
  const uninstallPluginByName = usePluginStore((s) => s.uninstallPluginByName);
  const runtime = usePluginHostStore((s) => s.runtime[plugin.name]);
  const activityBarItems = usePluginHostStore((s) => s.activityBarItems);
  const leftPanels = usePluginHostStore((s) => s.leftPanels);
  const workbenchViews = usePluginHostStore((s) => s.workbenchViews);
  const settingsSections = usePluginHostStore((s) => s.settingsSections);
  const commandHandlers = usePluginHostStore((s) => s.commandHandlers);
  const messageActions = usePluginHostStore((s) => s.messageActions);
  const toolResultActions = usePluginHostStore((s) => s.toolResultActions);
  const eventHandlers = usePluginHostStore((s) => s.eventHandlers);
  const allCommandInvocations = usePluginHostStore((s) => s.commandInvocations);
  const tasks = usePluginHostStore((s) => s.tasks);
  const registeredActivity = useMemo(() => activityBarItems.filter((item) => item.pluginId === plugin.name), [activityBarItems, plugin.name]);
  const registeredLeftPanels = useMemo(() => Object.values(leftPanels).filter((view) => view.pluginId === plugin.name), [leftPanels, plugin.name]);
  const registeredWorkbenchViews = useMemo(() => Object.values(workbenchViews).filter((view) => view.pluginId === plugin.name), [workbenchViews, plugin.name]);
  const registeredSettingsSections = useMemo(() => Object.values(settingsSections).filter((section) => section.pluginId === plugin.name), [settingsSections, plugin.name]);
  const registeredCommands = useMemo(() => Object.entries(commandHandlers).filter(([, command]) => command.pluginId === plugin.name).map(([id]) => id), [commandHandlers, plugin.name]);
  const registeredMessageActions = useMemo(() => messageActions.filter((action) => action.pluginId === plugin.name), [messageActions, plugin.name]);
  const registeredToolResultActions = useMemo(() => toolResultActions.filter((action) => action.pluginId === plugin.name), [toolResultActions, plugin.name]);
  const registeredEventHandlers = useMemo(() => Object.entries(eventHandlers)
    .filter(([, handlers]) => handlers.some((handler) => handler.pluginId === plugin.name))
    .map(([event]) => event), [eventHandlers, plugin.name]);
  const commandInvocations = useMemo(() => allCommandInvocations.filter((event) => event.pluginId === plugin.name).slice(0, 8), [allCommandInvocations, plugin.name]);
  const pluginTasks = useMemo(() => Object.values(tasks).filter((task) => task.pluginId === plugin.name).slice(0, 8), [tasks, plugin.name]);
  const runtimeEntries = useMemo(
    () => Array.from(new Set([runtime?.entry, plugin.main || plugin.entry, plugin.dev_main].filter(Boolean) as string[])),
    [runtime?.entry, plugin.main, plugin.entry, plugin.dev_main],
  );
  const { success, error } = useToast();

  const handleToggle = async () => {
    try {
      await togglePlugin(workspace.path, plugin.name, !plugin.configured_enabled);
      success(`${plugin.name} 已${plugin.configured_enabled ? '禁用' : '启用'}`);
    } catch {
      error('插件状态切换失败');
    }
  };

  const handleTogglePermission = async (permission: string, granted: boolean) => {
    try {
      await setPluginPermission(workspace.path, plugin.name, permission, granted);
      success(`${permission} 已${granted ? '授权' : '撤销'}`);
    } catch {
      error('插件权限更新失败');
    }
  };

  const handleRefresh = async () => {
    try {
      await fetchPlugins(workspace.path);
      success('插件信息已刷新');
    } catch {
      error('插件刷新失败');
    }
  };

  const handleInstallToGlobal = async () => {
    try {
      const installed = await installPluginFromPath(workspace.path, plugin.path);
      success(`已安装到全局：${installed.name}`);
    } catch (installError) {
      error(installError instanceof Error ? installError.message : '插件安装失败');
    }
  };

  const handleUninstall = async () => {
    const shouldDeleteStorage = window.confirm(`卸载插件“${plugin.name}”时是否同时删除所有 workspace 下的插件 storage？\n\n确定：删除插件 storage\n取消：保留插件 storage`);
    const confirmed = window.confirm(`确认卸载插件“${plugin.name}”？\n\n插件文件会被移除。Storage 策略：${shouldDeleteStorage ? '删除 storage' : '保留 storage'}。`);
    if (!confirmed) return;
    try {
      const removed = await uninstallPluginByName(workspace.path, plugin.name, shouldDeleteStorage ? 'delete' : 'keep');
      if (removed) {
        success(`${plugin.name} 已卸载`);
      } else {
        error('插件卸载失败');
      }
    } catch {
      error('插件卸载失败');
    }
  };

  return (
    <WorkbenchPage
      icon={<Package size={14} />}
      eyebrow="Plugin"
      title={plugin.name}
      description={plugin.description || '暂无描述'}
      showHeader={false}
    >
      <ActionBar
        leading={(
          <div className={`text-[length:var(--theme-meta-size)] leading-7 ${themeRecipes.description()}`}>
            {plugin.description || `${plugin.name} 的插件详情页。这里集中展示状态、权限、能力与运行时接入信息。`}
          </div>
        )}
        trailing={<Badge tone={statusTone(plugin.status)}>{statusLabel(plugin.status)}</Badge>}
      />
      <WorkbenchSection title="插件概况" description="先看这个插件是谁、当前状态如何，以及它在宿主里已经接入了哪些基础能力。">
        {plugin.status === 'blocked' && plugin.blocked_reason && (
          <div className="mt-[var(--theme-section-gap)]">
            <ErrorState title="插件当前被阻塞" description={plugin.blocked_reason} />
          </div>
        )}

        <div className="mt-[var(--theme-panel-content-gap)] grid gap-[var(--theme-section-gap)] xl:grid-cols-[1.35fr_1fr]">
          <Card>
            <PropertyList
              items={[
                { label: '版本', value: plugin.version },
                { label: '来源', value: formatPluginSource(plugin.source) },
                { label: '安装', value: plugin.installed ? '已安装到全局' : '未安装到全局' },
                { label: '当前生效', value: plugin.is_active ? '是' : '否' },
                { label: '状态', value: statusLabel(plugin.status) },
                { label: '入口', value: plugin.main || plugin.entry || '未声明' },
                { label: '运行时', value: runtime?.status || 'not_loaded' },
                { label: '安装路径', value: plugin.path.split('\\').slice(-2).join('\\') },
                { label: '完整路径', value: plugin.path },
                { label: '覆盖关系', value: plugin.shadowed_by || '无' },
              ]}
            />
          </Card>
          <StatsGrid
            items={[
              { label: 'Views', value: String(plugin.contributes.views.length + plugin.contributes.left_panel_views.length + plugin.contributes.workbench_views.length) },
              { label: 'Commands', value: String(plugin.contributes.commands.length) },
              { label: 'Tools', value: String(plugin.contributes.agent_tools.length) },
              { label: 'Skills', value: String(plugin.contributes.skills.length) },
              { label: '技能数', value: String(plugin.skills_count) },
              { label: 'Hooks', value: String(plugin.hooks_count) },
            ]}
            columnsClassName="md:grid-cols-2"
          />
        </div>

        {runtime?.error && (
          <div className="mt-[var(--theme-section-gap)]">
            <ErrorState title="运行时错误" description={runtime.error} />
          </div>
        )}
      </WorkbenchSection>

      <WorkbenchSection title="启用状态管理" description="控制当前工作区中这个插件的启停状态和卸载操作。">
        <ActionBar
          leading={(
            <div>
              <div className={themeRecipes.sectionTitle()}>
                {plugin.configured_enabled ? '插件已请求启用' : '插件当前已停用'}
              </div>
              <div className={`mt-1 text-[length:var(--theme-meta-size)] ${themeRecipes.description()}`}>
                {!plugin.is_active && plugin.shadowed_by
                  ? '这个插件实例已被更高优先级的同名插件覆盖，当前不会进入运行时。'
                  : '如果依赖或 capability 不满足，插件会保持 blocked，不会进入运行时。'}
              </div>
            </div>
          )}
          trailing={(
            <>
              <Button variant="secondary" onClick={handleRefresh}>
                刷新
              </Button>
              {!plugin.installed ? (
                <Button variant="secondary" onClick={handleInstallToGlobal}>
                  安装到全局
                </Button>
              ) : null}
              <Button variant={plugin.enabled ? 'primary' : 'secondary'} onClick={handleToggle}>
                {plugin.configured_enabled ? '禁用' : '启用'}
              </Button>
              {plugin.installed ? (
                <Button variant="danger" onClick={handleUninstall}>
                  卸载
                </Button>
              ) : null}
            </>
          )}
        />
      </WorkbenchSection>

      <WorkbenchSection title="依赖与能力" description="插件所需依赖和对外声明的能力。">
        <div className="grid gap-4 lg:grid-cols-3">
          <InfoList title="依赖插件" items={Object.entries(plugin.requires.plugins).map(([name, range]) => `${name} ${range}`)} empty="无插件硬依赖" />
          <InfoList title="依赖 Commands" items={plugin.requires.commands} empty="无 command 依赖" />
          <InfoList title="依赖 Tools" items={plugin.requires.tools} empty="无 tool 依赖" />
          <InfoList title="需要能力" items={plugin.requires.capabilities} empty="无 capability 依赖" />
          <InfoList title="提供能力" items={plugin.provides.capabilities} empty="未声明 capability" />
        </div>
      </WorkbenchSection>

      <WorkbenchSection title="权限授权" description="插件声明的权限必须在当前工作区被授权后才可执行。">
        <Card className="space-y-2">
          {plugin.permissions.length > 0 ? (
            plugin.permissions.map((permission) => {
              const granted = plugin.granted_permissions.includes(permission) || plugin.granted_permissions.includes('*');
              return (
                <Toolbar
                  key={permission}
                  className="border-b-[var(--theme-divider-width)] border-[var(--theme-border)] py-[calc(var(--theme-row-padding-y)*0.7)] last:border-b-0"
                  leading={(
                    <div>
                      <div className={themeRecipes.sectionTitle()}>{permission}</div>
                      <div className={`mt-1 text-[length:var(--theme-meta-size)] ${themeRecipes.description()}`}>{granted ? '已授权给该插件' : '插件已声明，但当前未授权'}</div>
                    </div>
                  )}
                  trailing={(
                    <Button
                      variant={granted ? 'primary' : 'secondary'}
                      onClick={() => void handleTogglePermission(permission, !granted)}
                    >
                      {granted ? '撤销' : '授权'}
                    </Button>
                  )}
                />
              );
            })
          ) : (
            <div className={`text-[length:var(--theme-meta-size)] ${themeRecipes.description()}`}>未声明权限</div>
          )}
        </Card>
      </WorkbenchSection>

      <WorkbenchSection title="声明能力" description="这里是插件 manifest 里静态声明的能力边界，用来回答“这个插件理论上能做什么”。">
          <StatsGrid
            items={[
              { label: 'Activity', value: String(plugin.contributes.activity_bar.length) },
              { label: 'Views', value: String(plugin.contributes.views.length) },
              { label: 'Menus', value: String(plugin.contributes.menus.length) },
              { label: 'Left Panel', value: String(plugin.contributes.left_panel_views.length) },
              { label: 'Workbench', value: String(plugin.contributes.workbench_views.length) },
              { label: 'Commands', value: String(plugin.contributes.commands.length) },
              { label: 'Tools', value: String(plugin.contributes.agent_tools.length) },
              { label: 'Skills', value: String(plugin.contributes.skills.length) },
            ]}
            columnsClassName="md:grid-cols-4"
          />
      </WorkbenchSection>

      <WorkbenchSection title="运行时接入" description="这里是宿主真正看到和注册的内容，用来回答“这个插件现在实际上接进来了什么”。">
          <StatsGrid
            items={[
              { label: 'Activity', value: String(registeredActivity.length) },
              { label: 'Left Panels', value: String(registeredLeftPanels.length) },
              { label: 'Workbench', value: String(registeredWorkbenchViews.length) },
              { label: 'Commands', value: String(registeredCommands.length) },
              { label: 'Message Actions', value: String(registeredMessageActions.length) },
              { label: 'Tool Actions', value: String(registeredToolResultActions.length) },
              { label: 'Settings', value: String(registeredSettingsSections.length) },
              { label: 'Events', value: String(registeredEventHandlers.length) },
              { label: 'Tasks', value: String(pluginTasks.length) },
            ]}
            columnsClassName="md:grid-cols-3"
          />
          <div className="mt-[var(--theme-section-gap)] grid gap-[var(--theme-section-gap)] lg:grid-cols-2">
            <InfoList title="Views" items={[...registeredLeftPanels, ...registeredWorkbenchViews].map((view) => view.id)} empty="没有注册 UI view" />
            <InfoList title="Runtime Entry" items={runtimeEntries} empty="没有可见入口信息" />
            <InfoList title="Manifest Commands" items={plugin.contributes.commands.map(formatContribution)} empty="没有声明 command" />
            <InfoList title="Manifest Tools" items={plugin.contributes.agent_tools.map(formatContribution)} empty="没有声明 tool" />
            <InfoList
              title="Commands"
              items={registeredCommands.map((id) => {
                const metadata = usePluginHostStore.getState().commandHandlers[id]?.metadata;
                return metadata?.title ? `${id} · ${metadata.title}` : id;
              })}
              empty="没有注册 command"
            />
            <InfoList title="Actions" items={[...registeredMessageActions, ...registeredToolResultActions].map((action) => action.id)} empty="没有注册 action" />
            <InfoList title="Settings" items={registeredSettingsSections.map((section) => section.id)} empty="没有注册 settings section" />
            <InfoList title="Events" items={registeredEventHandlers} empty="没有注册 event handler" />
          </div>
      </WorkbenchSection>

      <WorkbenchSection title="诊断信息" description="这里保留最近的调用和运行记录，适合在出现异常或 blocked 时快速排查。">
          <div className="grid gap-4 lg:grid-cols-2">
            <InfoList
              title="Command Invocations"
              items={commandInvocations.map((event) => `${event.status || 'event'} · ${event.name}${event.message ? ` · ${event.message}` : ''}`)}
              empty="暂无 command 调用记录"
            />
            <InfoList
              title="Runtime Tasks"
              items={pluginTasks.map((task) => `${task.status} · ${task.title}${task.detail ? ` · ${task.detail}` : ''}`)}
              empty="暂无 runtime task"
            />
          </div>
      </WorkbenchSection>
    </WorkbenchPage>
  );
};

function statusLabel(status: BackendPluginSummary['status']) {
  switch (status) {
    case 'enabled':
      return '已启用';
    case 'blocked':
      return '依赖阻塞';
    case 'error':
      return '加载错误';
    default:
      return '已禁用';
  }
}

function statusTone(status: BackendPluginSummary['status']): 'success' | 'warning' | 'danger' | 'muted' {
  switch (status) {
    case 'enabled':
      return 'success';
    case 'blocked':
      return 'warning';
    case 'error':
      return 'danger';
    default:
      return 'muted';
  }
}

function formatContribution(contribution: { id?: string; title?: string; description?: string; [key: string]: unknown }) {
  const id = contribution.id || contribution.title || 'unknown';
  const suffix = contribution.description ? ` · ${contribution.description}` : '';
  return `${id}${suffix}`;
}

function formatPluginSource(source: BackendPluginSummary['source']) {
  switch (source) {
    case 'global':
      return 'Global';
    case 'project':
      return 'Project';
    default:
      return 'Workspace Dev';
  }
}
