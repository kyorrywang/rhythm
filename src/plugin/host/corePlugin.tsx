import { open } from '@tauri-apps/plugin-dialog';
import { AlertCircle, PackagePlus, Puzzle, RefreshCw, Settings2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePluginStore } from '@/shared/state/usePluginStore';
import { useActiveWorkspace } from '@/shared/state/useWorkspaceStore';
import { useToast } from '@/shared/hooks/useToast';
import { Button } from '@/shared/ui/Button';
import { PluginWorkbench } from '@/features/workbench/PluginWorkbench';
import { SettingsWorkbench, type SettingsSection } from '@/features/workbench/SettingsWorkbench';
import { llmComplete } from '@/shared/api/commands';
import { createPluginContext } from './createPluginContext';
import { definePlugin, type LeftPanelProps, type WorkbenchProps } from '../sdk';
import { PluginErrorBoundary } from './PluginErrorBoundary';
import { usePluginHostStore } from './usePluginHostStore';

const settingItems = [
  { id: 'model', name: '模型', description: '管理 provider、模型和默认选择。' },
  { id: 'session', name: '会话', description: '调整 max turns、system prompt 等。' },
  { id: 'permission', name: '权限', description: '配置工具权限与路径规则。' },
  { id: 'memory', name: '记忆', description: '控制 memory 入口与采样规模。' },
  { id: 'hooks', name: 'Hooks', description: '查看 hook 阶段、匹配器与失败策略。' },
  { id: 'mcp', name: 'MCP', description: '管理 MCP server 列表与连接方式。' },
  { id: 'auto_compact', name: '自动压缩', description: '控制上下文压缩阈值与 micro compact。' },
  { id: 'plugin', name: '插件配置', description: '查看全局插件启用配置与边界说明。' },
  { id: 'cron', name: '定时任务', description: '查看 cron job、工作目录与启用状态。' },
  { id: 'frontend', name: '前端显示', description: '管理主题、消息显示和本地偏好。' },
];

export const corePlugin = definePlugin({
  activate(ctx) {
    ctx.commands.register(
      'core.llm.complete',
      async (input: {
        prompt?: string;
        systemPrompt?: string;
        providerId?: string;
        model?: string;
        timeoutSecs?: number;
      }) => {
        const messages = [
          ...(input.systemPrompt ? [{ role: 'system' as const, content: input.systemPrompt }] : []),
          { role: 'user' as const, content: input.prompt || '' },
        ];
        const text = await llmComplete({
          messages,
          providerId: input.providerId,
          model: input.model,
          timeoutSecs: input.timeoutSecs,
        });
        return { text };
      },
      {
        title: 'LLM Complete',
        description: 'Generate text using the active LLM configuration.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            systemPrompt: { type: 'string' },
            providerId: { type: 'string' },
            model: { type: 'string' },
            timeoutSecs: { type: 'number' },
          },
          required: ['prompt'],
        },
      },
    );

    ctx.ui.activityBar.register({
      id: 'core.plugins.activity',
      title: '插件',
      icon: 'puzzle',
      opens: 'core.plugins.panel',
    });
    ctx.ui.activityBar.register({
      id: 'core.settings.activity',
      title: '设置',
      icon: 'settings',
      opens: 'core.settings.panel',
    });
    ctx.ui.leftPanel.register({
      id: 'core.plugins.panel',
      title: '插件',
      icon: 'puzzle',
      component: CorePluginsPanel,
    });
    ctx.ui.leftPanel.register({
      id: 'core.settings.panel',
      title: '设置',
      icon: 'settings',
      component: CoreSettingsPanel,
    });
    ctx.ui.workbench.register({
      id: 'core.plugin.detail',
      title: '插件详情',
      component: CorePluginDetail,
    });
    ctx.ui.workbench.register({
      id: 'core.settings.overview',
      title: '设置总览',
      component: CoreSettingsOverview,
    });
    ctx.ui.workbench.register({
      id: 'core.settings.section',
      title: '设置详情',
      component: CoreSettingsSection,
    });
    ctx.ui.workbench.register({
      id: 'core.plugin.settings.section',
      title: '插件设置',
      component: CorePluginSettingsSection,
    });
  },
});

function CorePluginsPanel({ ctx, width }: LeftPanelProps) {
  const plugins = usePluginStore((state) => state.plugins);
  const pluginsLoading = usePluginStore((state) => state.isLoading);
  const fetchPlugins = usePluginStore((state) => state.fetchPlugins);
  const previewInstallFromPath = usePluginStore((state) => state.previewInstallFromPath);
  const installPluginFromPath = usePluginStore((state) => state.installPluginFromPath);
  const workspace = useActiveWorkspace();
  const { success, error } = useToast();
  const enabledCount = plugins.filter((plugin) => plugin.status === 'enabled').length;
  const blockedCount = plugins.filter((plugin) => plugin.status === 'blocked').length;
  const errorCount = plugins.filter((plugin) => plugin.status === 'error').length;

  const openPluginDetail = (pluginName: string) =>
    ctx.ui.workbench.open({
      viewId: 'core.plugin.detail',
      title: pluginName,
      description: '插件详情',
      payload: { pluginName },
    });

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
        <div className="grid gap-3 md:grid-cols-2">
          <EcosystemStat label="已安装" value={String(plugins.length)} tone="default" />
          <EcosystemStat label="已启用" value={String(enabledCount)} tone="success" />
          <EcosystemStat label="阻塞" value={String(blockedCount)} tone={blockedCount > 0 ? 'warning' : 'default'} />
          <EcosystemStat label="错误" value={String(errorCount)} tone={errorCount > 0 ? 'danger' : 'default'} />
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <Button
            variant="unstyled"
            size="none"
            onClick={() => void handleInstall()}
            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
          >
            <PackagePlus size={15} />
            安装本地插件
          </Button>
          <Button
            variant="unstyled"
            size="none"
            onClick={() => void handleRefresh()}
            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
          >
            <RefreshCw size={15} />
            刷新插件列表
          </Button>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        {plugins.map((plugin) => (
          <Button
            variant="unstyled"
            size="none"
            key={plugin.name}
            onClick={() => openPluginDetail(plugin.name)}
            className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-800">{plugin.name}</span>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${pluginStatusPillClass(plugin.status)}`}>
                  {statusLabel(plugin.status)}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{plugin.version}</span>
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{plugin.description}</p>
            <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500">
              <span>
                {plugin.configured_enabled ? '已请求启用' : '已请求停用'}
              </span>
              <span>
                {plugin.contributes.views.length + plugin.contributes.left_panel_views.length + plugin.contributes.workbench_views.length} views · {plugin.contributes.commands.length} commands
              </span>
            </div>
            {plugin.blocked_reason && (
              <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                <span>{plugin.blocked_reason}</span>
              </div>
            )}
          </Button>
        ))}
        {!pluginsLoading && plugins.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
            当前工作区没有发现插件
          </div>
        )}
      </div>
    </PanelShell>
  );
}

function EcosystemStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'warning'
        ? 'bg-amber-50 text-amber-700'
        : tone === 'danger'
          ? 'bg-rose-50 text-rose-700'
          : 'bg-white text-slate-700';
  return (
    <div className={`rounded-2xl border border-slate-200 px-4 py-3 ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-[0.14em] opacity-70">{label}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  );
}

function pluginStatusPillClass(status: 'enabled' | 'disabled' | 'blocked' | 'error') {
  switch (status) {
    case 'enabled':
      return 'bg-emerald-100 text-emerald-700';
    case 'blocked':
      return 'bg-amber-100 text-amber-700';
    case 'error':
      return 'bg-rose-100 text-rose-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function statusLabel(status: 'enabled' | 'disabled' | 'blocked' | 'error') {
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

function CoreSettingsPanel({ ctx, width }: LeftPanelProps) {
  const pluginSettingsSections = usePluginHostStore((state) => Object.values(state.settingsSections));
  const [query, setQuery] = useState('');
  const filteredCoreSections = useMemo(
    () =>
      settingItems.filter((item) =>
        !query.trim()
        || item.name.toLowerCase().includes(query.trim().toLowerCase())
        || item.description.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [query],
  );
  const filteredPluginSections = useMemo(
    () =>
      pluginSettingsSections.filter((section) =>
        !query.trim()
        || section.title.toLowerCase().includes(query.trim().toLowerCase())
        || (section.description || '').toLowerCase().includes(query.trim().toLowerCase())
        || (section.pluginId || '').toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [pluginSettingsSections, query],
  );

  return (
    <PanelShell width={width} icon={<Settings2 size={16} />} title="设置" subtitle="选择一个设置项，在工作台中查看详情">
      <div className="space-y-3 px-4 pb-3">
        <div className="grid gap-3 md:grid-cols-2">
          <EcosystemStat label="核心设置" value={String(settingItems.length)} tone="default" />
          <EcosystemStat label="插件设置" value={String(pluginSettingsSections.length)} tone={pluginSettingsSections.length > 0 ? 'success' : 'default'} />
        </div>
        <Button
          variant="unstyled"
          size="none"
          onClick={() =>
            ctx.ui.workbench.open({
              viewId: 'core.settings.overview',
              title: '设置总览',
              description: '查看核心与插件设置概况',
              payload: {},
            })
          }
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
        >
          打开设置总览
        </Button>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索设置项"
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-amber-300"
        />
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        {filteredCoreSections.map((item) => (
          <Button
            variant="unstyled"
            size="none"
            key={item.id}
            onClick={() =>
              ctx.ui.workbench.open({
                viewId: 'core.settings.section',
                title: item.name,
                description: item.description,
                payload: { section: item.id },
              })
            }
            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <div>
              <div className="text-sm font-medium text-slate-800">{item.name}</div>
              <div className="mt-1 text-xs text-slate-500">{item.description}</div>
            </div>
          </Button>
        ))}
        {pluginSettingsSections.length > 0 && (
          <div className="px-1 pt-4 text-[11px] uppercase tracking-[0.16em] text-slate-400">Plugin Settings</div>
        )}
        {filteredPluginSections.map((section) => (
          <Button
            variant="unstyled"
            size="none"
            key={section.id}
            onClick={() =>
              ctx.ui.workbench.open({
                viewId: 'core.plugin.settings.section',
                title: section.title,
                description: section.description,
                payload: { sectionId: section.id },
              })
            }
            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <div>
              <div className="text-sm font-medium text-slate-800">{section.title}</div>
              <div className="mt-1 text-xs text-slate-500">{section.description || section.pluginId || section.id}</div>
            </div>
          </Button>
        ))}
        {query.trim() && filteredCoreSections.length + filteredPluginSections.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
            没有找到匹配的设置项
          </div>
        )}
      </div>
    </PanelShell>
  );
}

function CorePluginDetail({ payload, title }: WorkbenchProps<{ pluginName?: string }>) {
  const plugins = usePluginStore((state) => state.plugins);
  const plugin = plugins.find((entry) => entry.name === payload.pluginName || entry.name === title);
  return plugin ? <PluginWorkbench plugin={plugin} /> : null;
}

function CoreSettingsOverview() {
  const pluginSettingsSections = usePluginHostStore((state) => Object.values(state.settingsSections));
  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-400">
          <Settings2 size={16} />
          <span>Settings</span>
        </div>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900">设置总览</h2>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">
          核心设置负责全局运行行为，插件设置负责各插件自己的业务配置。
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <EcosystemStat label="核心设置分组" value={String(settingItems.length)} tone="default" />
          <EcosystemStat label="插件设置分组" value={String(pluginSettingsSections.length)} tone={pluginSettingsSections.length > 0 ? 'success' : 'default'} />
        </div>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <InfoList title="核心设置" items={settingItems.map((item) => `${item.name} · ${item.description}`)} empty="暂无核心设置" />
          <InfoList
            title="插件设置"
            items={pluginSettingsSections.map((section) => `${section.title} · ${section.pluginId || section.id}`)}
            empty="暂无插件设置项"
          />
        </section>
      </div>
    </div>
  );
}

function CoreSettingsSection({ payload }: WorkbenchProps<{ section?: string }>) {
  return <SettingsWorkbench section={(payload.section || 'frontend') as SettingsSection} />;
}

function CorePluginSettingsSection({ payload }: WorkbenchProps<{ sectionId?: string }>) {
  const section = usePluginHostStore((state) => payload.sectionId ? state.settingsSections[payload.sectionId] : undefined);
  if (!section) {
    return (
      <div className="h-full overflow-auto px-5 py-4 text-sm text-slate-500">
        插件设置项不存在或插件尚未加载。
      </div>
    );
  }
  const Section = section.component;
  const pluginId = section.pluginId || 'unknown';
  return (
    <PluginErrorBoundary pluginId={pluginId} surface={section.id}>
      <div className="h-full overflow-auto px-5 py-4">
        <Section ctx={createPluginContext(pluginId)} />
      </div>
    </PluginErrorBoundary>
  );
}

function PanelShell({
  width,
  icon,
  title,
  subtitle,
  children,
}: {
  width: number;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full shrink-0 flex-col bg-[#f8f7f3]" style={{ width }}>
      <div className="px-4 pb-4 pt-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
          {icon}
          <span>{title}</span>
        </div>
        <h2 className="mt-3 text-[20px] font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
