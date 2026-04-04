import { useState, useEffect } from 'react';
import { Plus, ArrowUp, Shield, ChevronDown, CheckSquare, Square, Minus, Trash2, MoreHorizontal, ArrowRight, CornerDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLLMStream } from '@/features/session/hooks/useLLMStream';
import { Message } from '@/types/schema';

export const ComposerBox = () => {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Message['mode']>('normal');
  const { connectStream, isStreaming } = useLLMStream();
  
  // Watch for slash commands to toggle modes for demo purposes
  useEffect(() => {
    if (text === '/task') {
      setMode('task');
      setText('');
    } else if (text === '/ask') {
      setMode('ask');
      setText('');
    } else if (text === '/append') {
      setMode('append');
      setText('');
    } else if (text === '/normal') {
      setMode('normal');
      setText('');
    }
  }, [text]);

  const handleSend = () => {
    if (isStreaming) return; // Disallow send while streaming
    if (text.trim() || mode === 'ask') {
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
  if (mode === 'ask') {
    return (
      <div className="w-full max-w-[700px] mx-auto pb-6 relative z-20">
        <div className="bg-white border text-left border-gray-200 rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-[13px] font-medium text-gray-800">1/1 个问题</span>
            <button className="text-gray-400 hover:text-gray-600 focus:outline-none" onClick={() => setMode('normal')}>
              <Minus size={16} />
            </button>
          </div>
          <div className="p-4">
            <div className="mb-4">
              <h3 className="text-[14px] font-medium text-gray-800">你喜欢什么编程语言?</h3>
              <p className="text-[12px] text-gray-400 mt-1">可多选</p>
            </div>
            <div className="space-y-2">
              {[
                { title: 'TypeScript', desc: '类型安全的 JavaScript 超集' },
                { title: 'Python', desc: '简洁易读的脚本语言' },
                { title: 'Go', desc: '谷歌开发的并发语言' },
                { title: 'Rust', desc: '注重安全和性能的系统编程语言' },
                { title: '输入自己的答案', desc: '输入你的答案...' }
              ].map((opt, i) => (
                <div key={i} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer transition-colors">
                  <div className="mt-0.5 w-4 h-4 border border-gray-300 rounded flex-shrink-0 bg-white"></div>
                  <div>
                    <div className="text-[14px] text-gray-800">{opt.title}</div>
                    <div className="text-[12px] text-gray-400 mt-0.5">{opt.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3 bg-[#fbfbfb] border-t border-gray-100">
            <button className="text-[13px] text-gray-600 hover:text-gray-800" onClick={() => setMode('normal')}>
              忽略
            </button>
            <button onClick={handleSend} className="px-4 py-1.5 bg-[#1f1f1f] hover:bg-black text-white text-[13px] rounded-md transition-colors">
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
