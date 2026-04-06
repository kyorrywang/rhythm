import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, ChevronLeft } from 'lucide-react';
import { ComposerBox } from '@/features/composer/ComposerBox';
import { UserMessage } from './components/UserMessage';
import { AgentMessage } from './components/AgentMessage';
import { ContextUsagePanel } from './components/ContextUsagePanel';
import { PermissionDialog } from './components/PermissionDialog';
import { ErrorBanner } from './components/ErrorBanner';
import { MaxTurnsWarning } from './components/MaxTurnsWarning';
import { useSessionStore, useActiveSession } from '@/shared/state/useSessionStore';
import { usePermissionStore } from '@/shared/state/usePermissionStore';
import { useAutoScroll } from '@/shared/hooks/useAutoScroll';
import { EmptyState } from './EmptyState';
import type { Message } from '@/shared/types/schema';

export const SessionContainer = () => {
  const activeSession = useActiveSession();
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(false);
  const [composerHeight, setComposerHeight] = useState(200);
  const composerRef = useRef<HTMLDivElement>(null);
  const { scrollRef } = useAutoScroll([
    activeSession?.id,
    activeSession?.messages.length,
    activeSession?.messages[activeSession.messages.length - 1]?.segments?.length,
  ]);

  const pendingPermissions = usePermissionStore((s) => s.pendingPermissions);
  const hasPendingPermission = pendingPermissions.size > 0;
  const firstPermission = hasPendingPermission ? Array.from(pendingPermissions.values())[0] : null;

  const messages = activeSession?.messages ?? [];
  const isSessionRunning = activeSession?.phase !== 'idle' && activeSession?.phase !== undefined && activeSession?.phase !== 'waiting_for_permission';

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        setComposerHeight(height);
      }
    });

    observer.observe(el);
    setComposerHeight(el.getBoundingClientRect().height);

    return () => observer.disconnect();
  }, []);

  const isEmpty = !activeSession || messages.length === 0;

  return (
    <div className="flex-1 flex flex-col relative bg-white overflow-hidden">
      {isEmpty ? (
        <EmptyState />
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar flex flex-col smooth-scroll" style={{ paddingBottom: `${composerHeight + 32}px` }}>
          <div className="max-w-[700px] w-full mx-auto relative pointer-events-auto z-10">
            <div className="flex items-center justify-between py-6 sticky top-0 bg-white/95 backdrop-blur-sm z-20">
              <div className="flex items-center gap-3">
                {activeSession?.parentId && (
                  <button
                    onClick={() => useSessionStore.getState().navigateBack()}
                    className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-800 transition-colors"
                  >
                    <ChevronLeft size={16} /> 返回主会话
                  </button>
                )}
                <h2 className="text-[16px] font-medium text-gray-800">{activeSession?.title}</h2>
              </div>
              <div className="flex items-center gap-3">
                <button
                  className="relative flex items-center justify-center w-[18px] h-[18px] rounded-full shrink-0 group cursor-pointer text-gray-300 hover:text-gray-400 focus:outline-none"
                  title="上下文用量"
                  onClick={() => setIsContextPanelOpen(true)}
                >
                  <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                    <path className="text-zinc-200" strokeWidth="6" stroke="currentColor" fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path className="text-zinc-400 group-hover:text-zinc-500 transition-colors" strokeWidth="6" strokeDasharray="6, 100" stroke="currentColor" fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                </button>
                <button className="text-gray-400 hover:text-gray-600 focus:outline-none">
                  <MoreHorizontal size={18} />
                </button>
              </div>
            </div>

            {activeSession?.error && (
              <div className="mb-4">
                <ErrorBanner message={activeSession.error} onDismiss={() => useSessionStore.getState().updateSession(activeSession.id, { error: null, maxTurnsReached: null })} />
              </div>
            )}

            {activeSession?.maxTurnsReached ? (
              <div className="mb-4">
                <MaxTurnsWarning
                  turns={activeSession.maxTurnsReached}
                />
              </div>
            ) : null}

            <div className="space-y-6 text-[14px] leading-relaxed text-gray-800 pb-12 relative">
              {messages.map((msg: Message, index: number) => (
                msg.role === 'user' ? (
                  <UserMessage key={msg.id || index} message={msg} />
                ) : (
                  <AgentMessage
                    key={msg.id || index}
                    message={msg}
                    isLast={index === messages.length - 1}
                    isSessionRunning={isSessionRunning}
                  />
                )
              ))}
            </div>
          </div>
        </div>
      )}

      <div ref={composerRef} className="absolute bottom-0 left-0 right-0 bg-transparent py-4 bg-gradient-to-t from-white via-white/95 to-transparent pointer-events-none z-30">
        <ComposerBox />
      </div>

      {activeSession && (
        <ContextUsagePanel
          session={activeSession}
          isOpen={isContextPanelOpen}
          onClose={() => setIsContextPanelOpen(false)}
        />
      )}

      {hasPendingPermission && firstPermission && (
        <PermissionDialog
          request={firstPermission}
          onResolve={(toolId, approved) => {
            usePermissionStore.getState().resolvePending(toolId, approved);
          }}
        />
      )}
    </div>
  );
};
