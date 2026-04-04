import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, ChevronLeft, Sparkles } from 'lucide-react';
import { ComposerBox } from '@/features/composer/ComposerBox';
import { UserMessage } from './components/UserMessage';
import { AgentMessage } from './components/AgentMessage';
import { ContextUsagePanel } from './components/ContextUsagePanel';
import { useSessionStore } from '@/store/useSessionStore';

// Beautiful Empty State for Blank Session
const EmptyState = () => (
  <div className="flex-1 flex flex-col items-center justify-center -mt-20 px-6">
    <div className="relative mb-8 flex justify-center group pointer-events-none">
      <div className="absolute inset-0 bg-indigo-500/10 rounded-3xl blur-2xl group-hover:bg-indigo-500/20 transition-all duration-700 ease-in-out"></div>
      <div className="relative w-20 h-20 bg-white/60 backdrop-blur-sm border border-indigo-50/50 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-[24px] flex items-center justify-center transform group-hover:scale-[1.02] transition-all duration-500 ring-1 ring-black/[0.03]">
        <Sparkles className="w-9 h-9 text-indigo-500/90" strokeWidth={1.5} />
      </div>
    </div>
    <h1 className="text-[26px] font-semibold bg-gradient-to-br from-gray-900 to-gray-600 bg-clip-text text-transparent mb-4 tracking-tight flex items-center gap-2">
      构建任何东西
    </h1>
    <p className="text-[14px] text-gray-500 max-w-[420px] text-center leading-relaxed">
      通过自然语言描述需求，我们能为您编写和重构代码、解析底层逻辑或搭建复杂应用的界面。
    </p>
  </div>
);

export const SessionContainer = () => {
  const { activeSessionId, sessions } = useSessionStore();
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(false);
  const [composerHeight, setComposerHeight] = useState(200);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const activeSession = sessions.find(s => s.id === activeSessionId);

  const messages = activeSession?.messages ?? [];
  const isSessionRunning = activeSession?.running ?? false;

  // Auto scroll down whenever messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, messages[messages.length - 1]?.content, messages[messages.length - 1]?.toolCalls?.length]);

  // Observe composer height changes
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
    // Set initial height
    setComposerHeight(el.getBoundingClientRect().height);

    return () => observer.disconnect();
  }, []);

  const isEmpty = !activeSession || messages.length === 0;

  return (
    <div className="flex-1 flex flex-col relative bg-white overflow-hidden">
      {/* Session Content Layer */}
      {isEmpty ? (
        <EmptyState />
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar flex flex-col smooth-scroll" style={{ paddingBottom: `${composerHeight + 32}px` }}>
          <div className="max-w-[700px] w-full mx-auto relative pointer-events-auto z-10">
            {/* Header */}
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

            <div className="space-y-6 text-[14px] leading-relaxed text-gray-800 pb-12 relative">
              {messages.map((msg, index) => (
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
      
      {/* Absolute positioned Composer at the bottom */}
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
    </div>
  );
};
