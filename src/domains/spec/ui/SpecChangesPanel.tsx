import { useEffect, useMemo, useState, startTransition } from 'react';
import { AlertTriangle, FileText, LoaderCircle, Plus, ScrollText } from 'lucide-react';
import { listWorkspaceDir, readWorkspaceTextFile } from '@/core/runtime/api/commands';
import { useActiveWorkspace } from '@/core/workspace/useWorkspaceStore';
import { useSessionStore } from '@/core/sessions/useSessionStore';
import type { LeftPanelProps } from '@/core/plugin/sdk';
import { Badge, Button, Card, EmptyState, FilterBar, SearchField, SidebarHeader, SidebarPage } from '@/ui/components';
import { themeRecipes } from '@/ui/theme/recipes';
import type { SpecState } from '../domain/types';
import { badgeToneForSpecStatus, describeSpecStatus } from './helpers';
import { buildSpecWorkbenchOpenInput } from '../integration/navigation';

interface SpecListItem {
  slug: string;
  state: SpecState;
}

export function SpecChangesPanel({ width }: LeftPanelProps) {
  const workspace = useActiveWorkspace();
  const openWorkbench = useSessionStore((state) => state.openWorkbench);
  const [items, setItems] = useState<SpecListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'attention' | 'done'>('all');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    startTransition(() => {
      void loadSpecChanges(workspace.path)
        .then((nextItems) => {
          if (!cancelled) {
            setItems(nextItems);
          }
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
  }, [workspace.path]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = normalizedSearch.length === 0
        || item.state.title.toLowerCase().includes(normalizedSearch)
        || item.state.goal.toLowerCase().includes(normalizedSearch)
        || item.state.overview.toLowerCase().includes(normalizedSearch);

      const needsAttention = item.state.status === 'active';
      const isActive = item.state.status === 'active';
      const isDone = item.state.status === 'done';

      const matchesFilter = statusFilter === 'all'
        || (statusFilter === 'attention' && needsAttention)
        || (statusFilter === 'active' && isActive)
        || (statusFilter === 'done' && isDone);

      return matchesSearch && matchesFilter;
    });
  }, [items, search, statusFilter]);

  const groupedItems = useMemo(() => {
    const attention = filteredItems.filter((item) => item.state.status === 'active');
    const active = filteredItems.filter((item) => item.state.status === 'draft');
    const done = filteredItems.filter((item) => item.state.status === 'done');
    return [
      { key: 'attention', title: '需要关注', items: attention },
      { key: 'active', title: '活跃变更', items: active },
      { key: 'done', title: '已完成', items: done },
    ].filter((group) => group.items.length > 0);
  }, [filteredItems]);

  const handleOpenCreate = () => {
    openWorkbench(buildSpecWorkbenchOpenInput(
      { slug: '', mode: 'create' },
      { title: 'New Spec', description: 'Create a new spec change draft.', layoutMode: 'split' },
    ));
  };

  const handleOpenChange = (item: SpecListItem) => {
    openWorkbench(buildSpecWorkbenchOpenInput(
      { slug: item.slug, mode: 'browse' },
      { title: item.state.title, description: describeSpecStatus(item.state.status), layoutMode: 'split' },
    ));
  };

  return (
    <SidebarPage width={width}>
      <SidebarHeader
        icon={<ScrollText size={14} />}
        title="Spec"
        subtitle="Changes, plans, tasks, and live execution stay in one document-driven flow."
        actions={
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus size={14} />
            New
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto px-[var(--theme-panel-padding-x)] pb-[var(--theme-panel-padding-y)]">
        {isLoading ? (
          <div className={`flex items-center gap-2 text-sm ${themeRecipes.description()}`}>
            <LoaderCircle size={16} className="animate-spin" />
            Loading spec changes...
          </div>
        ) : error ? (
          <EmptyState title="Could not load spec changes" description={error} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FileText size={18} />}
            title="No spec changes yet"
            description="Create the first change, then drive everything from markdown in the workbench."
            action={<Button onClick={handleOpenCreate}>Create Spec</Button>}
          />
        ) : (
          <div className="space-y-4">
            <FilterBar
              search={<SearchField value={search} onChange={setSearch} placeholder="Search changes" />}
              filters={(
                <div className="flex flex-wrap items-center gap-2">
                  {([
                    ['all', 'All'],
                    ['attention', 'Attention'],
                    ['active', 'Active'],
                    ['done', 'Done'],
                  ] as const).map(([value, label]) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={statusFilter === value ? 'primary' : 'ghost'}
                      onClick={() => setStatusFilter(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              )}
            />

            {groupedItems.length === 0 ? (
              <EmptyState title="No matching changes" description="Adjust the filter or create a new spec change." />
            ) : (
              groupedItems.map((group) => (
                <div key={group.key} className="space-y-2">
                  <div className={themeRecipes.eyebrow()}>{group.title}</div>
                  <div className="space-y-3">
                    {group.items.map((item) => (
                      <button
                        key={item.slug}
                        type="button"
                        onClick={() => handleOpenChange(item)}
                        className="w-full text-left"
                      >
                        <Card className="transition-colors hover:border-[var(--theme-text-secondary)]">
                          <div className="min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className={`truncate font-medium ${themeRecipes.listRowTitle(false)}`}>{item.state.title}</div>
                              {item.state.status === 'active' ? (
                                <AlertTriangle size={14} className="mt-1 text-[var(--theme-warning-text)]" />
                              ) : null}
                            </div>
                            <div className={`mt-1 text-sm leading-6 ${themeRecipes.description()}`}>
                              {item.state.overview || item.state.goal}
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Badge tone={badgeToneForSpecStatus(item.state.status)}>
                                {describeSpecStatus(item.state.status)}
                              </Badge>
                              <Badge tone="muted">
                                {item.state.progress.done}/{item.state.progress.total || 0} 任务
                              </Badge>
                            </div>
                          </div>
                        </Card>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </SidebarPage>
  );
}

async function loadSpecChanges(workspacePath: string) {
  const listing = await listWorkspaceDir(workspacePath, '.spec/changes').catch(() => ({ entries: [] as Array<{ kind: string; path: string }> }));
  const slugs = listing.entries
    .filter((entry) => entry.kind === 'directory')
    .map((entry) => entry.path.split('/').filter(Boolean).pop() || '')
    .filter(Boolean);

  const states = await Promise.all(slugs.map(async (slug) => {
    const stateFile = await readWorkspaceTextFile(workspacePath, `.spec/changes/${slug}/state.json`).catch(() => null);
    if (!stateFile?.content) return null;
    try {
      return { slug, state: JSON.parse(stateFile.content) as SpecState };
    } catch {
      return null;
    }
  }));

  return states
    .filter((item): item is SpecListItem => Boolean(item))
    .sort((a, b) => b.state.updatedAt - a.state.updatedAt);
}
