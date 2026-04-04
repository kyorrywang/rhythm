import { useEffect, useRef } from 'react';
import { Loader2, MoreHorizontal, GitBranch } from 'lucide-react';
import { ComposerBox } from '@/features/composer/ComposerBox';
import { UserMessage } from './components/UserMessage';
import { AgentMessage } from './components/AgentMessage';
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeSession = sessions.find(s => s.id === activeSessionId);

  const messages = activeSession?.messages ?? [];
  const lastMsg = messages[messages.length - 1];
  const isRunning = lastMsg?.role === 'assistant' && lastMsg?.isThinking === true;

  // Auto scroll down whenever messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, lastMsg?.content, lastMsg?.toolCalls?.length]);

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
              <h2 className="text-[16px] font-medium text-gray-800">{activeSession?.title}</h2>
              <div className="flex items-center gap-3">
                {isRunning && <Loader2 size={16} className="animate-spin text-gray-400" />}
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
                  <AgentMessage key={msg.id || index} message={msg} />
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
    </div>
  );
};
