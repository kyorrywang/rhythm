import { definePlugin } from '../../../src/plugin/sdk';
import { registerDeveloperCommands } from './commands';
import { DEVELOPER_SETTINGS_SECTION_ID, DEVELOPER_VIEWS } from './constants';
import { DeveloperPanel } from './components/DeveloperPanel';
import { CommandLogView } from './components/CommandLogView';
import { DiffView } from './components/DiffView';
import { TaskSummaryView } from './components/TaskSummaryView';
import { ValidationView } from './components/ValidationView';
import { DeveloperSettingsSection } from './components/DeveloperSettingsSection';
import { registerDeveloperToolActions } from './toolActions';
import { registerDeveloperWorkflowNodes } from './workflowNodes';
import type { DeveloperTaskSummary, DiffPayload, LogPayload, ValidationPayload } from './types';

export default definePlugin({
  activate(ctx) {
    registerDeveloperCommands(ctx);
    registerDeveloperWorkflowNodes(ctx);

    ctx.ui.activityBar.register({
      id: 'developer.activity',
      title: 'Dev',
      icon: 'code',
      opens: DEVELOPER_VIEWS.panel,
    });

    ctx.ui.leftPanel.register({
      id: DEVELOPER_VIEWS.panel,
      title: 'Development',
      icon: 'code',
      component: DeveloperPanel,
    });

    ctx.ui.settings.register({
      id: DEVELOPER_SETTINGS_SECTION_ID,
      title: 'Developer',
      description: 'Developer plugin settings and validation presets.',
      component: DeveloperSettingsSection,
    });

    ctx.ui.workbench.register<LogPayload>({
      id: DEVELOPER_VIEWS.log,
      title: 'Command Log',
      component: CommandLogView,
    });

    ctx.ui.workbench.register<DiffPayload>({
      id: DEVELOPER_VIEWS.diff,
      title: 'Diff',
      component: DiffView,
    });

    ctx.ui.workbench.register<ValidationPayload>({
      id: DEVELOPER_VIEWS.validation,
      title: 'Validation',
      component: ValidationView,
    });

    ctx.ui.workbench.register<DeveloperTaskSummary>({
      id: DEVELOPER_VIEWS.taskSummary,
      title: 'Task Summary',
      component: TaskSummaryView,
    });

    registerDeveloperToolActions(ctx);
  },
});
