import { open } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { DEFAULT_WORKSPACE_PATH, normalizeWorkspacePath, useActiveWorkspace, useWorkspaceStore } from '@/shared/state/useWorkspaceStore';
import { useSessions, useSessionStore } from '@/shared/state/useSessionStore';
import { themeRecipes } from '@/shared/theme/recipes';
import { EmptyState, SidebarPage } from '@/shared/ui';
import { ProjectHeader } from './ProjectHeader';
import { SessionItem } from './SessionItem';

export const SessionsPanel = ({ width }: { width: number }) => {
  const workspace = useActiveWorkspace();
  const workspacePath = workspace.path;
  const sessions = useSessions();
  const addWorkspace = useWorkspaceStore((state) => state.addWorkspace);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const setActiveSession = useSessionStore((state) => state.setActiveSession);
  const closeWorkbench = useSessionStore((state) => state.closeWorkbench);

  const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath);
  const workspaceSessions = sessions.filter((session) =>
    normalizeWorkspacePath(session.workspacePath || DEFAULT_WORKSPACE_PATH) === normalizedWorkspacePath
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

  const handleChangeWorkspace = async () => {
    const selectedPath = await open({
      directory: true,
      multiple: false,
      defaultPath: workspacePath,
      title: 'Choose Workspace',
    });

    if (typeof selectedPath !== 'string' || !selectedPath.trim()) return;
    addWorkspace(selectedPath);
  };

  const handleOpenWorkspace = () => {
    void revealItemInDir(workspacePath);
  };

  return (
    <SidebarPage width={width}>
      <ProjectHeader
        workspaceName={workspace.name}
        workspacePath={workspacePath}
        onNewSession={handleNewSession}
        onChangeWorkspace={handleChangeWorkspace}
        onOpenWorkspace={handleOpenWorkspace}
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
