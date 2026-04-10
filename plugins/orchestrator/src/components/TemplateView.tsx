import { useEffect, useState } from 'react';
import type { WorkbenchProps } from '../../../../src/plugin/sdk';
import { ORCHESTRATOR_COMMANDS } from '../constants';
import { getTemplate } from '../storage';
import type { OrchestratorAgent, OrchestratorStage, OrchestratorTemplate, OrchestratorTemplateParameter, OrchestratorTemplatePayload } from '../types';
import { createId } from '../utils';
import { AgentBoard } from './AgentBoard';
import { AgentConfigDrawer } from './AgentConfigDrawer';
import { StageBoard } from './StageBoard';

export function TemplateView({ ctx, payload }: WorkbenchProps<OrchestratorTemplatePayload>) {
  const [template, setTemplate] = useState(payload.template);
  const [draft, setDraft] = useState({
    name: payload.template.name,
    domain: payload.template.domain,
    version: payload.template.version,
    description: payload.template.description || '',
    parameters: payload.template.parameters || [],
  });
  const [selectedStageId, setSelectedStageId] = useState<string | undefined>(payload.template.stageRows[0]?.stages[0]?.id);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(
    payload.template.stageRows[0]?.stages[0]?.agentRows[0]?.agents[0]?.id,
  );

  useEffect(() => {
    setTemplate(payload.template);
    setDraft({
      name: payload.template.name,
      domain: payload.template.domain,
      version: payload.template.version,
      description: payload.template.description || '',
      parameters: payload.template.parameters || [],
    });
    setSelectedStageId(payload.template.stageRows[0]?.stages[0]?.id);
    setSelectedAgentId(payload.template.stageRows[0]?.stages[0]?.agentRows[0]?.agents[0]?.id);
  }, [payload.template]);

  useEffect(() => {
    void (async () => {
      const latest = await getTemplate(ctx, payload.template.id);
      if (!latest) return;
      setTemplate(latest);
      setDraft({
        name: latest.name,
        domain: latest.domain,
        version: latest.version,
        description: latest.description || '',
        parameters: latest.parameters || [],
      });
      setSelectedStageId((current) => current || latest.stageRows[0]?.stages[0]?.id);
      setSelectedAgentId((current) => current || latest.stageRows[0]?.stages[0]?.agentRows[0]?.agents[0]?.id);
    })();
  }, [ctx, payload.template.id]);

  const isDirty = draft.name !== template.name
    || draft.domain !== template.domain
    || draft.version !== template.version
    || draft.description !== (template.description || '')
    || JSON.stringify(draft.parameters) !== JSON.stringify(template.parameters || []);

  async function saveMeta() {
    const next = await ctx.commands.execute<unknown, OrchestratorTemplate>(ORCHESTRATOR_COMMANDS.updateTemplate, {
      templateId: template.id,
      patch: {
        name: draft.name,
        domain: draft.domain,
        version: draft.version,
        description: draft.description,
        parameters: draft.parameters,
      },
    });
    setTemplate(next);
  }

  function findSelectedStage(currentTemplate = template) {
    for (const row of currentTemplate.stageRows) {
      const stage = row.stages.find((item) => item.id === selectedStageId);
      if (stage) return stage;
    }
    return null;
  }

  function findSelectedAgent(currentTemplate = template) {
    const stage = findSelectedStage(currentTemplate);
    if (!stage) return null;
    for (const row of stage.agentRows) {
      const agent = row.agents.find((item) => item.id === selectedAgentId);
      if (agent) return agent;
    }
    return null;
  }

  async function saveStructure(nextStageRows: OrchestratorTemplate['stageRows']) {
    const next = await ctx.commands.execute<unknown, OrchestratorTemplate>(ORCHESTRATOR_COMMANDS.updateTemplate, {
      templateId: template.id,
      patch: {
        stageRows: nextStageRows,
      },
    });
    setTemplate(next);
  }

  async function addStageRow() {
    const nextRows = [
      ...template.stageRows,
      {
        id: createId('stage_row'),
        stages: [],
      },
    ];
    await saveStructure(nextRows);
  }

  async function addStage(rowId: string) {
    const stageId = createId('stage');
    const agentId = createId('agent');
    const nextRows = template.stageRows.map((row) => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        stages: [
          ...row.stages,
          {
            id: stageId,
            name: `Stage ${row.stages.length + 1}`,
            goal: 'Describe the stage goal.',
            agentRows: [
              {
                id: createId('agent_row'),
                agents: [
                  createDefaultAgent(agentId),
                ],
              },
            ],
          },
        ],
      };
    });
    await saveStructure(nextRows);
    setSelectedStageId(stageId);
    setSelectedAgentId(agentId);
  }

  async function addAgentRow(stageId: string) {
    const nextRows = template.stageRows.map((row) => ({
      ...row,
      stages: row.stages.map((stage) => {
        if (stage.id !== stageId) return stage;
        return {
          ...stage,
          agentRows: [
            ...stage.agentRows,
            {
              id: createId('agent_row'),
              agents: [],
            },
          ],
        };
      }),
    }));
    await saveStructure(nextRows);
  }

  async function addAgent(stageId: string, rowId: string) {
    const agentId = createId('agent');
    const nextRows = template.stageRows.map((row) => ({
      ...row,
      stages: row.stages.map((stage) => {
        if (stage.id !== stageId) return stage;
        return {
          ...stage,
          agentRows: stage.agentRows.map((agentRow) => {
            if (agentRow.id !== rowId) return agentRow;
            return {
              ...agentRow,
              agents: [
                ...agentRow.agents,
                createDefaultAgent(agentId),
              ],
            };
          }),
        };
      }),
    }));
    await saveStructure(nextRows);
    setSelectedStageId(stageId);
    setSelectedAgentId(agentId);
  }

  async function moveStageRow(rowId: string, direction: 'up' | 'down') {
    const index = template.stageRows.findIndex((row) => row.id === rowId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= template.stageRows.length) return;
    const nextRows = [...template.stageRows];
    const [removed] = nextRows.splice(index, 1);
    nextRows.splice(targetIndex, 0, removed);
    await saveStructure(nextRows);
  }

  async function moveStage(rowId: string, stageId: string, direction: 'left' | 'right') {
    const nextRows = template.stageRows.map((row) => {
      if (row.id !== rowId) return row;
      const index = row.stages.findIndex((stage) => stage.id === stageId);
      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= row.stages.length) return row;
      const stages = [...row.stages];
      const [removed] = stages.splice(index, 1);
      stages.splice(targetIndex, 0, removed);
      return { ...row, stages };
    });
    await saveStructure(nextRows);
  }

  async function deleteStage(rowId: string, stageId: string) {
    const nextRows = template.stageRows.map((row) => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        stages: row.stages.filter((stage) => stage.id !== stageId),
      };
    });
    await saveStructure(nextRows);
    if (selectedStageId === stageId) {
      const nextStage = nextRows.flatMap((row) => row.stages)[0];
      setSelectedStageId(nextStage?.id);
      setSelectedAgentId(nextStage?.agentRows[0]?.agents[0]?.id);
    }
  }

  async function updateAgent(patch: Partial<OrchestratorAgent>) {
    const stage = findSelectedStage();
    const agent = findSelectedAgent();
    if (!stage || !agent) return;
    const nextRows = template.stageRows.map((row) => ({
      ...row,
      stages: row.stages.map((currentStage) => {
        if (currentStage.id !== stage.id) return currentStage;
        return {
          ...currentStage,
          agentRows: currentStage.agentRows.map((agentRow) => ({
            ...agentRow,
            agents: agentRow.agents.map((currentAgent) => (
              currentAgent.id === agent.id
                ? { ...currentAgent, ...patch }
                : currentAgent
            )),
          })),
        };
      }),
    }));
    await saveStructure(nextRows);
  }

  async function moveAgentRow(stageId: string, rowId: string, direction: 'up' | 'down') {
    const nextRows = template.stageRows.map((row) => ({
      ...row,
      stages: row.stages.map((stage) => {
        if (stage.id !== stageId) return stage;
        const index = stage.agentRows.findIndex((agentRow) => agentRow.id === rowId);
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (index < 0 || targetIndex < 0 || targetIndex >= stage.agentRows.length) return stage;
        const agentRows = [...stage.agentRows];
        const [removed] = agentRows.splice(index, 1);
        agentRows.splice(targetIndex, 0, removed);
        return { ...stage, agentRows };
      }),
    }));
    await saveStructure(nextRows);
  }

  async function moveAgent(stageId: string, rowId: string, agentId: string, direction: 'left' | 'right') {
    const nextRows = template.stageRows.map((row) => ({
      ...row,
      stages: row.stages.map((stage) => {
        if (stage.id !== stageId) return stage;
        return {
          ...stage,
          agentRows: stage.agentRows.map((agentRow) => {
            if (agentRow.id !== rowId) return agentRow;
            const index = agentRow.agents.findIndex((agent) => agent.id === agentId);
            const targetIndex = direction === 'left' ? index - 1 : index + 1;
            if (index < 0 || targetIndex < 0 || targetIndex >= agentRow.agents.length) return agentRow;
            const agents = [...agentRow.agents];
            const [removed] = agents.splice(index, 1);
            agents.splice(targetIndex, 0, removed);
            return { ...agentRow, agents };
          }),
        };
      }),
    }));
    await saveStructure(nextRows);
  }

  async function deleteAgent(stageId: string, rowId: string, agentId: string) {
    const nextRows = template.stageRows.map((row) => ({
      ...row,
      stages: row.stages.map((stage) => {
        if (stage.id !== stageId) return stage;
        return {
          ...stage,
          agentRows: stage.agentRows.map((agentRow) => {
            if (agentRow.id !== rowId) return agentRow;
            return {
              ...agentRow,
              agents: agentRow.agents.filter((agent) => agent.id !== agentId),
            };
          }),
        };
      }),
    }));
    await saveStructure(nextRows);
    if (selectedAgentId === agentId) {
      const stage = nextRows.flatMap((row) => row.stages).find((item) => item.id === stageId);
      setSelectedAgentId(stage?.agentRows.flatMap((row) => row.agents)[0]?.id);
    }
  }

  async function updateStage(patch: Partial<{ name: string; goal: string; description?: string }>) {
    const stage = findSelectedStage();
    if (!stage) return;
    const nextRows = template.stageRows.map((row) => ({
      ...row,
      stages: row.stages.map((currentStage) => (
        currentStage.id === stage.id
          ? { ...currentStage, ...patch }
          : currentStage
      )),
    }));
    await saveStructure(nextRows);
  }

  return (
    <div className="h-full overflow-auto bg-white px-6 py-5 text-sm text-slate-700">
      <div className="max-w-7xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{template.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {template.domain} · v{template.version}
            </p>
            {template.description ? <p className="mt-3 text-sm text-slate-600">{template.description}</p> : null}
          </div>
          <button
            className="rounded-[var(--theme-radius-control)] bg-slate-900 px-3 py-2 text-sm text-white"
            onClick={() => void ctx.commands.execute(ORCHESTRATOR_COMMANDS.createPlanDraft, {
              title: template.name,
              goal: template.description || `${template.name} plan`,
              overview: template.description || `Use ${template.name} as a starting scaffold for a confirmed plan.`,
              reviewPolicy: 'Each major stage must be reviewed before orchestration continues.',
              stages: template.stageRows.flatMap((row) => row.stages.map((stage) => ({
                name: stage.name,
                goal: stage.goal,
                deliverables: stage.agentRows.flatMap((agentRow) => agentRow.agents.flatMap((agent) => agent.outputArtifacts || [])),
              }))),
            })}
          >
            Create Plan Draft
          </button>
        </div>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-slate-900">Template Meta</h2>
            <div className="flex gap-2">
              <button
                className="rounded border border-rose-300 bg-white px-3 py-2 text-xs text-rose-600"
                onClick={() => void ctx.commands.execute(ORCHESTRATOR_COMMANDS.deleteTemplate, {
                  templateId: template.id,
                })}
              >
                Delete
              </button>
              <button
                className="rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700"
                onClick={() => void ctx.commands.execute(ORCHESTRATOR_COMMANDS.duplicateTemplate, {
                  templateId: template.id,
                })}
              >
                Duplicate
              </button>
              <button
                className="rounded bg-slate-900 px-3 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!isDirty}
                onClick={() => void saveMeta()}
              >
                Save
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Name</div>
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Domain</div>
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
                value={draft.domain}
                onChange={(event) => setDraft((current) => ({ ...current, domain: event.target.value }))}
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Version</div>
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
                value={draft.version}
                onChange={(event) => setDraft((current) => ({ ...current, version: event.target.value }))}
              />
            </label>
            <label className="block md:col-span-2">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Description</div>
              <textarea
                className="min-h-[96px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
            <div className="block md:col-span-2">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Run Parameters</div>
              <TemplateParametersEditor
                parameters={draft.parameters}
                onChange={(parameters) => setDraft((current) => ({ ...current, parameters }))}
              />
            </div>
          </div>
        </section>

        <StageBoard
          template={template}
          selectedStageId={selectedStageId}
          onSelectStage={(stageId) => {
            setSelectedStageId(stageId);
            const stage = template.stageRows.flatMap((row) => row.stages).find((item) => item.id === stageId);
            setSelectedAgentId(stage?.agentRows[0]?.agents[0]?.id);
          }}
          onAddRow={() => void addStageRow()}
          onAddStage={(rowId) => void addStage(rowId)}
          onMoveRow={(rowId, direction) => void moveStageRow(rowId, direction)}
          onMoveStage={(rowId, stageId, direction) => void moveStage(rowId, stageId, direction)}
          onDeleteStage={(rowId, stageId) => void deleteStage(rowId, stageId)}
        />

        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <StageDetailsEditor
              stage={findSelectedStage()}
              onChange={(patch) => void updateStage(patch)}
            />
            <AgentBoard
              stage={findSelectedStage()}
              selectedAgentId={selectedAgentId}
              onSelectAgent={setSelectedAgentId}
              onAddAgentRow={(stageId) => void addAgentRow(stageId)}
              onAddAgent={(stageId, rowId) => void addAgent(stageId, rowId)}
              onMoveAgentRow={(stageId, rowId, direction) => void moveAgentRow(stageId, rowId, direction)}
              onMoveAgent={(stageId, rowId, agentId, direction) => void moveAgent(stageId, rowId, agentId, direction)}
              onDeleteAgent={(stageId, rowId, agentId) => void deleteAgent(stageId, rowId, agentId)}
            />
          </div>
          <AgentConfigDrawer
            agent={findSelectedAgent()}
            onChange={(patch) => void updateAgent(patch)}
          />
        </section>
      </div>
    </div>
  );
}

function TemplateParametersEditor({
  parameters,
  onChange,
}: {
  parameters: OrchestratorTemplateParameter[];
  onChange: (parameters: OrchestratorTemplateParameter[]) => void;
}) {
  function updateParameter(parameterId: string, patch: Partial<OrchestratorTemplateParameter>) {
    onChange(parameters.map((parameter) => (
      parameter.id === parameterId ? { ...parameter, ...patch } : parameter
    )));
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      {parameters.map((parameter) => (
        <div key={parameter.id} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Name</div>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
              value={parameter.name}
              onChange={(event) => updateParameter(parameter.id, { name: event.target.value })}
            />
          </label>
          <label className="block">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Label</div>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
              value={parameter.label}
              onChange={(event) => updateParameter(parameter.id, { label: event.target.value })}
            />
          </label>
          <label className="block">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Default Value</div>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
              value={parameter.defaultValue || ''}
              onChange={(event) => updateParameter(parameter.id, { defaultValue: event.target.value || undefined })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 md:mt-6">
            <input
              type="checkbox"
              checked={parameter.required}
              onChange={(event) => updateParameter(parameter.id, { required: event.target.checked })}
            />
            Required
          </label>
          <label className="block md:col-span-2">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Description</div>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
              value={parameter.description || ''}
              onChange={(event) => updateParameter(parameter.id, { description: event.target.value || undefined })}
            />
          </label>
        </div>
      ))}
      <div className="flex gap-2">
        <button
          className="rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700"
          onClick={() => onChange([
            ...parameters,
            {
              id: createId('param'),
              name: 'parameter_name',
              label: 'Parameter Label',
              required: false,
            },
          ])}
        >
          Add Parameter
        </button>
        {parameters.length > 0 ? (
          <button
            className="rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700"
            onClick={() => onChange(parameters.slice(0, -1))}
          >
            Remove Last
          </button>
        ) : null}
      </div>
    </div>
  );
}

function createDefaultAgent(id: string): OrchestratorAgent {
  return {
    id,
    name: 'New Agent',
    role: 'executor',
    goal: 'Complete the assigned task.',
    executionMode: 'direct',
    allowSubAgents: false,
    tools: [],
    skills: [],
    inputSources: [],
    outputArtifacts: [],
    failurePolicy: 'pause',
  };
}

function StageDetailsEditor({
  stage,
  onChange,
}: {
  stage: OrchestratorStage | null;
  onChange: (patch: Partial<{ name: string; goal: string; description?: string }>) => void;
}) {
  if (!stage) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
        Select a stage to edit its details.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Stage Details</h2>
      <div className="mt-4 grid gap-4">
        <label className="block">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Stage Name</div>
          <input
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
            value={stage.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Goal</div>
          <textarea
            className="min-h-[96px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
            value={stage.goal}
            onChange={(event) => onChange({ goal: event.target.value })}
          />
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Description</div>
          <textarea
            className="min-h-[72px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500"
            value={stage.description || ''}
            onChange={(event) => onChange({ description: event.target.value || undefined })}
          />
        </label>
      </div>
    </section>
  );
}
