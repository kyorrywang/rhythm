import { useEffect, useMemo } from 'react';
import { cn } from '@/shared/utils/utils';
import { usePluginHostStore } from '@/core/plugin/host/usePluginHostStore';
import { Badge, NavItem, NavList, NavSectionLabel, SidebarPage } from '@/ui/components';
import { useSessionStore } from '@/core/sessions/useSessionStore';
import { useSettingsStore } from '@/core/runtime/useSettingsStore';
import { themeRecipes } from '@/ui/theme/recipes';
import type { LeftPanelProps } from '@/core/plugin/sdk';
import type { ReactNode } from 'react';
import { settingItems } from '../constants';

function SettingsNavCard({
  title,
  description,
  summary,
  trailing,
  active = false,
  onClick,
}: {
  title: ReactNode;
  description: ReactNode;
  summary?: string;
  trailing?: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  const chips = summary
    ? summary.split(' · ').map((item) => item.trim()).filter(Boolean)
    : [];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(`group ${themeRecipes.listRow(active)}`, 'items-start')}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-[calc(var(--theme-toolbar-gap)*0.9)]">
          <div className="min-w-0 flex-1">
            <div className={cn('truncate text-left text-[length:var(--theme-section-title-size)] font-[var(--theme-title-weight)] leading-[1.3]', themeRecipes.listRowTitle(active))}>
              {title}
            </div>
            <div className={cn('mt-1 text-left text-[length:var(--theme-meta-size)] leading-[1.45]', themeRecipes.listRowMeta(active))}>
              {description}
            </div>
            {chips.length > 0 ? (
              <div className="mt-[calc(var(--theme-toolbar-gap)*0.55)] flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <span
                    key={chip}
                    className={cn(
                      'inline-flex items-center rounded-[var(--theme-chip-radius)] border px-2 py-0.5 text-[11px] leading-4',
                      active
                        ? 'border-[var(--theme-list-row-active-border)] bg-[var(--theme-list-row-active-bg)] text-[var(--theme-text-muted)]'
                        : 'border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] text-[var(--theme-text-muted)]',
                    )}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {trailing ? <div className="shrink-0 pt-0.5">{trailing}</div> : null}
        </div>
      </div>
    </button>
  );
}

export function CoreSettingsPanel({ ctx, width }: LeftPanelProps) {
  const settingsSections = usePluginHostStore((state) => state.settingsSections);
  const pluginSettingsSections = useMemo(() => Object.values(settingsSections), [settingsSections]);
  const workbench = useSessionStore((state) => state.workbench);
  const settings = useSettingsStore((state) => state.settings);
  const activeSection = (workbench?.item.payload as { section?: string } | undefined)?.section;
  const activePluginSectionId = (workbench?.item.payload as { sectionId?: string } | undefined)?.sectionId;

  const coreSettingMeta = useMemo<Record<(typeof settingItems)[number]['id'], string>>(() => {
    const providerCount = settings.providers.length;
    const modelCount = settings.providers.reduce((count, provider) => count + provider.models.length, 0);
    const hookCount = settings.hooks.length;
    const mcpEnabledCount = settings.mcpServers.filter((server) => server.enabled).length;
    const cronEnabledCount = settings.cronJobs.filter((job) => job.enabled).length;

    return {
      model: `${providerCount} providers · ${modelCount} models`,
      session: `${settings.systemPrompt.trim() ? 'custom prompt' : 'default prompt'}`,
      permission: `${settings.permissionMode} · ${settings.allowedTools.length}/${settings.deniedTools.length}/${settings.pathRules.length}`,
      memory: `${settings.memoryEnabled ? 'enabled' : 'disabled'} · ${settings.memoryMaxFiles} files`,
      hooks: `${hookCount} hooks`,
      mcp: `${settings.mcpServers.length} servers · ${mcpEnabledCount} enabled`,
      plugin: `${settings.enabledPlugins.length} enabled plugins`,
      cron: `${settings.cronJobs.length} jobs · ${cronEnabledCount} enabled`,
      frontend: `${settings.theme} · ${settings.themePreset}`,
    };
  }, [settings]);

  const openOverview = () =>
    ctx.ui.workbench.open({
      viewId: 'core.settings.overview',
      title: '设置概览',
      description: '查看核心与插件设置概况',
      payload: {},
      layoutMode: 'replace',
    });

  useEffect(() => {
    if (!workbench || workbench.item.viewType !== 'core.settings.overview') {
      openOverview();
    }
  }, []);

  return (
    <SidebarPage width={width}>
      <div className="px-4 pb-3 pt-5">
        <div className={`text-[11px] uppercase tracking-[0.18em] ${themeRecipes.eyebrow()}`}>Settings</div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <NavList className="space-y-[calc(var(--theme-toolbar-gap)*0.55)]">
          <NavItem
            title="Overview"
            description="查看核心设置、插件设置与常用入口概览"
            trailing={<Badge tone="muted">{settingItems.length + pluginSettingsSections.length}</Badge>}
            active={workbench?.item.viewType === 'core.settings.overview'}
            onClick={openOverview}
          />
          <NavSectionLabel>Core Settings</NavSectionLabel>
          {settingItems.map((item) => {
            const active =
              workbench?.item.viewType === 'core.settings.section'
              && activeSection === item.id;
            return (
              <SettingsNavCard
                key={item.id}
                title={item.name}
                description={item.description}
                summary={coreSettingMeta[item.id]}
                trailing={<Badge tone="muted">核心</Badge>}
                active={active}
                onClick={() =>
                  ctx.ui.workbench.open({
                    viewId: 'core.settings.section',
                    title: item.name,
                    description: item.description,
                    payload: { section: item.id },
                    layoutMode: 'replace',
                  })
                }
              />
            );
          })}
          {pluginSettingsSections.length > 0 && <NavSectionLabel>Plugin Settings</NavSectionLabel>}
          {pluginSettingsSections.map((section) => {
            const active =
              workbench?.item.viewType === 'core.plugin.settings.section'
              && activePluginSectionId === section.id;
            return (
              <SettingsNavCard
                key={section.id}
                title={section.title}
                description={section.description || section.pluginId || section.id}
                summary={section.pluginId || 'plugin'}
                trailing={<Badge tone="success">插件</Badge>}
                active={active}
                onClick={() =>
                  ctx.ui.workbench.open({
                    viewId: 'core.plugin.settings.section',
                    title: section.title,
                    description: section.description,
                    payload: { sectionId: section.id },
                    layoutMode: 'replace',
                  })
                }
              />
            );
          })}
        </NavList>
      </div>
    </SidebarPage>
  );
}
