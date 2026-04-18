import { llmComplete } from '@/platform/tauri/api/commands';
import { SessionsPanel } from '@/widgets/sidebar/SessionsPanel';
import { definePlugin } from '@/features/plugins/services/sdk';
import { CorePluginDetail } from '@/features/plugins/components/CorePluginDetail';
import { CorePluginsPanel } from '@/features/plugins/components/CorePluginsPanel';
import { CorePluginsOverview } from '@/features/plugins/components/CorePluginsOverview';
import { CorePluginSettingsSection } from '@/features/settings/components/CorePluginSettingsSection';
import { CoreSettingsOverview } from '@/features/settings/components/CoreSettingsOverview';
import { CoreSettingsPanel } from '@/features/settings/components/CoreSettingsPanel';
import { CoreSettingsSection } from '@/features/settings/components/CoreSettingsSection';

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
      id: 'core.sessions.activity',
      title: '会话',
      icon: 'message',
      scope: 'workspace',
      opens: 'core.sessions.panel',
    });
    ctx.ui.activityBar.register({
      id: 'core.plugins.activity',
      title: '插件',
      icon: 'puzzle',
      scope: 'global',
      opens: 'core.plugins.panel',
    });
    ctx.ui.activityBar.register({
      id: 'core.settings.activity',
      title: '设置',
      icon: 'settings',
      scope: 'global',
      opens: 'core.settings.panel',
    });
    ctx.ui.leftPanel.register({
      id: 'core.sessions.panel',
      title: '会话',
      icon: 'message',
      component: SessionsPanel,
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
      id: 'core.plugins.overview',
      title: '插件概览',
      component: CorePluginsOverview,
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


