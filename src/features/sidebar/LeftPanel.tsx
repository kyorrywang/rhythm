import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, FolderOpen, Plus, Puzzle, Search, Settings2 } from 'lucide-react';
import { createSession } from '@/shared/api/commands';
import { usePluginStore } from '@/shared/state/usePluginStore';
import { useToast } from '@/shared/hooks/useToast';
import { useSessions, useSessionStore } from '@/shared/state/useSessionStore';
import { SessionItem } from './SessionItem';
import { ProjectHeader } from './ProjectHeader';

const settingItems = [
  { id: 'model', name: '模型', description: '管理 provider、模型和默认选择。' },
  { id: 'session', name: '会话', description: '调整 max turns、system prompt 等。' },
  { id: 'permission', name: '权限', description: '配置工具权限与路径规则。' },
  { id: 'frontend', name: '前端显示', description: '管理主题、消息显示和本地偏好。' },
];

export const LeftPanel = () => {
  const workspacePath = 'C:\\Users\\Administrator\\Documents\\dev\\rhythm';
  const sessions = useSessions();
  const {
    activeSessionId,
    addSession,
    setActiveSession,
    leftPanelMode,
    openWorkbench,
  } = useSessionStore();
  const { error: showError } = useToast();
  const pluginStore = usePluginStore();
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pinnedSessions = sessions.filter((session) => !session.archived && session.pinned);
  const regularSessions = sessions.filter((session) => !session.archived && !session.pinned);
  const archivedSessions = sessions.filter((session) => session.archived);
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

  const handleNewSession = async () => {
    try {
      const session = await createSession('新会话');
      addSession(session);
      setActiveSession(session.id);
    } catch {
      showError('创建会话失败');
    }
  };

  if (leftPanelMode === 'plugins') {
    return (
      <div className="flex h-full w-[320px] shrink-0 flex-col border-r border-slate-200 bg-[#f8f7f3]">
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
            <button
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
            </button>
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
      <div className="flex h-full w-[320px] shrink-0 flex-col border-r border-slate-200 bg-[#f8f7f3]">
        <PanelModeHeader
          icon={<Settings2 size={16} />}
          title="设置"
          subtitle="选择一个设置项，在工作台中查看详情"
        />
        <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
          {settingItems.map((item) => (
            <button
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
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-[320px] shrink-0 flex-col border-r border-slate-200 bg-[#f8f7f3]">
      <ProjectHeader
        workspaceName="rhythm"
        workspacePath={workspacePath}
        onNewSession={handleNewSession}
      />

      <div className="px-4 pb-3">
        <PanelSearch
          inputRef={searchInputRef}
          value={query}
          onChange={setQuery}
          placeholder="搜索会话，快捷键 Ctrl+K"
        />
      </div>

      <div className="mb-2 px-4">
        <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/70 px-3 py-3 text-xs leading-5 text-amber-900">
          当前先按单工作区推进 M1 + M2。多工作区按钮已就位，后续阶段再接真实数据源。
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {sessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/90 px-4 py-6 text-center">
            <FolderOpen size={18} className="mx-auto text-slate-400" />
            <p className="mt-3 text-sm font-medium text-slate-700">还没有会话</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">发送第一条消息时会自动创建新会话，也可以先手动新建。</p>
            <button
              onClick={handleNewSession}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800"
            >
              <Plus size={14} />
              新建会话
            </button>
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
