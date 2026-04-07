import { Puzzle, Settings2 } from 'lucide-react';
import { usePluginStore } from '@/shared/state/usePluginStore';
import { Button } from '@/shared/ui/Button';
import { PluginWorkbench } from '@/features/workbench/PluginWorkbench';
import { SettingsWorkbench, type SettingsSection } from '@/features/workbench/SettingsWorkbench';
import { createPluginContext } from './createPluginContext';
import { definePlugin, type LeftPanelProps, type WorkbenchProps } from './types';
import { PluginErrorBoundary } from './PluginErrorBoundary';
import { usePluginHostStore } from './usePluginHostStore';

const settingItems = [
  { id: 'model', name: '模型', description: '管理 provider、模型和默认选择。' },
  { id: 'session', name: '会话', description: '调整 max turns、system prompt 等。' },
  { id: 'permission', name: '权限', description: '配置工具权限与路径规则。' },
  { id: 'frontend', name: '前端显示', description: '管理主题、消息显示和本地偏好。' },
];

export const corePlugin = definePlugin({
  activate(ctx) {
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

  return (
    <PanelShell width={width} icon={<Puzzle size={16} />} title="插件" subtitle="查看已安装插件与运行能力">
      <div className="px-4 pb-3">
        <Button
          variant="unstyled"
          size="none"
          onClick={() => void fetchPlugins(ctx.workspace.cwd())}
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800"
        >
          刷新插件列表
        </Button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        {plugins.map((plugin) => (
          <Button
            variant="unstyled"
            size="none"
            key={plugin.name}
            onClick={() =>
              ctx.ui.workbench.open({
                viewId: 'core.plugin.detail',
                title: plugin.name,
                description: `${plugin.version} · ${plugin.status}`,
                payload: { pluginName: plugin.name },
              })
            }
            className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-800">{plugin.name}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{plugin.version}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{plugin.description}</p>
            <div className="mt-3 text-[11px] text-slate-500">{plugin.status}</div>
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

function CoreSettingsPanel({ ctx, width }: LeftPanelProps) {
  const pluginSettingsSections = usePluginHostStore((state) => Object.values(state.settingsSections));

  return (
    <PanelShell width={width} icon={<Settings2 size={16} />} title="设置" subtitle="选择一个设置项，在工作台中查看详情">
      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        {settingItems.map((item) => (
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
        {pluginSettingsSections.map((section) => (
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
      </div>
    </PanelShell>
  );
}

function CorePluginDetail({ payload, title }: WorkbenchProps<{ pluginName?: string }>) {
  const plugins = usePluginStore((state) => state.plugins);
  const plugin = plugins.find((entry) => entry.name === payload.pluginName || entry.name === title);
  return plugin ? <PluginWorkbench plugin={plugin} /> : null;
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
