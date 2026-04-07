import { definePlugin } from '../../../src/plugin-host';
import { registerDeveloperCommands } from './commands';
import { DEVELOPER_VIEWS } from './constants';
import { DeveloperPanel } from './components/DeveloperPanel';
import { CommandLogView } from './components/CommandLogView';
import { DiffView } from './components/DiffView';
import { ValidationView } from './components/ValidationView';
import { registerDeveloperToolActions } from './toolActions';
import type { DiffPayload, LogPayload, ValidationPayload } from './types';

export default definePlugin({
  activate(ctx) {
    registerDeveloperCommands(ctx);

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

    registerDeveloperToolActions(ctx);
  },
});
