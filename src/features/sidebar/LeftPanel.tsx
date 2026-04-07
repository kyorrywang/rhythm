import { useEffect, useMemo, useRef, useState } from 'react';
import { openPath } from '@tauri-apps/plugin-opener';
import { Search } from 'lucide-react';
import { createPluginContext } from '@/plugin-host/createPluginContext';
import { PluginErrorBoundary } from '@/plugin-host/PluginErrorBoundary';
import { usePluginHostStore } from '@/plugin-host/usePluginHostStore';
import { DEFAULT_WORKSPACE_PATH, useActiveWorkspace, useWorkspaceStore } from '@/shared/state/useWorkspaceStore';
import { useSessions, useSessionStore } from '@/shared/state/useSessionStore';
import { useToast } from '@/shared/hooks/useToast';
import { ProjectHeader } from './ProjectHeader';
import { SessionItem } from './SessionItem';

export const LeftPanel = ({ width }: { width: number }) => {
  const workspace = useActiveWorkspace();
  const workspacePath = workspace.path;
  const sessions = useSessions();
  const removeWorkspace = useWorkspaceStore((state) => state.removeWorkspace);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const setActiveSession = useSessionStore((state) => state.setActiveSession);
  const leftPanelMode = useSessionStore((state) => state.leftPanelMode);
  const leftPanels = usePluginHostStore((state) => state.leftPanels);
  const toast = useToast();
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const pluginViewId = leftPanelMode.startsWith('plugin:') ? leftPanelMode.slice('plugin:'.length) : null;
  const pluginView = pluginViewId ? leftPanels[pluginViewId] : null;

  const workspaceSessions = sessions.filter((session) =>
    session.workspacePath === workspacePath ||
    (!session.workspacePath && workspacePath === DEFAULT_WORKSPACE_PATH)
  );
  const rootSessions = workspaceSessions.filter((session) => !session.parentId);
  const pinnedSessions = rootSessions.filter((session) => !session.archived && session.pinned);
  const regularSessions = rootSessions.filter((session) => !session.archived && !session.pinned);
  const archivedSessions = rootSessions.filter((session) => session.archived);
  const normalizedQuery = query.trim().toLowerCase();

  const filteredPinnedSessions = useMemo(
    () => pinnedSessions.filter((session) => matchesSession(session, normalizedQuery)),
    [pinnedSessions, normalizedQuery],
  );
  const filteredRegularSessions = useMemo(
    () => regularSessions.filter((session) => matchesSession(session, normalizedQuery)),
    [regularSessions, normalizedQuery],
  );
  const filteredArchivedSessions = useMemo(
    () => archivedSessions.filter((session) => matchesSession(session, normalizedQuery)),
    [archivedSessions, normalizedQuery],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'k' && leftPanelMode === 'sessions') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [leftPanelMode]);

  if (pluginView) {
    const View = pluginView.component;
    const pluginId = pluginView.pluginId || 'unknown';
    return (
      <PluginErrorBoundary pluginId={pluginId} surface={pluginView.id}>
        <View ctx={createPluginContext(pluginId)} width={width} />
      </PluginErrorBoundary>
    );
  }

  const handleNewSession = () => {
    setActiveSession(null);
  };

  const handleCopyWorkspacePath = async () => {
    await navigator.clipboard.writeText(workspacePath);
  };

  const handleOpenWorkspace = () => {
    void openPath(workspacePath);
  };

  const handleRemoveWorkspace = () => {
    removeWorkspace(workspace.id);
    setActiveSession(null);
    toast.info(`已从列表移除工作区：${workspace.name}`);
  };

  return (
    <div className="flex h-full shrink-0 flex-col bg-[#f8f7f3]" style={{ width }}>
      <ProjectHeader
        workspaceName={workspace.name}
        workspacePath={workspacePath}
        onNewSession={handleNewSession}
        onCopyWorkspacePath={handleCopyWorkspacePath}
        onOpenWorkspace={handleOpenWorkspace}
        onRemoveWorkspace={handleRemoveWorkspace}
      />

      <div className="px-4 pb-3">
        <PanelSearch
          inputRef={searchInputRef}
          value={query}
          onChange={setQuery}
          placeholder="搜索会话，快捷键 Ctrl+K"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {rootSessions.length === 0 ? (
          <div className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-transparent px-4 py-8 text-center">
            <div className="text-[13px] font-medium text-slate-600">
              暂无历史会话
            </div>
            <div className="mt-2 text-[12px] leading-5 text-slate-400">
              在右侧输入任意内容<br />新会话将自动出现于此
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPinnedSessions.length > 0 && (
              <SessionGroup title="置顶会话" count={filteredPinnedSessions.length}>
                {filteredPinnedSessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={session.id === activeSessionId}
                    onClick={() => setActiveSession(session.id)}
                  />
                ))}
              </SessionGroup>
            )}
            {filteredRegularSessions.length > 0 && (
              <SessionGroup title="最近会话" count={filteredRegularSessions.length}>
                {filteredRegularSessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={session.id === activeSessionId}
                    onClick={() => setActiveSession(session.id)}
                  />
                ))}
              </SessionGroup>
            )}
            {filteredArchivedSessions.length > 0 && (
              <SessionGroup title="已归档" count={filteredArchivedSessions.length}>
                {filteredArchivedSessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={session.id === activeSessionId}
                    onClick={() => setActiveSession(session.id)}
                  />
                ))}
              </SessionGroup>
            )}
            {normalizedQuery && filteredPinnedSessions.length + filteredRegularSessions.length + filteredArchivedSessions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                没有找到匹配的会话
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const PanelSearch = ({
  value,
  onChange,
  placeholder,
  inputRef,
}: {
  value?: string;
  onChange?: (value: string) => void;
  placeholder: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) => (
  <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 focus-within:border-amber-300">
    <Search size={15} className="text-slate-400" />
    <input
      ref={inputRef}
      value={value || ''}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder={placeholder}
      className="w-full bg-transparent outline-none placeholder:text-slate-400"
      readOnly={!onChange}
    />
  </label>
);

const SessionGroup = ({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) => (
  <div>
    <div className="mb-2 flex items-center justify-between px-1">
      <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{title}</span>
      <span className="text-[11px] text-slate-400">{count}</span>
    </div>
    <div className="space-y-1">{children}</div>
  </div>
);

function matchesSession(session: { title: string; id: string }, query: string) {
  if (!query) return true;
  return session.title.toLowerCase().includes(query) || session.id.toLowerCase().includes(query);
}
