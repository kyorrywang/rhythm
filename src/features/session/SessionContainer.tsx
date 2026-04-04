import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, GitBranch, ChevronLeft } from 'lucide-react';
import { ComposerBox } from '@/features/composer/ComposerBox';
import { UserMessage } from './components/UserMessage';
import { AgentMessage } from './components/AgentMessage';
import { ContextUsagePanel } from './components/ContextUsagePanel';
import { useSessionStore } from '@/store/useSessionStore';

// Mock Empty State
const EmptyState = () => (
  <div className="flex-1 flex flex-col items-center justify-center -mt-20">
    <div className="w-10 h-14 border-[3px] border-gray-800 rounded-sm mb-6 flex items-center justify-center relative">
      <div className="absolute inset-2 bg-gray-800 opacity-20"></div>
    </div>
    <h1 className="text-[20px] font-medium text-gray-800 mb-6">构建任何东西</h1>
    <p className="text-[12px] text-gray-500 mb-4">C:/Users/Administrator/Documents/dev/rhythm</p>
    <div className="flex items-center gap-1.5 text-gray-500 mb-4">
      <GitBranch size={14} />
      <span className="text-[12px]">主分支 (master)</span>
    </div>
    <div className="text-[12px] text-gray-400">最后修改 7天前</div>
  </div>
);

export const SessionContainer = () => {
  const { activeSessionId, sessions } = useSessionStore();
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeSession = sessions.find(s => s.id === activeSessionId);

  const messages = activeSession?.messages ?? [];
  const isSessionRunning = activeSession?.running ?? false;

  // Auto scroll down whenever messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, messages[messages.length - 1]?.content, messages[messages.length - 1]?.toolCalls?.length]);

  const isEmpty = !activeSession || messages.length === 0;

  return (
    <div className="flex-1 flex flex-col relative bg-white overflow-hidden">
      {/* Session Content Layer */}
      {isEmpty ? (
        <EmptyState />
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-10 pb-[200px] no-scrollbar flex flex-col smooth-scroll">
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
      <div className="absolute bottom-0 left-0 right-0 bg-transparent py-4 bg-gradient-to-t from-white via-white/95 to-transparent pointer-events-none z-30">
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
