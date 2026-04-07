import { definePlugin, type LeftPanelProps, type WorkbenchProps } from '../../../src/plugin-host';

interface ExamplePayload {
  message: string;
}

export default definePlugin({
  activate(ctx) {
    ctx.commands.register(
      'my-plugin.hello',
      () => ({ message: 'Hello from a Rhythm plugin.' }),
      { title: 'Hello', description: 'Return a simple greeting.' },
    );

    ctx.ui.activityBar.register({
      id: 'my-plugin.activity',
      title: 'My Plugin',
      icon: 'box',
      opens: 'my-plugin.panel',
    });

    ctx.ui.leftPanel.register({
      id: 'my-plugin.panel',
      title: 'My Plugin',
      component: ExamplePanel,
    });

    ctx.ui.workbench.register<ExamplePayload>({
      id: 'my-plugin.preview',
      title: 'My Plugin Preview',
      component: ExampleWorkbench,
    });
  },
});

function ExamplePanel({ ctx, width }: LeftPanelProps) {
  return (
    <div className="h-full bg-[#f8f7f3] px-4 py-5" style={{ width }}>
      <h2 className="text-lg font-semibold text-slate-900">My Plugin</h2>
      <button
        className="mt-4 rounded-xl bg-slate-900 px-3 py-2 text-sm text-white"
        onClick={() => ctx.ui.workbench.open({
          viewId: 'my-plugin.preview',
          title: 'My Plugin',
          payload: { message: 'Opened from the left panel.' },
        })}
      >
        Open Workbench
      </button>
    </div>
  );
}

function ExampleWorkbench({ payload }: WorkbenchProps<ExamplePayload>) {
  return (
    <div className="h-full px-5 py-5 text-sm text-slate-700">
      {payload.message}
    </div>
  );
}
