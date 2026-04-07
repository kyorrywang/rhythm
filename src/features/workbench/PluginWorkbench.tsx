import { AlertCircle, CheckCircle2, Package, Power, Wrench } from 'lucide-react';
import { useToast } from '@/shared/hooks/useToast';
import { usePluginStore } from '@/shared/state/usePluginStore';
import { useActiveWorkspace } from '@/shared/state/useWorkspaceStore';
import { usePluginHostStore } from '@/plugin-host/usePluginHostStore';
import { Button } from '@/shared/ui/Button';
import type { BackendPluginSummary } from '@/shared/types/api';

export const PluginWorkbench = ({ plugin }: { plugin: BackendPluginSummary }) => {
  const workspace = useActiveWorkspace();
  const togglePlugin = usePluginStore((s) => s.togglePlugin);
  const setPluginPermission = usePluginStore((s) => s.setPluginPermission);
  const runtime = usePluginHostStore((s) => s.runtime[plugin.name]);
  const registeredActivity = usePluginHostStore((s) => s.activityBarItems.filter((item) => item.pluginId === plugin.name));
  const registeredLeftPanels = usePluginHostStore((s) => Object.values(s.leftPanels).filter((view) => view.pluginId === plugin.name));
  const registeredWorkbenchViews = usePluginHostStore((s) => Object.values(s.workbenchViews).filter((view) => view.pluginId === plugin.name));
  const registeredSettingsSections = usePluginHostStore((s) => Object.values(s.settingsSections).filter((section) => section.pluginId === plugin.name));
  const registeredCommands = usePluginHostStore((s) => Object.entries(s.commandHandlers).filter(([, command]) => command.pluginId === plugin.name).map(([id]) => id));
  const registeredMessageActions = usePluginHostStore((s) => s.messageActions.filter((action) => action.pluginId === plugin.name));
  const registeredToolResultActions = usePluginHostStore((s) => s.toolResultActions.filter((action) => action.pluginId === plugin.name));
  const registeredEventHandlers = usePluginHostStore((s) => Object.entries(s.eventHandlers)
    .filter(([, handlers]) => handlers.some((handler) => handler.pluginId === plugin.name))
    .map(([event]) => event));
  const commandInvocations = usePluginHostStore((s) => s.commandInvocations.filter((event) => event.pluginId === plugin.name).slice(0, 8));
  const pluginTasks = usePluginHostStore((s) => Object.values(s.tasks).filter((task) => task.pluginId === plugin.name).slice(0, 8));
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

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.05)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-400">
              <Package size={14} />
              <span>Plugin</span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">{plugin.name}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">{plugin.description || '暂无描述'}</p>
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-medium ${statusClassName(plugin.status)}`}>
            {statusLabel(plugin.status)}
          </div>
        </div>
        {plugin.status === 'blocked' && plugin.blocked_reason && (
          <div className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{plugin.blocked_reason}</span>
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <StatCard label="版本" value={plugin.version} />
          <StatCard label="技能数" value={String(plugin.skills_count)} />
          <StatCard label="Hooks" value={String(plugin.hooks_count)} />
          <StatCard label="MCP" value={String(plugin.mcp_servers_count)} />
          <StatCard label="安装路径" value={plugin.path.split('\\').slice(-2).join('\\')} />
          <StatCard label="状态" value={plugin.status} />
          <StatCard label="入口" value={plugin.entry || '未声明'} />
          <StatCard label="运行时" value={runtime?.status || 'not_loaded'} />
        </div>
        {runtime?.error && (
          <div className="mt-5 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{runtime.error}</span>
          </div>
        )}

        <section className="mt-8">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Power size={15} />
            <span>启用状态管理</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-4">
            <div>
              <div className="text-sm font-medium text-slate-800">
                {plugin.configured_enabled ? '插件已请求启用' : '插件当前已停用'}
              </div>
              <div className="mt-1 text-xs text-slate-500">如果依赖或 capability 不满足，插件会保持 blocked，不会进入运行时。</div>
            </div>
            <Button variant="unstyled" size="none" onClick={handleToggle} className={`rounded-full px-4 py-2 text-sm font-medium ${plugin.enabled ? 'bg-slate-900 text-white' : 'bg-emerald-600 text-white'}`}>
              {plugin.configured_enabled ? 'Disable' : 'Enable'}
            </Button>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Wrench size={15} />
            <span>当前后端可见信息</span>
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <CheckCircle2 size={14} className="text-emerald-600" />
                已接入真实后端列表
              </div>
              <div className="mt-2 text-xs leading-6 text-slate-500">
                当前 Tauri 插件命令已经返回依赖、capability、contribution 和运行状态。后续可以在这里继续展开每个 contribution 的详细配置。
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-3">
          <InfoList title="依赖插件" items={Object.entries(plugin.requires.plugins).map(([name, range]) => `${name} ${range}`)} empty="无插件硬依赖" />
          <InfoList title="需要能力" items={plugin.requires.capabilities} empty="无 capability 依赖" />
          <InfoList title="提供能力" items={plugin.provides.capabilities} empty="未声明 capability" />
        </section>
        <section className="mt-8">
          <div className="mb-4 text-sm font-semibold text-slate-800">权限授权</div>
          <div className="space-y-2 rounded-2xl border border-slate-200 px-4 py-4">
            {plugin.permissions.length > 0 ? (
              plugin.permissions.map((permission) => {
                const granted = plugin.granted_permissions.includes(permission) || plugin.granted_permissions.includes('*');
                return (
                  <div key={permission} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
                    <div>
                      <div className="text-sm font-medium text-slate-800">{permission}</div>
                      <div className="mt-1 text-xs text-slate-500">{granted ? '已授权给该插件' : '插件已声明，但当前未授权'}</div>
                    </div>
                    <Button
                      variant="unstyled"
                      size="none"
                      onClick={() => void handleTogglePermission(permission, !granted)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        granted ? 'bg-slate-900 text-white' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {granted ? 'Revoke' : 'Grant'}
                    </Button>
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-slate-500">未声明权限</div>
            )}
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 text-sm font-semibold text-slate-800">Manifest 贡献点</div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Activity" value={String(plugin.contributes.activity_bar.length)} />
            <StatCard label="Left Panel" value={String(plugin.contributes.left_panel_views.length)} />
            <StatCard label="Workbench" value={String(plugin.contributes.workbench_views.length)} />
            <StatCard label="Commands" value={String(plugin.contributes.commands.length)} />
            <StatCard label="Agent Tools" value={String(plugin.contributes.agent_tools.length)} />
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 text-sm font-semibold text-slate-800">运行时注册</div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Activity" value={String(registeredActivity.length)} />
            <StatCard label="Left Panels" value={String(registeredLeftPanels.length)} />
            <StatCard label="Workbench" value={String(registeredWorkbenchViews.length)} />
            <StatCard label="Commands" value={String(registeredCommands.length)} />
            <StatCard label="Message Actions" value={String(registeredMessageActions.length)} />
            <StatCard label="Tool Actions" value={String(registeredToolResultActions.length)} />
            <StatCard label="Settings" value={String(registeredSettingsSections.length)} />
            <StatCard label="Events" value={String(registeredEventHandlers.length)} />
            <StatCard label="Tasks" value={String(pluginTasks.length)} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <InfoList title="Views" items={[...registeredLeftPanels, ...registeredWorkbenchViews].map((view) => view.id)} empty="没有注册 UI view" />
            <InfoList title="Commands" items={registeredCommands.map((id) => {
              const metadata = usePluginHostStore.getState().commandHandlers[id]?.metadata;
              return metadata?.title ? `${id} · ${metadata.title}` : id;
            })} empty="没有注册 command" />
            <InfoList title="Actions" items={[...registeredMessageActions, ...registeredToolResultActions].map((action) => action.id)} empty="没有注册 action" />
            <InfoList title="Settings" items={registeredSettingsSections.map((section) => section.id)} empty="没有注册 settings section" />
            <InfoList title="Events" items={registeredEventHandlers} empty="没有注册 event handler" />
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
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
        </section>
      </div>
    </div>
  );
};

const StatCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl bg-slate-50 px-4 py-4">
    <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{label}</div>
    <div className="mt-2 break-all text-sm font-medium text-slate-800">{value}</div>
  </div>
);

const InfoList = ({ title, items, empty }: { title: string; items: string[]; empty: string }) => (
  <div className="rounded-2xl border border-slate-200 px-4 py-4">
    <div className="text-sm font-semibold text-slate-800">{title}</div>
    {items.length > 0 ? (
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            {item}
          </span>
        ))}
      </div>
    ) : (
      <div className="mt-3 text-xs text-slate-500">{empty}</div>
    )}
  </div>
);

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

function statusClassName(status: BackendPluginSummary['status']) {
  switch (status) {
    case 'enabled':
      return 'bg-emerald-100 text-emerald-700';
    case 'blocked':
      return 'bg-amber-100 text-amber-700';
    case 'error':
      return 'bg-rose-100 text-rose-700';
    default:
      return 'bg-slate-100 text-slate-500';
  }
}
