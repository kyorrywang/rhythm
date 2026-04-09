import type { ReactNode } from 'react';
import type { OrchestratorAgent } from '../types';

interface AgentConfigDrawerProps {
  agent: OrchestratorAgent | null;
  onChange: (patch: Partial<OrchestratorAgent>) => void;
}

export function AgentConfigDrawer({ agent, onChange }: AgentConfigDrawerProps) {
  if (!agent) {
    return (
      <aside className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
        Select an agent to configure it.
      </aside>
    );
  }

  return (
    <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Agent Config</h2>
      <div className="mt-4 space-y-4">
        <Field label="Name">
          <input
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
            value={agent.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </Field>
        <Field label="Role">
          <input
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
            value={agent.role}
            onChange={(event) => onChange({ role: event.target.value })}
          />
        </Field>
        <Field label="Goal">
          <textarea
            className="min-h-[96px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
            value={agent.goal}
            onChange={(event) => onChange({ goal: event.target.value })}
          />
        </Field>
        <Field label="Description">
          <textarea
            className="min-h-[96px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
            value={agent.description || ''}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </Field>
        <Field label="Execution Mode">
          <select
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
            value={agent.executionMode}
            onChange={(event) => onChange({ executionMode: event.target.value as OrchestratorAgent['executionMode'] })}
          >
            <option value="direct">direct</option>
            <option value="workflow">workflow</option>
          </select>
        </Field>
        <Field label="Workflow Id">
          <input
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
            value={agent.workflowId || ''}
            onChange={(event) => onChange({ workflowId: event.target.value || undefined })}
          />
        </Field>
        <Field label="Tools">
          <input
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
            value={agent.tools.join(', ')}
            onChange={(event) => onChange({ tools: parseList(event.target.value) })}
          />
        </Field>
        <Field label="Skills">
          <input
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
            value={agent.skills.join(', ')}
            onChange={(event) => onChange({ skills: parseList(event.target.value) })}
          />
        </Field>
        <Field label="Input Sources">
          <input
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
            value={agent.inputSources.join(', ')}
            onChange={(event) => onChange({ inputSources: parseList(event.target.value) })}
          />
        </Field>
        <Field label="Output Artifacts">
          <input
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
            value={agent.outputArtifacts.join(', ')}
            onChange={(event) => onChange({ outputArtifacts: parseList(event.target.value) })}
          />
        </Field>
        <Field label="Completion Condition">
          <textarea
            className="min-h-[72px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
            value={agent.completionCondition || ''}
            onChange={(event) => onChange({ completionCondition: event.target.value || undefined })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={agent.allowSubAgents}
            onChange={(event) => onChange({ allowSubAgents: event.target.checked })}
          />
          Allow subagents
        </label>
        <Field label="Failure Policy">
          <select
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
            value={agent.failurePolicy}
            onChange={(event) => onChange({ failurePolicy: event.target.value as OrchestratorAgent['failurePolicy'] })}
          >
            <option value="fail">fail</option>
            <option value="pause">pause</option>
            <option value="retry">retry</option>
            <option value="skip">skip</option>
          </select>
        </Field>
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      {children}
    </label>
  );
}

function parseList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
