import { definePlugin } from '../../../src/plugin/sdk';
import { WorkflowEditorView } from './components/WorkflowEditorView';
import { WorkflowNodeInspector } from './components/WorkflowNodeInspector';
import { WorkflowPanel } from './components/WorkflowPanel';
import { WorkflowRunView } from './components/WorkflowRunView';
import { WorkflowSettingsSection } from './components/WorkflowSettingsSection';
import { registerWorkflowCommands } from './commands';
import { WORKFLOW_SETTINGS_SECTION_ID, WORKFLOW_VIEWS } from './constants';
import type { WorkflowEditorPayload, WorkflowNodeInspectorPayload, WorkflowRunPayload } from './types';

export default definePlugin({
  activate(ctx) {
    registerWorkflowCommands(ctx);

    ctx.ui.activityBar.register({
      id: 'workflow.activity',
      title: 'Workflows',
      icon: 'workflow',
      opens: WORKFLOW_VIEWS.panel,
    });

    ctx.ui.leftPanel.register({
      id: WORKFLOW_VIEWS.panel,
      title: 'Workflows',
      icon: 'workflow',
      component: WorkflowPanel,
    });

    ctx.ui.workbench.register<WorkflowEditorPayload>({
      id: WORKFLOW_VIEWS.editor,
      title: 'Workflow Editor',
      component: WorkflowEditorView,
    });

    ctx.ui.workbench.register<WorkflowRunPayload>({
      id: WORKFLOW_VIEWS.run,
      title: 'Workflow Run',
      component: WorkflowRunView,
    });

    ctx.ui.workbench.register<WorkflowNodeInspectorPayload>({
      id: WORKFLOW_VIEWS.nodeInspector,
      title: 'Node Inspector',
      component: WorkflowNodeInspector,
    });

    ctx.ui.settings.register({
      id: WORKFLOW_SETTINGS_SECTION_ID,
      title: 'Workflow',
      description: 'Workflow runner settings.',
      component: WorkflowSettingsSection,
    });
  },
});
