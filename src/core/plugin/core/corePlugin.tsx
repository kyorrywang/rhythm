import { llmComplete } from '@/core/runtime/api/commands';
import { SessionsPanel } from '@/ui/panels/sidebar/SessionsPanel';
import { definePlugin } from '@/core/plugin/sdk';
import { CorePluginDetail } from './plugins/CorePluginDetail';
import { CorePluginsPanel } from './plugins/CorePluginsPanel';
import { CorePluginsOverview } from './plugins/CorePluginsOverview';
import { CorePluginSettingsSection } from './settings/CorePluginSettingsSection';
import { CoreSettingsOverview } from './settings/CoreSettingsOverview';
import { CoreSettingsPanel } from './settings/CoreSettingsPanel';
import { CoreSettingsSection } from './settings/CoreSettingsSection';
import { SpecChangesPanel, SpecWorkbench } from '@/domains/spec/ui';

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
    ctx.ui.activityBar.register({
      id: 'core.spec.activity',
      title: 'Spec',
      icon: 'scroll-text',
      scope: 'workspace',
      opens: 'core.spec.panel',
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
    ctx.ui.leftPanel.register({
      id: 'core.spec.panel',
      title: 'Spec',
      icon: 'scroll-text',
      component: SpecChangesPanel,
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
    ctx.ui.workbench.register({
      id: 'core.spec.workbench',
      title: 'Spec',
      component: SpecWorkbench,
    });
  },
});
