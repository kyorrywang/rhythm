import { useEffect, useMemo, useState, startTransition } from 'react';
import {
  CheckCircle2,
  LoaderCircle,
  Pause,
  Play,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { WorkbenchProps } from '@/core/plugin/sdk';
import { useActiveWorkspace } from '@/core/workspace/useWorkspaceStore';
import { useSessionStore } from '@/core/sessions/useSessionStore';
import {
  ActionBar,
  Button,
  EmptyState,
  Input,
  Textarea,
  WorkbenchPage,
  WorkbenchSection,
} from '@/ui/components';
import { themeRecipes } from '@/ui/theme/recipes';
import type { SpecState, SpecTimelineEvent } from '../domain/types';
import {
  canResumeSpecFromUi,
  canStartSpecFromUi,
  isSpecEditableStatus,
  type SpecDocumentBundle,
  type SpecDocumentId,
  type SpecWorkbenchPayload,
} from './helpers';
import {
  approveSpecHumanTaskInWorkspace,
  createSpecDraftInWorkspace,
  loadSpecWorkbenchState,
  pauseSpecRunInWorkspace,
  renderSpecDocuments,
  resumeSpecRunInWorkspace,
  retrySpecTaskInWorkspace,
  saveEditableSpecDocumentsInWorkspace,
  startSpecRunInWorkspace,
  syncSpecWorkbenchFromDisk,
} from '../integration/workbench';
import { buildSpecWorkbenchOpenInput } from '../integration/navigation';
import { SpecStatusHeader } from './SpecStatusHeader';
import { SpecDocumentTabs } from './SpecDocumentTabs';
import { SpecLiveDocument } from './SpecLiveDocument';
import { SpecTimelineView } from './SpecTimelineView';
import { SpecRunSnapshot } from './SpecRunSnapshot';

export function SpecWorkbench({ payload }: WorkbenchProps<SpecWorkbenchPayload>) {
  const workbenchPayload = payload || {};
  const workspace = useActiveWorkspace();
  const openWorkbench = useSessionStore((state) => state.openWorkbench);
  const [isLoading, setIsLoading] = useState(workbenchPayload.mode !== 'create');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<SpecState | null>(null);
  const [documents, setDocuments] = useState<SpecDocumentBundle>({ change: '', plan: '', tasks: '' });
  const [timelineText, setTimelineText] = useState('');
  const [activeDocument, setActiveDocument] = useState<SpecDocumentId>(workbenchPayload.documentId || 'change');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftGoal, setDraftGoal] = useState('');
  const [draftOverview, setDraftOverview] = useState('');

  useEffect(() => {
    if (workbenchPayload.mode === 'create' && !workbenchPayload.slug) {
      setIsLoading(false);
      setState(null);
      setDocuments({ change: '', plan: '', tasks: '' });
      setTimelineText('');
      setActiveDocument('change');
      return;
    }

    if (!workbenchPayload.slug) {
      return;
    }

    const slug = workbenchPayload.slug;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    startTransition(() => {
      void loadSpecWorkbenchState(workspace.path, slug)
        .then((loaded) => {
          if (cancelled) return;
          setState(loaded.state);
          setDocuments(loaded.documents);
          setTimelineText(loaded.timeline.map((event) => JSON.stringify(event)).join('\n'));
          setActiveDocument(workbenchPayload.documentId || getDefaultDocumentId(loaded.state));
        })
        .catch((loadError) => {
          if (!cancelled) {
            setError(loadError instanceof Error ? loadError.message : String(loadError));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [workspace.path, workbenchPayload.documentId, workbenchPayload.mode, workbenchPayload.slug]);

  const editable = state ? isSpecEditableStatus(state.change.status) : true;
  const liveDocumentBundle = useMemo(() => (state ? renderSpecDocuments(state) : documents), [documents, state]);

  const currentDocumentValue = activeDocument === 'timeline' ? timelineText : documents[activeDocument];
  const renderedLiveValue = activeDocument === 'timeline'
    ? timelineText
    : liveDocumentBundle[activeDocument];

  const timelineEvents = useMemo<SpecTimelineEvent[]>(
    () =>
      timelineText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as SpecTimelineEvent;
          } catch {
            return null;
          }
        })
        .filter((event): event is SpecTimelineEvent => Boolean(event)),
    [timelineText],
  );

  const updateFromTransition = (next: {
    state: SpecState;
    documents: SpecDocumentBundle;
    timeline: SpecTimelineEvent[];
  }) => {
    setState(next.state);
    setDocuments(next.documents);
    setTimelineText(next.timeline.map((event) => JSON.stringify(event)).join('\n'));
  };

  const withSaving = async (operation: () => Promise<void>) => {
    setIsSaving(true);
    setError(null);
    try {
      await operation();
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : String(operationError));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateDraft = async () => {
    if (!draftTitle.trim() || !draftGoal.trim()) {
      setError('Title and goal are required to create a spec.');
      return;
    }

    await withSaving(async () => {
      const draftState = await createSpecDraftInWorkspace(workspace.path, {
        title: draftTitle,
        goal: draftGoal,
        overview: draftOverview,
      });

      openWorkbench(buildSpecWorkbenchOpenInput(
        { slug: draftState.change.slug, mode: 'browse', documentId: 'change' },
        { title: draftState.change.title, description: 'Draft', layoutMode: 'split' },
      ));
    });
  };

  const handleDocumentChange = (value: string) => {
    if (activeDocument === 'timeline') return;
    setDocuments((current) => ({
      ...current,
      [activeDocument]: value,
    }));
  };

  const handleSaveDraft = async () => {
    if (!state) return;
    await withSaving(async () => {
      const nextState = await saveEditableSpecDocumentsInWorkspace(workspace.path, state, documents, timelineEvents);
      setState(nextState);
      setDocuments(renderSpecDocuments(nextState));
    });
  };

  const handleSyncFromDisk = async () => {
    if (!workbenchPayload.slug) return;
    await withSaving(async () => {
      const loaded = await syncSpecWorkbenchFromDisk(workspace.path, workbenchPayload.slug!);
      setState(loaded.state);
      setDocuments(loaded.documents);
      setTimelineText(loaded.timeline.map((event) => JSON.stringify(event)).join('\n'));
    });
  };

  if (isLoading) {
    return (
      <WorkbenchPage icon={<LoaderCircle size={18} className="animate-spin" />} eyebrow="Spec" title="Loading Spec">
        <EmptyState title="Loading spec change" description="Reading markdown documents and state from the workspace." />
      </WorkbenchPage>
    );
  }

  if (error && !state && workbenchPayload.mode !== 'create') {
    return (
      <WorkbenchPage icon={<Sparkles size={18} />} eyebrow="Spec" title="Spec Unavailable">
        <EmptyState title="Could not open this spec" description={error} />
      </WorkbenchPage>
    );
  }

  if (workbenchPayload.mode === 'create' && !state) {
    return (
      <WorkbenchPage
        icon={<Sparkles size={18} />}
        eyebrow="Spec"
        title="New Spec"
        description="Seed the first markdown documents, then keep working in md until the run starts."
        actions={<Button onClick={handleCreateDraft} isLoading={isSaving}>Create Draft</Button>}
      >
        <WorkbenchSection title="Create Change" description="This seeds change.md, plan.md, tasks.md, state.json, and timeline.jsonl.">
          <div className="grid gap-4">
            <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Add login rate limit" />
            <Textarea value={draftGoal} onChange={(event) => setDraftGoal(event.target.value)} placeholder="Describe what the change must accomplish." />
            <Textarea value={draftOverview} onChange={(event) => setDraftOverview(event.target.value)} placeholder="Optional context, scope, and why this matters." />
            {error ? <div className={`text-sm ${themeRecipes.description()}`}>{error}</div> : null}
          </div>
        </WorkbenchSection>
      </WorkbenchPage>
    );
  }

  if (!state) {
    return null;
  }

  const latestRun = state.runs[state.runs.length - 1] || null;
  const latestReview = state.reviews[state.reviews.length - 1] || null;
  const pendingHumanTask = latestRun?.pendingHumanAction?.taskId
    ? state.tasks.find((task) => task.id === latestRun.pendingHumanAction?.taskId) || null
    : null;
  const failedTask = latestRun?.failureState?.taskId
    ? state.tasks.find((task) => task.id === latestRun.failureState?.taskId) || null
    : null;

  return (
    <WorkbenchPage
      icon={<Sparkles size={18} />}
      eyebrow="Spec"
      title={state.change.title}
      description={state.change.goal}
      actions={null}
    >
      <SpecStatusHeader
        state={state}
        latestRun={latestRun}
        pendingHumanTask={pendingHumanTask}
        failedTask={failedTask}
        latestReview={latestReview}
        isSaving={isSaving}
        onSync={handleSyncFromDisk}
      />

      <ActionBar
        leading={<SpecDocumentTabs activeDocument={activeDocument} onChange={setActiveDocument} />}
        trailing={(
          <div className="flex flex-wrap items-center gap-2">
            {editable ? (
              <>
                <Button variant="secondary" size="sm" onClick={handleSaveDraft} isLoading={isSaving}>
                  Save Markdown
                </Button>
                {canResumeSpecFromUi(state) ? (
                  <Button
                    size="sm"
                    onClick={() => void withSaving(async () => {
                      const next = await resumeSpecRunInWorkspace(workspace.path, state, timelineEvents);
                      updateFromTransition(next);
                    })}
                  >
                    <Play size={14} />
                    Resume
                  </Button>
                ) : null}
                {canStartSpecFromUi(state) && !canResumeSpecFromUi(state) ? (
                  <Button
                    size="sm"
                    onClick={() => void withSaving(async () => {
                      const next = await startSpecRunInWorkspace(workspace.path, state, documents, timelineEvents);
                      updateFromTransition(next);
                    })}
                  >
                    <Play size={14} />
                    Run
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                {state.change.status === 'running' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void withSaving(async () => {
                      const next = await pauseSpecRunInWorkspace(workspace.path, state, timelineEvents);
                      updateFromTransition(next);
                    })}
                  >
                    <Pause size={14} />
                    Pause
                  </Button>
                ) : null}
                {state.change.status === 'paused' ? (
                  <Button
                    size="sm"
                    onClick={() => void withSaving(async () => {
                      const next = await resumeSpecRunInWorkspace(workspace.path, state, timelineEvents);
                      updateFromTransition(next);
                    })}
                  >
                    <Play size={14} />
                    Resume
                  </Button>
                ) : null}
                {state.change.status === 'waiting_human' ? (
                  <Button
                    size="sm"
                    onClick={() => void withSaving(async () => {
                      const next = await approveSpecHumanTaskInWorkspace(workspace.path, state, timelineEvents);
                      updateFromTransition(next);
                    })}
                  >
                    <ShieldCheck size={14} />
                    Approve
                  </Button>
                ) : null}
                {state.change.status === 'failed' || failedTask ? (
                  <Button
                    size="sm"
                    onClick={() => void withSaving(async () => {
                      const next = await retrySpecTaskInWorkspace(workspace.path, state, timelineEvents);
                      updateFromTransition(next);
                    })}
                  >
                    <RefreshCcw size={14} />
                    Retry
                  </Button>
                ) : null}
              </>
            )}
          </div>
        )}
      />

      <WorkbenchSection
        title={editable ? 'Markdown Editor' : 'Live Spec Document'}
        description={
          editable
            ? 'Edit the markdown directly while the change is still in a planning state.'
            : 'The run is live, so the document surface becomes a read-only execution view.'
        }
      >
        {editable && activeDocument !== 'timeline' ? (
          <Textarea
            className="min-h-[65vh] font-mono text-[13px] leading-6"
            value={currentDocumentValue}
            onChange={(event) => handleDocumentChange(event.target.value)}
          />
        ) : (
          activeDocument === 'timeline'
            ? <SpecTimelineView events={timelineEvents} />
            : <SpecLiveDocument markdown={renderedLiveValue} />
        )}
      </WorkbenchSection>

      <SpecRunSnapshot
        currentTaskTitle={state.metrics.tasks.currentTaskTitle}
        latestRun={latestRun}
        pendingHumanTask={pendingHumanTask}
        failedTask={failedTask}
        latestReview={latestReview}
        waitingReviewCount={state.metrics.tasks.waitingReview}
      />

      {error ? (
        <WorkbenchSection title="Last Error" description="The last UI-side save or sync issue.">
          <div className={`rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] border-[var(--theme-danger-border)] bg-[var(--theme-danger-surface)] px-4 py-3 text-sm ${themeRecipes.description()}`}>
            {error}
          </div>
        </WorkbenchSection>
      ) : null}

      {state.change.status === 'completed' ? (
        <WorkbenchSection title="Completed" description="The change reached a settled state and the document surface is now archival.">
          <div className="flex items-center gap-2 text-sm text-[var(--theme-text-primary)]">
            <CheckCircle2 size={16} />
            This spec is complete. The markdown remains the primary record.
          </div>
          {latestReview ? (
            <div className={`mt-3 text-sm ${themeRecipes.description()}`}>
              Final review: {latestReview.summary}
            </div>
          ) : null}
        </WorkbenchSection>
      ) : null}
    </WorkbenchPage>
  );
}

function getDefaultDocumentId(state: SpecState): SpecDocumentId {
  if (['running', 'waiting_review', 'waiting_human', 'failed', 'completed'].includes(state.change.status)) {
    return 'tasks';
  }
  return 'change';
}
