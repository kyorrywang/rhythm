import { useState, useEffect } from 'react';
import { Plus, ArrowUp, Shield, ChevronDown, CheckSquare, Square, Trash2, MoreHorizontal, ArrowRight, CornerDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLLMStream } from '@/features/session/hooks/useLLMStream';
import { Message } from '@/types/schema';

import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '@/store/useSessionStore';

export const ComposerBox = () => {
  const { activeSessionId, sessions, queueMessage, clearAskRequest } = useSessionStore();
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const currentAsk = activeSession?.currentAsk;

  const [text, setText] = useState('');
  const [mode, setMode] = useState<Message['mode']>('normal');
  const [selectedAskOptions, setSelectedAskOptions] = useState<string[]>([]);
  const { connectStream, isStreaming } = useLLMStream();
  
  // Sync mode with store
  useEffect(() => {
    if (currentAsk) {
      setMode('ask');
    } else if (isStreaming && text.length > 0 && mode !== 'ask') {
      setMode('append');
    } else if (!isStreaming && !currentAsk && mode === 'append') {
      setMode('normal');
    }
  }, [currentAsk, isStreaming, text.length]);

  const handleSend = () => {
    if (mode === 'ask' && currentAsk && activeSessionId) {
      // Send user answer
      const answer = text.trim() ? text.trim() : selectedAskOptions.join(', ');
      invoke('submit_user_answer', { sessionId: activeSessionId, answer }).catch(console.error);
      clearAskRequest(activeSessionId);
      setMode('normal');
      setText('');
      setSelectedAskOptions([]);
      return;
    }

    if (isStreaming && activeSessionId) {
      // Queue message
      queueMessage(activeSessionId, {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        mode: 'append',
        createdAt: Date.now(),
      });
      setText('');
      return;
    }

    if (text.trim()) {
      connectStream(text, mode);
      setText('');
      setMode('normal');
    }
  };

  // Task Dock
  const TaskDock = () => (
    <div className="border-b border-gray-100 bg-[#fbfbfb] px-4 py-3 rounded-t-xl transition-all">
      <div className="flex items-center justify-between text-[12px] text-gray-800 font-medium mb-3">
        <span>已完成 2 个任务 (共 3 个)</span>
        <ChevronDown size={14} className="text-gray-400" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[13px] text-gray-400">
          <div className="text-gray-300"><CheckSquare size={14} /></div>
          <span className="line-through">创建测试文件 test1.txt，内容为 'Task 1 completed'</span>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-gray-400">
          <div className="text-gray-300"><CheckSquare size={14} /></div>
          <span className="line-through">创建测试文件 test2.txt，内容为 'Task 2 completed'</span>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-gray-800">
          <div className="w-3.5 h-3.5 flex items-center justify-center border border-gray-300 rounded-[3px] bg-white text-gray-400 shrink-0">
            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
          </div>
          <span>创建测试文件 test3.txt，内容为 'Task 3 completed'</span>
        </div>
      </div>
    </div>
  );

  // Append Dock styled like TaskDock
  const AppendDock = () => (
    <div className="border-b border-gray-100 bg-[#fbfbfb] px-4 py-2.5 rounded-t-xl transition-all flex items-center justify-between text-[13px] text-gray-600">
      <div className="flex items-center gap-2">
        <CornerDownRight size={14} className="text-gray-400" />
        <span>继续</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-md text-[12px]">
          <ArrowRight size={12} /> 引导
        </div>
        <button className="text-gray-400 hover:text-gray-600" onClick={() => setMode('normal')}>
          <Trash2 size={14} />
        </button>
        <button className="text-gray-400 hover:text-gray-600">
          <MoreHorizontal size={14} />
        </button>
      </div>
    </div>
  );

  // Ask Dock
  if (mode === 'ask' && currentAsk) {
    return (
      <div className="w-full max-w-[700px] mx-auto pb-6 relative z-20">
        <div className="bg-white border text-left border-gray-200 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-[13px] font-medium text-gray-800">需要您的输入</span>
          </div>
          <div className="p-4">
            <div className="mb-4">
              <h3 className="text-[14px] font-medium text-gray-800">{currentAsk.question}</h3>
              {currentAsk.options.length > 0 && <p className="text-[12px] text-gray-400 mt-1">请选择或输入回答</p>}
            </div>
            <div className="space-y-2">
              {currentAsk.options.map((opt, i) => {
                const isSelected = selectedAskOptions.includes(opt);
                return (
                  <div 
                    key={i} 
                    onClick={() => {
                      setSelectedAskOptions(prev => 
                        prev.includes(opt) ? prev.filter(p => p !== opt) : [...prev, opt]
                      )
                    }}
                    className={cn(
                      "flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors",
                      isSelected ? "border-blue-500 bg-blue-50/30" : "border-gray-200 hover:border-blue-300"
                    )}
                  >
                    <div className={cn(
                      "mt-0.5 w-4 h-4 border rounded flex-shrink-0 flex items-center justify-center",
                      isSelected ? "border-blue-500 bg-blue-500" : "border-gray-300 bg-white"
                    )}>
                      {isSelected && <CheckSquare size={12} className="text-white" />}
                    </div>
                    <div className="text-[14px] text-gray-800">{opt}</div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="补充说明或直接回答..."
                className="w-full resize-none border border-gray-200 rounded-lg p-3 text-[14px] outline-none focus:border-blue-300 min-h-[60px]"
              />
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3 bg-[#fbfbfb] border-t border-gray-100">
            <div />
            <button 
              onClick={handleSend} 
              disabled={selectedAskOptions.length === 0 && !text.trim()}
              className="px-4 py-1.5 bg-[#1f1f1f] hover:bg-black disabled:opacity-50 text-white text-[13px] rounded-md transition-colors"
            >
              提交
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[700px] mx-auto pb-6 relative z-20">
      {/* Main Composer Box */}
      <div className="bg-white border text-left border-gray-200 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-300 transition-all flex flex-col pointer-events-auto relative">
        
        {mode === 'task' && <TaskDock />}
        {mode === 'append' && <AppendDock />}

        {/* Content Area */}
        <div className="min-h-[80px] p-3 flex flex-col">
          <textarea
            value={text}
            className="w-full flex-1 resize-none bg-transparent outline-none text-[14px] text-gray-800 placeholder:text-gray-400 min-h-[40px] px-1"
            placeholder={mode === 'append' ? "要求后续变更" : "随便问点什么... (输入 /task, /ask, /append 体验不用dock)"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
        </div>

        {/* Input Tools & Submit */}
        <div className="flex items-center justify-between px-3 pb-3">
          <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-md transition-colors">
            <Plus size={18} />
          </button>
          
          <button 
            onClick={handleSend}
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-md transition-colors",
              text.trim().length > 0
                ? "bg-black text-white hover:bg-gray-800 shadow-[0_2px_4px_rgba(0,0,0,0.2)]"
                : "bg-[#dbdbdb] text-white cursor-not-allowed"
            )}
          >
            {mode === 'append' ? <Square size={13} fill="currentColor" strokeWidth={0} /> : <ArrowUp size={16} strokeWidth={2.5} />}
          </button>
        </div>

        {/* Bottom Toolbar */}
        <div className="flex items-center px-3 py-2 border-t border-gray-100 bg-[#fbfbfb] rounded-b-xl gap-3 text-[12px] text-gray-500">
          <div className="flex items-center gap-1 cursor-pointer hover:text-gray-700">
            Build <ChevronDown size={12} />
          </div>
          <div className="flex items-center gap-1 cursor-pointer hover:text-gray-700">
            <span className="font-bold font-serif italic mr-0.5">Z</span> Big Pickle <ChevronDown size={12} />
          </div>
          <div className="flex items-center gap-1 cursor-pointer hover:text-gray-700">
            默认 <ChevronDown size={12} />
          </div>
          <div className="flex-1" />
          <div className="text-green-500 cursor-pointer hover:text-green-600">
            <Shield size={14} />
          </div>
        </div>
      </div>
    </div>
  );
};
