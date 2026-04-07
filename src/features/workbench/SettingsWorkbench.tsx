import { BrainCircuit, Database, HardDrive, LockKeyhole, Monitor, Puzzle, Repeat, Server, TimerReset, Type } from 'lucide-react';
import { useDisplayStore } from '@/shared/state/useDisplayStore';
import { usePermissionStore } from '@/shared/state/usePermissionStore';
import { useSettingsStore } from '@/shared/state/useSettingsStore';

export type SettingsSection =
  | 'model'
  | 'session'
  | 'permission'
  | 'memory'
  | 'hooks'
  | 'mcp'
  | 'auto_compact'
  | 'plugin'
  | 'cron'
  | 'frontend';

export const SettingsWorkbench = ({ section }: { section: SettingsSection }) => {
  const { settings, updateSettings, resetSettings, saveToBackend, isLoading } = useSettingsStore();
  const permissionConfig = usePermissionStore((s) => s.config);
  const setPermissionConfig = usePermissionStore((s) => s.setConfig);
  const { preferences, setSegmentConfig, resetToDefaults } = useDisplayStore();

  const views: Record<SettingsSection, React.ReactNode> = {
    model: (
      <Panel title="模型设置" icon={<BrainCircuit size={16} />} description="管理 provider 与模型清单，决定 Composer 下方 model 控件的基础可选项。">
        <div className="space-y-4">
          {settings.providers.map((provider) => (
            <div key={provider.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-800">{provider.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{provider.baseUrl}</div>
                </div>
                {provider.isDefault && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">默认 Provider</span>}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {provider.models.map((model) => (
                  <div key={model.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-800">{model.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${model.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                        {model.enabled ? '可用' : '关闭'}
                      </span>
                    </div>
                    {model.note && <div className="mt-2 text-xs text-slate-500">{model.note}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    ),
    session: (
      <Panel title="会话设置" icon={<Type size={16} />} description="控制默认系统提示词。">
        <div className="grid gap-6">
          <Field label="System prompt">
            <textarea value={settings.systemPrompt} onChange={(event) => updateSettings({ systemPrompt: event.target.value })} className="min-h-[140px] w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-300" />
          </Field>
        </div>
      </Panel>
    ),
    permission: (
      <Panel title="权限设置" icon={<LockKeyhole size={16} />} description="这里同时反映本地设置与当前 permission store 配置。">
        <div className="space-y-6">
          <Field label="Permission mode">
            <select value={permissionConfig.mode} onChange={(event) => {
              const mode = event.target.value as typeof permissionConfig.mode;
              setPermissionConfig({ mode });
              updateSettings({ permissionMode: mode });
            }} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-300">
              <option value="default">default</option>
              <option value="plan">plan</option>
              <option value="full_auto">full_auto</option>
            </select>
          </Field>
          <Field label="Allowed tools">
            <TagEditor values={settings.allowedTools} onChange={(values) => updateSettings({ allowedTools: values })} />
          </Field>
          <Field label="Denied tools">
            <TagEditor values={settings.deniedTools} onChange={(values) => updateSettings({ deniedTools: values })} />
          </Field>
          <Field label="Path rules">
            <TagEditor values={settings.pathRules} onChange={(values) => updateSettings({ pathRules: values })} />
          </Field>
          <Field label="Denied commands">
            <TagEditor values={settings.deniedCommands} onChange={(values) => updateSettings({ deniedCommands: values })} />
          </Field>
        </div>
      </Panel>
    ),
    memory: (
      <Panel title="记忆设置" icon={<Database size={16} />} description="控制 memory 入口是否开启，以及采样规模。">
        <div className="grid gap-6 md:grid-cols-2">
          <ToggleCard title="启用记忆" checked={settings.memoryEnabled} onChange={(checked) => updateSettings({ memoryEnabled: checked })} />
          <Field label="Max files">
            <input type="number" value={settings.memoryMaxFiles} onChange={(event) => updateSettings({ memoryMaxFiles: Number(event.target.value) || 0 })} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-300" />
          </Field>
          <Field label="Entrypoint lines">
            <input type="number" value={settings.memoryMaxEntrypointLines} onChange={(event) => updateSettings({ memoryMaxEntrypointLines: Number(event.target.value) || 0 })} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-300" />
          </Field>
        </div>
      </Panel>
    ),
    hooks: (
      <Panel title="Hooks 设置" icon={<Repeat size={16} />} description="展示各类 hook 的触发阶段、匹配器和失败策略。">
        <div className="space-y-3">
          {settings.hooks.map((hook) => (
            <div key={hook.id} className="rounded-2xl border border-slate-200 px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-slate-800">{hook.stage}</div>
                <div className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{hook.type}</div>
              </div>
              <div className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                <span>matcher: {hook.matcher}</span>
                <span>timeout: {hook.timeout}ms</span>
                <span>block: {hook.blockOnFailure ? 'true' : 'false'}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    ),
    mcp: (
      <Panel title="MCP 设置" icon={<Server size={16} />} description="管理当前 MCP server 列表与连接方式。">
        <div className="space-y-3">
          {settings.mcpServers.map((server) => (
            <div key={server.id} className="rounded-2xl border border-slate-200 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-800">{server.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{server.endpoint}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${server.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {server.enabled ? 'enabled' : 'disabled'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    ),
    auto_compact: (
      <Panel title="自动压缩设置" icon={<HardDrive size={16} />} description="控制上下文压缩阈值和 micro compact 次数。">
        <div className="grid gap-6 md:grid-cols-2">
          <ToggleCard title="启用自动压缩" checked={settings.autoCompactEnabled} onChange={(checked) => updateSettings({ autoCompactEnabled: checked })} />
          <Field label="Threshold ratio">
            <input type="number" step="0.01" value={settings.autoCompactThresholdRatio} onChange={(event) => updateSettings({ autoCompactThresholdRatio: Number(event.target.value) || 0 })} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-300" />
          </Field>
          <Field label="Max micro compacts">
            <input type="number" value={settings.autoCompactMaxMicroCompacts} onChange={(event) => updateSettings({ autoCompactMaxMicroCompacts: Number(event.target.value) || 0 })} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-300" />
          </Field>
        </div>
      </Panel>
    ),
    plugin: (
      <Panel title="插件设置" icon={<Puzzle size={16} />} description="配置视角查看已启用插件，完整安装卸载建议走插件页。">
        <Field label="Enabled plugins">
          <TagEditor values={settings.enabledPlugins} onChange={(values) => updateSettings({ enabledPlugins: values })} />
        </Field>
      </Panel>
    ),
    cron: (
      <Panel title="定时任务设置" icon={<TimerReset size={16} />} description="展示 cron job 列表、时间计划与工作目录。">
        <div className="space-y-3">
          {settings.cronJobs.map((job) => (
            <div key={job.id} className="rounded-2xl border border-slate-200 px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-slate-800">{job.name}</div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${job.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {job.enabled ? 'enabled' : 'paused'}
                </span>
              </div>
              <div className="mt-2 text-xs leading-6 text-slate-500">{job.schedule}</div>
              <div className="mt-1 text-xs leading-6 text-slate-500">{job.cwd}</div>
            </div>
          ))}
        </div>
      </Panel>
    ),
    frontend: (
      <Panel title="前端显示设置" icon={<Monitor size={16} />} description="这里聚合主题、本地偏好和消息段默认展开规则。">
        <div className="space-y-6">
          <Field label="Theme">
            <select value={settings.theme} onChange={(event) => updateSettings({ theme: event.target.value as typeof settings.theme })} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-300">
              <option value="system">system</option>
              <option value="light">light</option>
              <option value="dark">dark</option>
            </select>
          </Field>
          <ToggleCard title="自动保存会话" checked={settings.autoSaveSessions} onChange={(checked) => updateSettings({ autoSaveSessions: checked })} />
          <div className="rounded-3xl border border-slate-200 p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Type size={15} />
              <span>消息显示设置</span>
            </div>
            <div className="space-y-4">
              {([
                ['thinking', '思考过程'],
                ['toolCall', '工具调用'],
                ['ask', 'Ask 交互'],
              ] as const).map(([key, label]) => (
                <div key={key} className="grid gap-3 md:grid-cols-2">
                  <div className="text-sm text-slate-700">{label}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <select value={preferences[key].whileRunning} onChange={(event) => setSegmentConfig(key, { ...preferences[key], whileRunning: event.target.value as 'expand' | 'collapse' })} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300">
                      <option value="expand">运行时展开</option>
                      <option value="collapse">运行时折叠</option>
                    </select>
                    <select value={preferences[key].whenDone} onChange={(event) => setSegmentConfig(key, { ...preferences[key], whenDone: event.target.value as 'expand' | 'collapse' })} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300">
                      <option value="expand">完成后展开</option>
                      <option value="collapse">完成后折叠</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={resetToDefaults} className="mt-4 rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-600">恢复显示默认</button>
          </div>
          <button onClick={resetSettings} className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white">恢复所有设置默认</button>
        </div>
      </Panel>
    ),
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      {views[section]}
      <div className="mt-4 flex justify-end">
        <button
          onClick={() => void saveToBackend()}
          disabled={isLoading}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          保存到后端
        </button>
      </div>
    </div>
  );
};

const Panel = ({ title, icon, description, children }: { title: string; icon: React.ReactNode; description: string; children: React.ReactNode }) => (
  <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.05)]">
    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-400">
      {icon}
      <span>Settings</span>
    </div>
    <h2 className="mt-3 text-2xl font-semibold text-slate-900">{title}</h2>
    <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">{description}</p>
    <div className="mt-8">{children}</div>
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <div className="mb-2 text-sm font-medium text-slate-700">{label}</div>
    {children}
  </label>
);

const ToggleCard = ({ title, checked, onChange }: { title: string; checked: boolean; onChange: (checked: boolean) => void }) => (
  <button onClick={() => onChange(!checked)} className={`flex items-center justify-between rounded-2xl border px-4 py-4 text-left ${checked ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
    <span className="text-sm font-medium text-slate-800">{title}</span>
    <span className={`rounded-full px-2 py-0.5 text-[11px] ${checked ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{checked ? 'ON' : 'OFF'}</span>
  </button>
);

const TagEditor = ({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span key={value} className="rounded-full bg-white px-3 py-1 text-xs text-slate-600 shadow-sm">{value}</span>
      ))}
    </div>
    <textarea
      value={values.join('\n')}
      onChange={(event) =>
        onChange(
          event.target.value
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean),
        )
      }
      className="mt-4 min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-amber-300"
    />
  </div>
);
