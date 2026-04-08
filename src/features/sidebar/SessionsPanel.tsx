import { openPath } from '@tauri-apps/plugin-opener';
import { DEFAULT_WORKSPACE_PATH, useActiveWorkspace, useWorkspaceStore } from '@/shared/state/useWorkspaceStore';
import { useSessions, useSessionStore } from '@/shared/state/useSessionStore';
import { useToast } from '@/shared/hooks/useToast';
import { themeRecipes } from '@/shared/theme/recipes';
import { EmptyState, SidebarPage } from '@/shared/ui';
import { ProjectHeader } from './ProjectHeader';
import { SessionItem } from './SessionItem';

export const SessionsPanel = ({ width }: { width: number }) => {
  const workspace = useActiveWorkspace();
  const workspacePath = workspace.path;
  const sessions = useSessions();
  const removeWorkspace = useWorkspaceStore((state) => state.removeWorkspace);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const setActiveSession = useSessionStore((state) => state.setActiveSession);
  const closeWorkbench = useSessionStore((state) => state.closeWorkbench);
  const toast = useToast();

  const workspaceSessions = sessions.filter((session) =>
    session.workspacePath === workspacePath ||
    (!session.workspacePath && workspacePath === DEFAULT_WORKSPACE_PATH)
  );
  const rootSessions = workspaceSessions.filter((session) => !session.parentId);
  const pinnedSessions = rootSessions.filter((session) => !session.archived && session.pinned);
  const regularSessions = rootSessions.filter((session) => !session.archived && !session.pinned);
  const archivedSessions = rootSessions.filter((session) => session.archived);

  const handleNewSession = () => {
    closeWorkbench();
    setActiveSession(null);
  };

  const handleOpenSession = (sessionId: string) => {
    closeWorkbench();
    setActiveSession(sessionId);
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
    <SidebarPage width={width}>
      <ProjectHeader
        workspaceName={workspace.name}
        workspacePath={workspacePath}
        onNewSession={handleNewSession}
        onCopyWorkspacePath={handleCopyWorkspacePath}
        onOpenWorkspace={handleOpenWorkspace}
        onRemoveWorkspace={handleRemoveWorkspace}
      />

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {rootSessions.length === 0 ? (
          <EmptyState className="mt-2 bg-transparent" title="暂无历史会话" description="在右侧输入任意内容，新会话将自动出现于此。" />
        ) : (
          <div className="space-y-[var(--theme-section-gap)]">
            {pinnedSessions.length > 0 && (
              <SessionGroup title="置顶会话" count={pinnedSessions.length}>
                {pinnedSessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={session.id === activeSessionId}
                    onClick={() => handleOpenSession(session.id)}
                  />
                ))}
              </SessionGroup>
            )}
            <SessionGroup title="最近会话" count={regularSessions.length}>
              {regularSessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  onClick={() => handleOpenSession(session.id)}
                />
              ))}
            </SessionGroup>
            {archivedSessions.length > 0 && (
              <SessionGroup title="已归档" count={archivedSessions.length}>
                {archivedSessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={session.id === activeSessionId}
                    onClick={() => handleOpenSession(session.id)}
                  />
                ))}
              </SessionGroup>
            )}
          </div>
        )}
      </div>
    </SidebarPage>
  );
};

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
    <div className="mb-[calc(var(--theme-toolbar-gap)*0.8)] flex items-center justify-between px-1">
      <span className={themeRecipes.eyebrow()}>{title}</span>
      <span className="text-[length:var(--theme-meta-size)] text-[var(--theme-text-muted)]">{count}</span>
    </div>
    <div className="space-y-[calc(var(--theme-row-gap)*0.35)]">{children}</div>
  </div>
);
