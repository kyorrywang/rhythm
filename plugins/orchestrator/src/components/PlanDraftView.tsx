import { useEffect, useState } from 'react';
import type { WorkbenchProps } from '../../../../src/plugin/sdk';
import { ORCHESTRATOR_COMMANDS, ORCHESTRATOR_EVENTS, ORCHESTRATOR_VIEWS } from '../constants';
import { getPlanDraft } from '../storage';
import type { OrchestratorPlanDraft, OrchestratorPlanDraftPayload, OrchestratorRun } from '../types';
import { createId, formatDateTime } from '../utils';

export function PlanDraftView({ ctx, payload }: WorkbenchProps<OrchestratorPlanDraftPayload>) {
  const [planDraft, setPlanDraft] = useState(payload.planDraft);
  const [draft, setDraft] = useState(payload.planDraft);

  useEffect(() => {
    setPlanDraft(payload.planDraft);
    setDraft(payload.planDraft);
  }, [payload.planDraft]);

  useEffect(() => {
    void refresh();
    const subscription = ctx.events.on(ORCHESTRATOR_EVENTS.planDraftsChanged, (event) => {
      const planDraftId = (event as { planDraftId?: string } | undefined)?.planDraftId;
      if (!planDraftId || planDraftId === payload.planDraft.id) {
        void refresh();
      }
    });
    return () => {
      subscription.dispose();
    };
  }, [ctx, payload.planDraft.id]);

  async function refresh() {
    const latest = await getPlanDraft(ctx, payload.planDraft.id);
    if (!latest) return;
    setPlanDraft(latest);
    setDraft(latest);
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(planDraft);

  async function saveDraft() {
    const next = await ctx.commands.execute<unknown, OrchestratorPlanDraft>(ORCHESTRATOR_COMMANDS.updatePlanDraft, {
      planDraftId: planDraft.id,
      patch: {
        title: draft.title,
        goal: draft.goal,
        overview: draft.overview,
        constraints: draft.constraints,
        successCriteria: draft.successCriteria,
        reviewPolicy: draft.reviewPolicy,
        stages: draft.stages,
      },
    });
    setPlanDraft(next);
    setDraft(next);
  }

  async function confirmPlan() {
    if (isDirty) {
      await saveDraft();
    }
    const run = await ctx.commands.execute<unknown, OrchestratorRun>(ORCHESTRATOR_COMMANDS.confirmPlanDraft, {
      planDraftId: planDraft.id,
    });
    if (run) {
      ctx.ui.workbench.open({
        id: `orchestrator.run:${run.id}`,
        viewId: ORCHESTRATOR_VIEWS.run,
        title: run.goal,
        description: run.planTitle,
        payload: { run },
        layoutMode: 'replace',
      });
    }
  }

  return (
    <div className="h-full overflow-auto bg-white px-6 py-5 text-sm text-slate-700">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{planDraft.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Plan Draft · {planDraft.status} · updated {formatDateTime(planDraft.updatedAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!isDirty}
              onClick={() => void saveDraft()}
            >
              Save Draft
            </button>
            <button
              className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={planDraft.status === 'confirmed'}
              onClick={() => void confirmPlan()}
            >
              Confirm And Start Run
            </button>
          </div>
        </div>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="block">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Title</div>
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            />
          </label>
          <label className="block">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Goal</div>
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={draft.goal}
              onChange={(event) => setDraft((current) => ({ ...current, goal: event.target.value }))}
            />
          </label>
        </section>

        <section className="mt-6">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Overview</div>
          <textarea
            className="min-h-[140px] w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm text-slate-900"
            value={draft.overview}
            onChange={(event) => setDraft((current) => ({ ...current, overview: event.target.value }))}
          />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <StringListEditor
            label="Constraints"
            values={draft.constraints}
            onChange={(values) => setDraft((current) => ({ ...current, constraints: values }))}
          />
          <StringListEditor
            label="Success Criteria"
            values={draft.successCriteria}
            onChange={(values) => setDraft((current) => ({ ...current, successCriteria: values }))}
          />
        </section>

        <section className="mt-6">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Review Policy</div>
          <textarea
            className="min-h-[120px] w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm text-slate-900"
            value={draft.reviewPolicy}
            onChange={(event) => setDraft((current) => ({ ...current, reviewPolicy: event.target.value }))}
          />
        </section>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">Plan Stages</h2>
            <button
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              onClick={() => setDraft((current) => ({
                ...current,
                stages: [
                  ...current.stages,
                  {
                    id: createId('plan_stage'),
                    name: `Stage ${current.stages.length + 1}`,
                    goal: 'Describe the objective of this stage.',
                    deliverables: [],
                  },
                ],
              }))}
            >
              Add Stage
            </button>
          </div>
          <div className="space-y-4">
            {draft.stages.map((stage, index) => (
              <article key={stage.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="block">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Stage Name</div>
                    <input
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                      value={stage.name}
                      onChange={(event) => updateStage(index, { name: event.target.value })}
                    />
                  </label>
                  <div className="flex items-end justify-end gap-2">
                    <button
                      className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      onClick={() => moveStage(index, -1)}
                      disabled={index === 0}
                    >
                      Move Up
                    </button>
                    <button
                      className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                      onClick={() => moveStage(index, 1)}
                      disabled={index === draft.stages.length - 1}
                    >
                      Move Down
                    </button>
                    <button
                      className="rounded border border-rose-300 bg-white px-3 py-2 text-sm text-rose-700"
                      onClick={() => setDraft((current) => ({
                        ...current,
                        stages: current.stages.filter((item) => item.id !== stage.id),
                      }))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Stage Goal</div>
                  <textarea
                    className="min-h-[96px] w-full rounded-xl border border-slate-300 px-3 py-3 text-sm text-slate-900"
                    value={stage.goal}
                    onChange={(event) => updateStage(index, { goal: event.target.value })}
                  />
                </div>
                <div className="mt-4">
                  <StringListEditor
                    label="Deliverables"
                    values={stage.deliverables}
                    onChange={(values) => updateStage(index, { deliverables: values })}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  function updateStage(index: number, patch: Partial<OrchestratorPlanDraft['stages'][number]>) {
    setDraft((current) => ({
      ...current,
      stages: current.stages.map((stage, currentIndex) => (
        currentIndex === index ? { ...stage, ...patch } : stage
      )),
    }));
  }

  function moveStage(index: number, offset: number) {
    setDraft((current) => {
      const targetIndex = index + offset;
      if (targetIndex < 0 || targetIndex >= current.stages.length) return current;
      const nextStages = [...current.stages];
      const [removed] = nextStages.splice(index, 1);
      nextStages.splice(targetIndex, 0, removed);
      return { ...current, stages: nextStages };
    });
  }
}

function StringListEditor({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <button
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          onClick={() => onChange([...values, ''])}
        >
          Add
        </button>
      </div>
      <div className="space-y-2">
        {values.map((value, index) => (
          <div key={`${label}-${index}`} className="flex items-center gap-2">
            <input
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={value}
              onChange={(event) => onChange(values.map((item, currentIndex) => (
                currentIndex === index ? event.target.value : item
              )))}
            />
            <button
              className="rounded border border-rose-300 bg-white px-3 py-2 text-sm text-rose-700"
              onClick={() => onChange(values.filter((_, currentIndex) => currentIndex !== index))}
            >
              Remove
            </button>
          </div>
        ))}
        {values.length === 0 ? (
          <div className="text-xs text-slate-400">Nothing yet.</div>
        ) : null}
      </div>
    </div>
  );
}
