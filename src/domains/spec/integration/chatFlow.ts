import type { Session } from '@/shared/types/schema';
import type { SpecDocumentId } from '../ui/helpers';
import {
  createSpecDraftInWorkspace,
  loadSpecWorkbenchState,
  saveEditableSpecDocumentsInWorkspace,
  startSpecRunInWorkspace,
} from './workbench';
import { buildSpecWorkbenchHref } from './navigation';

interface ApplySpecToolResultInput {
  workspacePath: string;
  session: Session | undefined;
  rawResult: string;
}

interface ApplySpecToolResultOutput {
  handled: boolean;
  toolMessage?: string;
  specSlug?: string;
  specTitle?: string;
}

interface ParsedSpecToolPayload {
  title?: string;
  goal?: string;
  overview?: string;
  slug?: string;
  change: string;
  plan: string;
  tasks: string;
  open?: SpecDocumentId;
}

export async function applySpecToolResult(
  input: ApplySpecToolResultInput,
): Promise<ApplySpecToolResultOutput> {
  const parsed = parseSpecToolResult(input.rawResult);
  if (!parsed) {
    return { handled: false };
  }

  if (parsed.action === 'create_spec') {
    const state = await createSpecDraftInWorkspace(input.workspacePath, {
        title: parsed.payload.title!,
        goal: parsed.payload.goal!,
        overview: parsed.payload.overview,
    });
    const loaded = await loadSpecWorkbenchState(input.workspacePath, state.change.slug);
    const nextState = await saveEditableSpecDocumentsInWorkspace(
      input.workspacePath,
      loaded.state,
      {
        change: parsed.payload.change,
        plan: parsed.payload.plan,
        tasks: parsed.payload.tasks,
      },
      loaded.timeline,
    );
    return {
      handled: true,
      specSlug: nextState.change.slug,
      specTitle: nextState.change.title,
      toolMessage: `Spec created: ${nextState.change.title}\nOpen: ${buildSpecWorkbenchHref(nextState.change.slug, parsed.payload.open || 'change')}`,
    };
  }

  if (parsed.action === 'update_spec') {
    const slug = parsed.payload.slug || findLatestSpecReference(input.session)?.slug;
    if (!slug) {
      return {
        handled: true,
        toolMessage: 'Spec update failed: no current spec slug.',
      };
    }
    const loaded = await loadSpecWorkbenchState(input.workspacePath, slug);
    const nextState = await saveEditableSpecDocumentsInWorkspace(
      input.workspacePath,
      loaded.state,
      {
        change: parsed.payload.change,
        plan: parsed.payload.plan,
        tasks: parsed.payload.tasks,
      },
      loaded.timeline,
    );
    return {
      handled: true,
      specSlug: nextState.change.slug,
      specTitle: nextState.change.title,
      toolMessage: `Spec updated: ${nextState.change.title}\nOpen: ${buildSpecWorkbenchHref(nextState.change.slug, parsed.payload.open || 'change')}`,
    };
  }

  const slug = parsed.payload.slug || findLatestSpecReference(input.session)?.slug;
  if (!slug) {
    return {
      handled: true,
      toolMessage: 'Spec start failed: no current spec slug.',
    };
  }
  const loaded = await loadSpecWorkbenchState(input.workspacePath, slug);
  const started = await startSpecRunInWorkspace(
    input.workspacePath,
    loaded.state,
    loaded.documents,
    loaded.timeline,
  );
  return {
    handled: true,
    specSlug: started.state.change.slug,
    specTitle: started.state.change.title,
    toolMessage: `Spec started: ${started.state.change.title}\nOpen: ${buildSpecWorkbenchHref(started.state.change.slug, parsed.payload.open || 'tasks')}`,
  };
}

function parseSpecToolResult(input: string) {
  const parsed = parseJsonObject(input) as
    | {
        kind?: string;
        action?: 'create_spec' | 'update_spec' | 'start_spec';
        payload?: Record<string, unknown>;
      }
    | null;
  if (!parsed || parsed.kind !== 'spec_tool_result' || !parsed.action || !parsed.payload) {
    return null;
  }
  const payload = normalizeSpecToolPayload(parsed.payload);
  if (parsed.action === 'create_spec' && (!payload.title || !payload.goal)) {
    return null;
  }
  if ((parsed.action === 'create_spec' || parsed.action === 'update_spec') && (!payload.change || !payload.plan || !payload.tasks)) {
    return null;
  }
  return {
    action: parsed.action,
    payload,
  };
}

function normalizeSpecToolPayload(payload: Record<string, unknown>) {
  return {
    title: readString(payload.title),
    goal: readString(payload.goal),
    overview: readString(payload.overview),
    slug: readString(payload.slug),
    change: readString(payload.change)
      ?? readNestedString(payload, 'documents', 'change')
      ?? '',
    plan: readString(payload.plan)
      ?? readNestedString(payload, 'documents', 'plan')
      ?? '',
    tasks: readString(payload.tasks)
      ?? readNestedString(payload, 'documents', 'tasks')
      ?? '',
    open: readDocumentId(payload.open),
  } satisfies ParsedSpecToolPayload;
}

function parseJsonObject(input: string) {
  const trimmed = input.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function readNestedString(value: Record<string, unknown>, parentKey: string, childKey: string) {
  const parent = value[parentKey];
  if (!parent || typeof parent !== 'object') {
    return undefined;
  }
  const record = parent as Record<string, unknown>;
  return readString(record[childKey]);
}

function readDocumentId(value: unknown): SpecDocumentId | undefined {
  return value === 'change' || value === 'plan' || value === 'tasks' || value === 'timeline'
    ? value
    : undefined;
}

function findLatestSpecReference(session: Session | undefined) {
  if (!session) return null;
  const textSegments = session.messages
    .flatMap((message) => collectMessageTexts(message))
    .reverse();

  for (const text of textSegments) {
    const match = text.match(/spec:\/\/([a-z0-9-]+)(?:\?doc=(change|plan|tasks|timeline))?/i)
      || text.match(/\.spec\/changes\/([a-z0-9-]+)/i);
    if (match) {
      return {
        slug: match[1],
        documentId: match[2] || 'change',
      };
    }
  }

  return null;
}

function collectMessageTexts(message: Session['messages'][number]) {
  if (message.role === 'user') {
    return [message.content || ''];
  }
  return (message.segments || [])
    .filter((segment): segment is { type: 'text'; content: string } => segment.type === 'text')
    .map((segment) => segment.content);
}
