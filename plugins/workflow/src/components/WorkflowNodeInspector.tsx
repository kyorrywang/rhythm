import type { WorkbenchProps } from '../../../../src/plugin/sdk';
import type { WorkflowNodeInspectorPayload } from '../types';

export function WorkflowNodeInspector({ payload }: WorkbenchProps<WorkflowNodeInspectorPayload>) {
  return (
    <div className="h-full overflow-y-auto bg-[#fbfaf7] p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Node Inspector</div>
      <h2 className="mt-2 text-2xl font-semibold text-slate-900">{payload.node.title}</h2>
      <p className="mt-1 text-sm text-slate-500">{payload.node.type}</p>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Config</h3>
        <pre className="mt-3 overflow-auto rounded-2xl bg-slate-950 p-3 text-xs leading-5 text-slate-100">
          {JSON.stringify(payload.node.config, null, 2)}
        </pre>
      </section>

      {payload.nodeRun && (
        <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Run</h3>
          <pre className="mt-3 overflow-auto rounded-2xl bg-slate-950 p-3 text-xs leading-5 text-slate-100">
            {JSON.stringify(payload.nodeRun, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
