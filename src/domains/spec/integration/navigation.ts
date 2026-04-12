// 简化的 navigation
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

export function buildSpecWorkbenchHref(slug: string) {
  return `spec://${slug}`;
}

export function parseSpecWorkbenchHref(href?: string | null): { slug: string } | null {
  if (!href) return null;

  if (href.startsWith('spec://')) {
    try {
      const slug = href.replace('spec://', '').split('?')[0];
      if (!slug) return null;
      return { slug };
    } catch {
      return null;
    }
  }

  const pathMatch = href.match(/(?:^|\/)\.spec\/changes\/([a-z0-9-]+)(?:\/(change|tasks)\.md)?$/i);
  if (!pathMatch) return null;
  return { slug: pathMatch[1] };
}

export function buildSpecWorkbenchOpenInput(
  payload: { slug: string; mode?: string },
  options?: {
    title?: string;
    description?: string;
    layoutMode?: 'split' | 'replace';
  },
): OpenWorkbenchInput {
  const slug = payload.slug;
  const title = options?.title || (slug ? `Spec: ${slug}` : 'Spec');
  const description = options?.description || '文档驱动的单任务执行模式';

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
