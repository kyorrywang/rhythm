import { Settings2 } from 'lucide-react';
import { useMemo } from 'react';
import { usePluginHostStore } from '@/plugin/host/usePluginHostStore';
import type { WorkbenchProps } from '@/plugin/sdk';
import { ActionBar, Badge, Button, Card, PropertyList, StatsGrid, Toolbar, WorkbenchPage, WorkbenchSection } from '@/shared/ui';
import { themeRecipes } from '@/shared/theme/recipes';
import { InfoList } from '../components/CoreUi';
import { settingItems } from '../constants';

export function CoreSettingsOverview({ ctx }: WorkbenchProps) {
  const settingsSections = usePluginHostStore((state) => state.settingsSections);
  const pluginSettingsSections = useMemo(() => Object.values(settingsSections), [settingsSections]);
  return (
    <WorkbenchPage
      icon={<Settings2 size={16} />}
      eyebrow="Settings"
      title="设置总览"
      description="这里是设置体系的 landing page。先看总览和常用入口，再进入具体设置项。"
      showHeader={false}
    >
      <Card tone="muted" className="leading-7">
        <div className={themeRecipes.description()}>
          这里集中查看核心设置、插件设置与常用入口。顶部标题已经说明当前页面，内容区直接进入概览与导航。
        </div>
      </Card>
      <WorkbenchSection title="设置概况" description="核心设置决定全局行为，插件设置负责插件自己的业务偏好。">
        <div className="grid gap-[var(--theme-section-gap)] xl:grid-cols-[1.8fr_1fr]">
          <StatsGrid
            items={[
              { label: '核心设置分组', value: String(settingItems.length), tone: 'default' },
              { label: '插件设置分组', value: String(pluginSettingsSections.length), tone: pluginSettingsSections.length > 0 ? 'success' : 'default' },
            ]}
            columnsClassName="md:grid-cols-2"
          />
          <Card tone="muted">
            <div className="space-y-[var(--theme-toolbar-gap)]">
              <div className="text-[length:var(--theme-section-title-size)] font-[var(--theme-title-weight)] text-[var(--theme-text-primary)]">如何使用</div>
              <PropertyList
                items={[
                  { label: '左侧', value: '像目录一样查找具体设置项' },
                  { label: '右侧', value: '阅读概览、修改表单、执行保存' },
                  { label: '建议', value: '先从前端显示、模型、权限这三项开始' },
                ]}
              />
            </div>
          </Card>
        </div>
      </WorkbenchSection>
      <WorkbenchSection title="常用入口" description="Overview 应该能帮你直接跳到高频设置，而不是只给两张统计卡。">
        <ActionBar
          leading={<div className="text-[length:var(--theme-meta-size)] text-[var(--theme-text-secondary)]">从这里直接进入常用配置。更细的目录请从左侧继续选择。</div>}
          trailing={(
            <>
              <Button
                variant="secondary"
                onClick={() => ctx.ui.workbench.open({ viewId: 'core.settings.section', title: '前端显示', description: '前端显示设置', payload: { section: 'frontend' }, layoutMode: 'replace' })}
              >
                前端显示
              </Button>
              <Button
                variant="secondary"
                onClick={() => ctx.ui.workbench.open({ viewId: 'core.settings.section', title: '模型设置', description: '模型设置', payload: { section: 'model' }, layoutMode: 'replace' })}
              >
                模型
              </Button>
              <Button
                variant="secondary"
                onClick={() => ctx.ui.workbench.open({ viewId: 'core.settings.section', title: '权限设置', description: '权限设置', payload: { section: 'permission' }, layoutMode: 'replace' })}
              >
                权限
              </Button>
            </>
          )}
        />
      </WorkbenchSection>
      <WorkbenchSection title="设置目录" description="从这里快速理解当前可用的核心设置与插件设置范围。">
        <section className="grid gap-[var(--theme-section-gap)] lg:grid-cols-2">
          <InfoList title="核心设置" items={settingItems.map((item) => `${item.name} · ${item.description}`)} empty="暂无核心设置" />
          <InfoList
            title="插件设置"
            items={pluginSettingsSections.map((section) => `${section.title} · ${section.pluginId || section.id}`)}
            empty="暂无插件设置项"
          />
        </section>
      </WorkbenchSection>
      <div className="grid gap-[var(--theme-section-gap)] lg:grid-cols-2">
        <WorkbenchSection
          title="核心设置特征"
          description="这部分控制模型、会话、权限、记忆与前端显示等全局行为。"
          className="h-full"
        >
          <div className="mt-[var(--theme-panel-content-gap)] space-y-[var(--theme-toolbar-gap)]">
            {settingItems.slice(0, 5).map((item) => (
              <Toolbar
                key={item.id}
                className="justify-between rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-[var(--theme-card-padding-x)] py-[calc(var(--theme-card-padding-y)*0.8)]"
                leading={
                  <div>
                    <div className={themeRecipes.sectionTitle()}>{item.name}</div>
                    <div className={`mt-1 text-[length:var(--theme-meta-size)] ${themeRecipes.description()}`}>{item.description}</div>
                  </div>
                }
                trailing={<Badge tone="muted">核心</Badge>}
              />
            ))}
          </div>
        </WorkbenchSection>

        <WorkbenchSection
          title="插件设置特征"
          description="这部分由插件自己提供，用来承载业务配置和局部工具偏好。"
          className="h-full"
        >
          <div className="mt-[var(--theme-panel-content-gap)] space-y-[var(--theme-toolbar-gap)]">
            {pluginSettingsSections.length > 0 ? (
              pluginSettingsSections.slice(0, 5).map((section) => (
                <Toolbar
                  key={section.id}
                  className="justify-between rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-[var(--theme-card-padding-x)] py-[calc(var(--theme-card-padding-y)*0.8)]"
                  leading={
                    <div>
                      <div className={themeRecipes.sectionTitle()}>{section.title}</div>
                      <div className={`mt-1 text-[length:var(--theme-meta-size)] ${themeRecipes.description()}`}>{section.description || section.id}</div>
                    </div>
                  }
                  trailing={<Badge tone="success">{section.pluginId || 'plugin'}</Badge>}
                />
              ))
            ) : (
              <div className={themeRecipes.description()}>当前还没有插件注册设置项。</div>
            )}
          </div>
        </WorkbenchSection>
      </div>
    </WorkbenchPage>
  );
}
