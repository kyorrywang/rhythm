import { BrainCircuit, Database, LockKeyhole, Monitor, Puzzle, Repeat, Server, TimerReset, Type } from 'lucide-react';
import { themePresets } from '@/ui/theme';
import { themeRecipes } from '@/ui/theme/recipes';
import { useDisplayStore } from '@/ui/state/useDisplayStore';
import { usePermissionStore } from '@/core/permissions/usePermissionStore';
import { useSettingsStore } from '@/core/runtime/useSettingsStore';
import { ActionBar, Badge, Button, Card, Field, FormSection, Input, Select, Textarea, Toolbar, WorkbenchPage, WorkbenchSection } from '@/ui/components';

export type SettingsSection =
  | 'model'
  | 'session'
  | 'permission'
  | 'memory'
  | 'hooks'
  | 'mcp'
  | 'plugin'
  | 'cron'
  | 'frontend';

export const SettingsWorkbench = ({ section }: { section: SettingsSection }) => {
  const { settings, updateSettings, resetSettings, saveToBackend, isLoading } = useSettingsStore();
  const permissionConfig = usePermissionStore((s) => s.config);
  const setPermissionConfig = usePermissionStore((s) => s.setConfig);
  const { preferences, setSegmentConfig, resetToDefaults } = useDisplayStore();
  const sectionMeta: Record<SettingsSection, { title: string; description: string; icon: React.ReactNode }> = {
    model: { title: '模型设置', description: '管理 provider 与模型清单，决定 Composer 下方 model 控件的基础可选项。', icon: <BrainCircuit size={16} /> },
    session: { title: '会话设置', description: '控制默认系统提示词。', icon: <Type size={16} /> },
    permission: { title: '权限设置', description: '这里同时反映本地设置与当前 permission store 配置。', icon: <LockKeyhole size={16} /> },
    memory: { title: '记忆设置', description: '控制 memory 入口是否开启，以及采样规模。', icon: <Database size={16} /> },
    hooks: { title: 'Hooks 设置', description: '展示各类 hook 的触发阶段、匹配器和失败策略。', icon: <Repeat size={16} /> },
    mcp: { title: 'MCP 设置', description: '管理当前 MCP server 列表与连接方式。', icon: <Server size={16} /> },
    plugin: { title: '插件设置', description: '配置视角查看已启用插件，完整安装卸载建议走插件页。', icon: <Puzzle size={16} /> },
    cron: { title: '定时任务设置', description: '展示 cron job 列表、时间计划与工作目录。', icon: <TimerReset size={16} /> },
    frontend: { title: '前端显示设置', description: '这里聚合主题、本地偏好和消息段默认展开规则。', icon: <Monitor size={16} /> },
  };

  const views: Record<SettingsSection, React.ReactNode> = {
    model: (
      <WorkbenchSection title="Provider 与模型" description="管理 provider 与模型清单，决定 Composer 下方 model 控件的基础可选项。">
        <div className="space-y-[var(--theme-section-gap)]">
          {settings.providers.map((provider) => (
            <Card key={provider.id}>
              <Toolbar
                className="justify-between"
                leading={(
                  <div>
                    <div className={themeRecipes.sectionTitle()}>{provider.name}</div>
                    <div className={`mt-1 text-[length:var(--theme-meta-size)] ${themeRecipes.description()}`}>{provider.provider} · {provider.baseUrl}</div>
                  </div>
                )}
              />
              <div className="mt-[var(--theme-section-gap)] grid gap-[var(--theme-toolbar-gap)] md:grid-cols-2">
                {provider.models.map((model) => (
                  <Card key={model.id} tone="muted">
                    <Toolbar
                      className="justify-between"
                      leading={<span className={themeRecipes.sectionTitle()}>{model.name}</span>}
                      trailing={<Badge tone={model.enabled ? 'success' : 'muted'}>{model.enabled ? '可用' : '关闭'}</Badge>}
                    />
                    {model.note && <div className={`mt-[var(--theme-toolbar-gap)] text-[length:var(--theme-meta-size)] ${themeRecipes.description()}`}>{model.note}</div>}
                  </Card>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </WorkbenchSection>
    ),
    session: (
      <WorkbenchSection title="默认对话行为" description="控制默认系统提示词。">
        <div className="grid gap-[var(--theme-section-gap)]">
          <Field label="System prompt">
            <Textarea value={settings.systemPrompt} onChange={(event) => updateSettings({ systemPrompt: event.target.value })} />
          </Field>
        </div>
      </WorkbenchSection>
    ),
    permission: (
      <WorkbenchSection title="权限与工具边界" description="这里同时反映本地设置与当前 permission store 配置。">
        <div className="space-y-[var(--theme-section-gap)]">
          <Field label="Permission mode">
            <Select value={permissionConfig.mode} onChange={(event) => {
              const mode = event.target.value as typeof permissionConfig.mode;
              setPermissionConfig({ mode });
              updateSettings({ permissionMode: mode });
            }}>
              <option value="default">default</option>
              <option value="plan">plan</option>
              <option value="full_auto">full_auto</option>
            </Select>
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
      </WorkbenchSection>
    ),
    memory: (
      <WorkbenchSection title="记忆采样策略" description="控制 memory 入口是否开启，以及采样规模。">
        <div className="grid gap-[var(--theme-section-gap)] md:grid-cols-2">
          <ToggleCard title="启用记忆" checked={settings.memoryEnabled} onChange={(checked) => updateSettings({ memoryEnabled: checked })} />
          <Field label="Max files">
            <Input type="number" value={settings.memoryMaxFiles} onChange={(event) => updateSettings({ memoryMaxFiles: Number(event.target.value) || 0 })} />
          </Field>
          <Field label="Entrypoint lines">
            <Input type="number" value={settings.memoryMaxEntrypointLines} onChange={(event) => updateSettings({ memoryMaxEntrypointLines: Number(event.target.value) || 0 })} />
          </Field>
        </div>
      </WorkbenchSection>
    ),
    hooks: (
      <WorkbenchSection title="Hooks 列表" description="展示各类 hook 的触发阶段、匹配器和失败策略。">
        <div className="space-y-[var(--theme-toolbar-gap)]">
          {settings.hooks.map((hook) => (
            <Card key={hook.id}>
              <Toolbar
                className="justify-between"
                leading={<div className={themeRecipes.sectionTitle()}>{hook.stage}</div>}
                trailing={<Badge tone="muted">{hook.type}</Badge>}
              />
              <div className={`mt-[var(--theme-toolbar-gap)] grid gap-[var(--theme-toolbar-gap)] text-[length:var(--theme-meta-size)] text-[var(--theme-text-secondary)] md:grid-cols-3`}>
                <span>matcher: {hook.matcher}</span>
                <span>timeout: {hook.timeout}ms</span>
                <span>block: {hook.blockOnFailure ? 'true' : 'false'}</span>
              </div>
            </Card>
          ))}
        </div>
      </WorkbenchSection>
    ),
    mcp: (
      <WorkbenchSection title="MCP Server 列表" description="管理当前 MCP server 列表与连接方式。">
        <div className="space-y-[var(--theme-toolbar-gap)]">
          {settings.mcpServers.map((server) => (
            <Card key={server.id}>
              <Toolbar
                className="justify-between"
                leading={(
                  <div>
                    <div className={themeRecipes.sectionTitle()}>{server.name}</div>
                    <div className={`mt-1 text-[length:var(--theme-meta-size)] ${themeRecipes.description()}`}>{server.endpoint}</div>
                  </div>
                )}
                trailing={<Badge tone={server.enabled ? 'success' : 'muted'}>{server.enabled ? 'enabled' : 'disabled'}</Badge>}
              />
            </Card>
          ))}
        </div>
      </WorkbenchSection>
    ),
    plugin: (
      <WorkbenchSection title="插件配置" description="配置视角查看已启用插件，完整安装卸载建议走插件页。">
        <div className="space-y-[var(--theme-section-gap)]">
          <Card tone="muted" className={`leading-7 ${themeRecipes.description()}`}>
            这里保存的是全局插件启用配置。每个插件更细的业务设置，请从左侧“设置”里的 Plugin Settings 分组进入对应插件设置页。
          </Card>
          <Field label="Enabled plugins">
            <TagEditor values={settings.enabledPlugins} onChange={(values) => updateSettings({ enabledPlugins: values })} />
          </Field>
        </div>
      </WorkbenchSection>
    ),
    cron: (
      <WorkbenchSection title="定时任务列表" description="展示 cron job 列表、时间计划与工作目录。">
        <div className="space-y-[var(--theme-toolbar-gap)]">
          {settings.cronJobs.map((job) => (
            <Card key={job.id}>
              <Toolbar
                className="justify-between"
                leading={<div className={themeRecipes.sectionTitle()}>{job.name}</div>}
                trailing={<Badge tone={job.enabled ? 'success' : 'muted'}>{job.enabled ? 'enabled' : 'paused'}</Badge>}
              />
              <div className={`mt-[var(--theme-toolbar-gap)] text-[length:var(--theme-meta-size)] leading-6 text-[var(--theme-text-secondary)]`}>{job.schedule}</div>
              <div className="mt-1 text-[length:var(--theme-meta-size)] leading-6 text-[var(--theme-text-secondary)]">{job.cwd}</div>
            </Card>
          ))}
        </div>
      </WorkbenchSection>
    ),
    frontend: (
      <>
      <WorkbenchSection title="外观与显示" description="这里聚合主题、本地偏好和消息段默认展开规则。">
        <div className="space-y-[var(--theme-section-gap)]">
          <Field label="Theme">
            <Select value={settings.theme} onChange={(event) => updateSettings({ theme: event.target.value as typeof settings.theme })}>
              <option value="system">system</option>
              <option value="light">light</option>
              <option value="dark">dark</option>
            </Select>
          </Field>
          <Field label="Style preset">
            <Select value={settings.themePreset} onChange={(event) => updateSettings({ themePreset: event.target.value as typeof settings.themePreset })}>
              {Object.values(themePresets).map((preset) => (
                <option key={preset.name} value={preset.name}>{preset.label}</option>
              ))}
            </Select>
          </Field>
          <ToggleCard title="自动保存会话" checked={settings.autoSaveSessions} onChange={(checked) => updateSettings({ autoSaveSessions: checked })} />
          <FormSection
            title="消息显示设置"
            description="控制不同消息段在运行时和完成后的默认展开方式。"
            actions={<Button variant="secondary" onClick={resetToDefaults}>恢复显示默认</Button>}
          >
            <Card>
              <div className={`mb-[var(--theme-section-gap)] flex items-center gap-[var(--theme-toolbar-gap)] ${themeRecipes.sectionTitle()}`}>
                <Type size={15} />
                <span>消息显示设置</span>
              </div>
              <div className="space-y-[var(--theme-section-gap)]">
                {([
                  ['thinking', '思考过程'],
                  ['toolCall', '工具调用'],
                  ['ask', 'Ask 交互'],
                ] as const).map(([key, label]) => (
                  <div key={key} className="grid gap-[var(--theme-toolbar-gap)] md:grid-cols-2">
                    <div className={themeRecipes.description()}>{label}</div>
                    <div className="grid grid-cols-2 gap-[var(--theme-toolbar-gap)]">
                      <Select value={preferences[key].whileRunning} onChange={(event) => setSegmentConfig(key, { ...preferences[key], whileRunning: event.target.value as 'expand' | 'collapse' })}>
                        <option value="expand">运行时展开</option>
                        <option value="collapse">运行时折叠</option>
                      </Select>
                      <Select value={preferences[key].whenDone} onChange={(event) => setSegmentConfig(key, { ...preferences[key], whenDone: event.target.value as 'expand' | 'collapse' })}>
                        <option value="expand">完成后展开</option>
                        <option value="collapse">完成后折叠</option>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </FormSection>
          <ActionBar
            leading={<div className={themeRecipes.description()}>前端显示与本地偏好设置只保存在本地，不影响后端运行。</div>}
            trailing={<Button variant="primary" onClick={resetSettings}>恢复所有设置默认</Button>}
          />
        </div>
      </WorkbenchSection>
      </>
    ),
  };

  return (
    <WorkbenchPage
      icon={sectionMeta[section].icon}
      eyebrow="Settings"
      title={sectionMeta[section].title}
      description={sectionMeta[section].description}
      showHeader={false}
    >
      <ActionBar
        leading={(
          <div className={`text-[length:var(--theme-meta-size)] leading-7 ${themeRecipes.description()}`}>
            {sectionMeta[section].description}
          </div>
        )}
        trailing={(
          <Button
            variant="primary"
            onClick={() => void saveToBackend()}
            disabled={isLoading}
            className="disabled:opacity-50"
          >
            保存到后端
          </Button>
        )}
      />
      {views[section]}
      <WorkbenchSection title="保存与同步" description="设置详情负责编辑，页头负责保存；这里补充同步语义，避免保存动作埋在页面最底部。">
        <ActionBar
          leading={<div className={themeRecipes.description()}>会同步当前设置到后端配置，供后续会话和命令执行使用。</div>}
          trailing={<Badge tone="muted">{isLoading ? '正在保存' : '就绪'}</Badge>}
        />
      </WorkbenchSection>
    </WorkbenchPage>
  );
};

const ToggleCard = ({ title, checked, onChange }: { title: string; checked: boolean; onChange: (checked: boolean) => void }) => (
  <Button variant="unstyled" size="none" onClick={() => onChange(!checked)} className="w-full text-left">
    <Card tone={checked ? 'success' : 'default'} className="flex items-center justify-between gap-[var(--theme-toolbar-gap)]">
      <span className={themeRecipes.sectionTitle()}>{title}</span>
      <Badge tone={checked ? 'success' : 'muted'}>{checked ? 'ON' : 'OFF'}</Badge>
    </Card>
  </Button>
);

const TagEditor = ({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) => (
  <Card tone="muted">
    <div className="flex flex-wrap gap-[var(--theme-toolbar-gap)]">
      {values.map((value) => (
        <Badge key={value} tone="muted">{value}</Badge>
      ))}
    </div>
    <Textarea
      value={values.join('\n')}
      onChange={(event) =>
        onChange(
          event.target.value
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean),
        )
      }
      className="mt-[var(--theme-section-gap)]"
    />
  </Card>
);
