import { useEffect, useMemo, useRef, useState } from 'react';
import { openPath } from '@tauri-apps/plugin-opener';
import { ChevronRight, Puzzle, Search, Settings2 } from 'lucide-react';
import { usePluginStore } from '@/shared/state/usePluginStore';
import { useSessions, useSessionStore } from '@/shared/state/useSessionStore';
import { SessionItem } from './SessionItem';
import { ProjectHeader } from './ProjectHeader';
import { Button } from '@/shared/ui/Button';
import { useToast } from '@/shared/hooks/useToast';
import { DEFAULT_WORKSPACE_PATH, useActiveWorkspace, useWorkspaceStore } from '@/shared/state/useWorkspaceStore';

const settingItems = [
  { id: 'model', name: '模型', description: '管理 provider、模型和默认选择。' },
  { id: 'session', name: '会话', description: '调整 max turns、system prompt 等。' },
  { id: 'permission', name: '权限', description: '配置工具权限与路径规则。' },
  { id: 'frontend', name: '前端显示', description: '管理主题、消息显示和本地偏好。' },
];

export const LeftPanel = ({ width }: { width: number }) => {
  const workspace = useActiveWorkspace();
  const workspacePath = workspace.path;
  const sessions = useSessions();
  const removeWorkspace = useWorkspaceStore((state) => state.removeWorkspace);
  const {
    activeSessionId,
    setActiveSession,
    leftPanelMode,
    openWorkbench,
  } = useSessionStore();
  const pluginStore = usePluginStore();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
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
    if (leftPanelMode === 'plugins' && pluginStore.plugins.length === 0 && !pluginStore.isLoading) {
      void pluginStore.fetchPlugins(workspacePath);
    }
  }, [leftPanelMode, pluginStore, workspacePath]);

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

  if (leftPanelMode === 'plugins') {
    return (
      <div className="flex h-full shrink-0 flex-col bg-[#f8f7f3]" style={{ width }}>
        <PanelModeHeader
          icon={<Puzzle size={16} />}
          title="插件"
          subtitle="查看已安装插件与运行能力"
        />
        <div className="px-4 pb-3">
          <PanelSearch placeholder="搜索插件或过滤状态" />
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
          {pluginStore.plugins.map((plugin) => (
            <Button
              variant="unstyled"
              size="none"
              key={plugin.name}
              onClick={() =>
                openWorkbench({
                  isOpen: true,
                  mode: 'plugin',
                  title: plugin.name,
                  description: `${plugin.version} · ${plugin.enabled ? '已启用' : '已禁用'} · ${plugin.skills_count} 个技能`,
                  meta: {
                    summary: plugin.name,
                  },
                })
              }
              className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-800">{plugin.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{plugin.version}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{plugin.description}</p>
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                <span>{plugin.enabled ? '已启用' : '已禁用'}</span>
                <span>{plugin.skills_count} skills</span>
              </div>
            </Button>
          ))}
          {!pluginStore.isLoading && pluginStore.plugins.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
              当前工作区没有发现插件
            </div>
          )}
        </div>
      </div>
    );
  }

  if (leftPanelMode === 'settings') {
    return (
      <div className="flex h-full shrink-0 flex-col bg-[#f8f7f3]" style={{ width }}>
        <PanelModeHeader
          icon={<Settings2 size={16} />}
          title="设置"
          subtitle="选择一个设置项，在工作台中查看详情"
        />
        <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
          {settingItems.map((item) => (
            <Button
              variant="unstyled"
              size="none"
              key={item.id}
              onClick={() =>
                openWorkbench({
                  isOpen: true,
                  mode: 'settings',
                  title: item.name,
                  description: item.description,
                  meta: {
                    summary: item.id,
                  },
                })
              }
              className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <div>
                <div className="text-sm font-medium text-slate-800">{item.name}</div>
                <div className="mt-1 text-xs text-slate-500">{item.description}</div>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </Button>
          ))}
        </div>
      </div>
    );
  }

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

const PanelModeHeader = ({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) => (
  <div className="px-4 pb-4 pt-5">
    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
      {icon}
      <span>{title}</span>
    </div>
    <h2 className="mt-3 text-[20px] font-semibold text-slate-900">{title}</h2>
    <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>
  </div>
);

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
