import fs from 'node:fs/promises';
import { getSpecChangePaths, getSpecChangesDir, makeSpecChangeSlug } from './changeFs';
import type { SpecChangeScaffoldInput, SpecRuntimeContext } from '../domain/contracts';
import { buildInitialSpecState, refreshDerivedSpecState, renderSpecFilesFromState } from './stateSync';
import type { SpecState, SpecTimelineEvent } from '../domain/types';

const fileLocks = new Map<string, Promise<unknown>>();

async function withFileLock<T>(key: string, operation: () => Promise<T>) {
  const previous = fileLocks.get(key) || Promise.resolve();
  let release: (() => void) | null = null;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  fileLocks.set(key, previous.finally(() => current));
  await previous;
  try {
    return await operation();
  } finally {
    release?.();
    if (fileLocks.get(key) === current) {
      fileLocks.delete(key);
    }
  }
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJsonFile<T>(filePath: string, fallback: T) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function listSpecChangeSlugs(workspacePath: string) {
  try {
    const entries = await fs.readdir(getSpecChangesDir(workspacePath), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

export async function loadSpecState(workspacePath: string, slug: string) {
  const paths = getSpecChangePaths(workspacePath, slug);
  return readJsonFile<SpecState | null>(paths.stateFile, null);
}

export async function saveSpecState(workspacePath: string, slug: string, state: SpecState) {
  const paths = getSpecChangePaths(workspacePath, slug);
  await ensureDir(paths.changeDir);
  await fs.writeFile(paths.stateFile, JSON.stringify(state, null, 2), 'utf8');
}

export async function appendSpecTimelineEvent(workspacePath: string, slug: string, event: SpecTimelineEvent) {
  const paths = getSpecChangePaths(workspacePath, slug);
  await ensureDir(paths.changeDir);
  await fs.appendFile(paths.timelineFile, `${JSON.stringify(event)}\n`, 'utf8');
}

export async function saveSpecMarkdownFiles(workspacePath: string, slug: string, state: SpecState) {
  const paths = getSpecChangePaths(workspacePath, slug);
  const rendered = renderSpecFilesFromState(state);
  await ensureDir(paths.artifactsDir);
  await ensureDir(paths.reviewsDir);
  await ensureDir(paths.runsDir);
  await fs.writeFile(paths.changeFile, rendered.change, 'utf8');
  await fs.writeFile(paths.planFile, rendered.plan, 'utf8');
  await fs.writeFile(paths.tasksFile, rendered.tasks, 'utf8');
}

export async function createSpecChange(workspacePath: string, input: SpecChangeScaffoldInput) {
  const initialState = buildInitialSpecState(input);
  const slug = makeSpecChangeSlug(input.title);
  const state = refreshDerivedSpecState({
    ...initialState,
    change: {
      ...initialState.change,
      slug,
    },
  });
  const paths = getSpecChangePaths(workspacePath, slug);
  await ensureDir(paths.changeDir);
  await saveSpecState(workspacePath, slug, state);
  await saveSpecMarkdownFiles(workspacePath, slug, state);
  await appendSpecTimelineEvent(workspacePath, slug, {
    id: `evt_${Date.now().toString(36)}`,
    changeId: state.change.id,
    runId: state.change.currentRunId || undefined,
    type: 'change.created',
    title: 'Change created',
    detail: 'Initial spec scaffold created.',
    createdAt: Date.now(),
  });
  return { slug, state, paths };
}

export async function updateSpecState(
  ctx: SpecRuntimeContext,
  slug: string,
  updater: (current: SpecState) => SpecState,
) {
  return withFileLock(`${ctx.workspacePath}:${slug}:state`, async () => {
    const current = await loadSpecState(ctx.workspacePath, slug);
    if (!current) {
      throw new Error(`Spec change not found: ${slug}`);
    }
    const next = refreshDerivedSpecState(updater(current));
    await saveSpecState(ctx.workspacePath, slug, next);
    await saveSpecMarkdownFiles(ctx.workspacePath, slug, next);
    return next;
  });
}

export async function listSpecStates(workspacePath: string) {
  const slugs = await listSpecChangeSlugs(workspacePath);
  const states = await Promise.all(slugs.map((slug) => loadSpecState(workspacePath, slug)));
  return states.filter((state): state is SpecState => Boolean(state));
}
