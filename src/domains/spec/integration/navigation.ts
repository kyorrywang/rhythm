import type { SpecDocumentId, SpecWorkbenchPayload } from '../ui/helpers';

interface OpenWorkbenchInput {
  id?: string;
  pluginId: string;
  viewType: string;
  renderer: string;
  title: string;
  description?: string;
  payload?: unknown;
  lifecycle?: 'snapshot' | 'live';
  layoutMode?: 'split' | 'replace';
  isOpen: boolean;
}

export function buildSpecWorkbenchHref(slug: string, documentId: SpecDocumentId = 'change') {
  return `spec://${slug}?doc=${documentId}`;
}

export function parseSpecWorkbenchHref(href?: string | null): SpecWorkbenchPayload | null {
  if (!href) return null;

  if (href.startsWith('spec://')) {
    try {
      const parsed = new URL(href);
      const slug = parsed.hostname || parsed.pathname.replace(/^\/+/, '');
      if (!slug) return null;
      const doc = parsed.searchParams.get('doc');
      return {
        slug,
        mode: 'browse',
        documentId: isSpecDocumentId(doc) ? doc : 'change',
      };
    } catch {
      return null;
    }
  }

  const pathMatch = href.match(/(?:^|\/)\.spec\/changes\/([a-z0-9-]+)(?:\/(change|plan|tasks)\.md|\/timeline\.jsonl)?$/i);
  if (!pathMatch) return null;
  const [, slug, docFromPath] = pathMatch;
  return {
    slug,
    mode: 'browse',
    documentId: isSpecDocumentId(docFromPath) ? docFromPath : docFromPath === 'timeline' ? 'timeline' : 'change',
  };
}

export function buildSpecWorkbenchOpenInput(
  payload: SpecWorkbenchPayload,
  options?: {
    title?: string;
    description?: string;
    layoutMode?: 'split' | 'replace';
  },
): OpenWorkbenchInput {
  const slug = payload.slug;
  const title = options?.title || (slug ? `Spec: ${slug}` : 'Spec');
  const description = options?.description || (payload.mode === 'create' ? 'Create a new spec change draft.' : 'Open spec in split view.');

  return {
    id: slug ? `core:spec:${slug}` : 'core:spec:new',
    pluginId: 'core',
    viewType: 'core.spec.workbench',
    renderer: 'core.spec.workbench',
    title,
    description,
    payload,
    lifecycle: 'live',
    layoutMode: options?.layoutMode || 'split',
    isOpen: true,
  };
}

function isSpecDocumentId(value: string | null | undefined): value is SpecDocumentId {
  return value === 'change' || value === 'plan' || value === 'tasks' || value === 'timeline';
}
