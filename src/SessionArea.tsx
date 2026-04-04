import { useState, useEffect, useRef } from 'react';
import { Loader2, MoreHorizontal, ChevronRight, ChevronDown, GitBranch, Undo, Edit3, Copy } from 'lucide-react';
import { Composer } from './Composer';

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

export const SessionArea = () => {
  const [composerMode, setComposerMode] = useState('normal');
  const [flowStep, setFlowStep] = useState(0); 
  const [userText, setUserText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // States for expandable areas
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const [isShellExpanded, setIsShellExpanded] = useState(true);
  const [isWriteExpanded, setIsWriteExpanded] = useState(true);

  // Auto scroll down
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [flowStep, isThinkingExpanded, isShellExpanded, isWriteExpanded]);

  const handleSend = (text: string, mode: string) => {
    setUserText(text || (mode === 'ask' ? '已提交选项' : '测试任务'));
    setFlowStep(1); // User message
    
    // reset states
    setIsThinkingExpanded(false);
    setIsShellExpanded(true); // default open when running
    setIsWriteExpanded(true);

    // Simulate flow
    setTimeout(() => {
      setFlowStep(2);
      setIsThinkingExpanded(true); // Automatically expand thinking when started
    }, 600); 
    setTimeout(() => {
      setFlowStep(3); // Tool running
      setIsThinkingExpanded(false); // Autocollapse thinking
    }, 2000); 
    setTimeout(() => {
      setFlowStep(4);
      setIsShellExpanded(false); // Automatically collapse tools when done
      setIsWriteExpanded(false);
    }, 5000); 
  };

  return (
    <div className="flex-1 flex flex-col relative bg-white overflow-hidden">
      {/* Session Content Layer */}
      {flowStep === 0 ? (
        <EmptyState />
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-10 pb-[200px] no-scrollbar flex flex-col smooth-scroll">
          <div className="max-w-[700px] w-full mx-auto relative pointer-events-auto z-10">
            {/* Header */}
            <div className="flex items-center justify-between py-6 sticky top-0 bg-white/95 backdrop-blur-sm z-20">
              <h2 className="text-[16px] font-medium text-gray-800">响应式会话演示</h2>
              <div className="flex items-center gap-3">
                {flowStep < 4 && <Loader2 size={16} className="animate-spin text-gray-400" />}
                <button className="text-gray-400 hover:text-gray-600 focus:outline-none">
                  <MoreHorizontal size={18} />
                </button>
              </div>
            </div>

            <div className="space-y-6 text-[14px] leading-relaxed text-gray-800 pb-12 relative">
              
              {/* --- STEP 1+: User Message --- */}
              {flowStep >= 1 && (
                <div className="group flex flex-col relative w-full pt-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="bg-transparent border border-gray-200 rounded-xl px-4 py-3 text-gray-800 w-fit self-end mr-4 max-w-[80%] whitespace-pre-wrap">
                    {userText}
                  </div>
                  {/* Hover actions below user message */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-4 mt-1 text-[11px] text-gray-400 self-end mr-6 absolute -bottom-6 right-0 bg-white/80 px-2 rounded-full py-0.5">
                    <div className="flex gap-2 items-center mr-2">
                      <span>Build</span>
                      <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                      <span>刚刚</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button className="hover:text-gray-700 hover:bg-gray-100 p-1 rounded transition-colors" title="Fork"><GitBranch size={12}/></button>
                      <button className="hover:text-gray-700 hover:bg-gray-100 p-1 rounded transition-colors" title="Undo"><Undo size={12}/></button>
                      <button className="hover:text-gray-700 hover:bg-gray-100 p-1 rounded transition-colors" title="Edit"><Edit3 size={12}/></button>
                      <button className="hover:text-gray-700 hover:bg-gray-100 p-1 rounded transition-colors" title="Copy"><Copy size={12}/></button>
                    </div>
                  </div>
                </div>
              )}

              {/* --- STEP 2: Thinking --- */}
              {flowStep >= 2 && (
                <div className="py-2 ml-4 animate-in fade-in duration-300 mt-4">
                  <button 
                    onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                    className="flex items-center gap-2 text-[13px] text-gray-600 hover:text-gray-800 transition-colors cursor-pointer outline-none"
                  >
                    {flowStep === 2 ? (
                      <>
                        <Loader2 size={14} className="animate-spin text-blue-600" />
                        <span className="font-medium text-blue-600">正在思考中</span>
                      </>
                    ) : (
                      <span className="font-bold text-gray-800">已思考</span>
                    )}
                    <span className={flowStep === 2 ? "text-gray-500" : "text-gray-800"}>6s</span>
                    {isThinkingExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                  </button>
                  {isThinkingExpanded && (
                    <div className="mt-2 text-[13px] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 max-w-[95%] max-h-[150px] overflow-y-auto custom-scrollbar">
                      <p>正在分析您的请求...</p>
                      <p>理解需要更新相关模式的代码展示...</p>
                      <p>准备创建文档文件并在本地生成系统上下文信息...</p>
                      <p>正在生成最终规划响应结构...</p>
                    </div>
                  )}
                </div>
              )}

              {/* --- STEP 3+: Tool Execution & Subagent --- */}
              {flowStep >= 3 && (
                <div className="group relative pt-4 ml-4 pr-12 pb-6 border-transparent animate-in fade-in slide-in-from-bottom-4 duration-500">
                  
                  {/* Tool Execution Block */}
                  <div className="mb-4 flex flex-col gap-3 text-[13px] text-gray-800">
                     
                     {/* Shell Tool */}
                     <div>
                       <div 
                        className="flex items-center gap-2 cursor-pointer select-none hover:text-gray-600 w-fit"
                        onClick={() => setIsShellExpanded(!isShellExpanded)}
                       >
                         <span className="font-bold">Shell</span>
                         <span className="font-mono text-[12px] text-gray-600">Check current directory</span>
                         <span className="text-gray-500">(2s)</span>
                         {isShellExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                       </div>
                       {isShellExpanded && (
                         <div className="mt-2 text-[13px] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 max-w-[95%] max-h-[150px] overflow-y-auto custom-scrollbar font-mono text-[12px]">
                           <div>$ ls -la</div>
                           <div>total 128</div>
                           <div>drwxr-xr-x 1 root root 4096 Apr  4 10:20 .</div>
                           <div>drwxr-xr-x 1 root root 4096 Apr  4 10:20 ..</div>
                           <div>-rw-r--r-- 1 root root  245 Apr  4 10:22 package.json</div>
                           <div>-rw-r--r-- 1 root root  820 Apr  4 10:22 src</div>
                           <div>drwxr-xr-x 1 root root 4096 Apr  4 10:22 dist</div>
                           <br />
                           <div>{"[Process exited with code 0]"}</div>
                         </div>
                       )}
                     </div>

                     {/* 写入 Tool */}
                     <div>
                       <div 
                        className="flex items-center gap-2 cursor-pointer select-none hover:text-gray-600 w-fit"
                        onClick={() => setIsWriteExpanded(!isWriteExpanded)}
                       >
                         <span className="font-bold">写入</span>
                         <span className="font-mono text-[12px] text-gray-600">PROJECT_PLAN.md</span>
                         <span className="text-gray-500">(1s)</span>
                         {isWriteExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                       </div>
                       {isWriteExpanded && (
                         <div className="mt-2 text-[13px] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 max-w-[95%] max-h-[150px] overflow-y-auto custom-scrollbar font-mono text-[12px] whitespace-pre-wrap">
{`# PROJECT_PLAN

## 1. Introduction
This document defines the implementation plan for the subagents.

## 2. Core Modules
- pages
- components
- contexts
- i18n
- hooks

## 3. Database Schema
Defined in details inside the /database folder.
...[Content Truncated]...`}
                         </div>
                       )}
                     </div>
                     
                  </div>

                  {/* Subagent display */}
                  <div className="py-2 text-[13px]">
                     <div className="flex items-center gap-1.5 flex-wrap">
                       <span className="font-bold">General 智能体</span>
                       {flowStep === 3 && <Loader2 size={12} className="animate-spin text-gray-400 inline ml-1 mr-1.5" />}
                       <a href="#" className="text-blue-600 hover:underline">Review pages module</a>
                     </div>
                     {flowStep >= 4 && (
                       <>
                         <div className="flex items-center gap-1.5 flex-wrap mt-2">
                           <span className="font-bold">General 智能体</span>
                           <a href="#" className="text-blue-600 hover:underline">Review components module</a>
                         </div>
                       </>
                     )}
                  </div>

                  {/* --- STEP 4: Final Content --- */}
                  {flowStep >= 4 && (
                    <div className="prose prose-sm max-w-none text-gray-800 mt-6 animate-in fade-in duration-500">
                      <p>文档已生成。包含以下核心内容：</p>
                      <ul className="list-none pl-0 space-y-2 mt-2 mb-4 text-gray-600">
                        <li className="flex items-center gap-2 before:content-[''] before:w-1.5 before:h-1.5 before:bg-blue-400 before:rounded-full">完整技术架构设计</li>
                        <li className="flex items-center gap-2 before:content-[''] before:w-1.5 before:h-1.5 before:bg-blue-400 before:rounded-full">核心功能模块详解</li>
                        <li className="flex items-center gap-2 before:content-[''] before:w-1.5 before:h-1.5 before:bg-blue-400 before:rounded-full">API接口设计与响应流式渲染方案</li>
                      </ul>
                      <p>我已经模拟完成了您要求的动画和Dock演示，下一步我们进入正式构建阶段吗？</p>
                    </div>
                  )}

                  {/* LLM Hover metadata (No line below, custom layout) */}
                  {flowStep >= 4 && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-start mt-2 text-[11px] text-gray-400 absolute bottom-1 left-0 bg-white/80 pr-2">
                      <button className="hover:text-gray-700 hover:bg-gray-100 p-1 rounded transition-colors flex items-center gap-1.5 text-gray-500" title="Copy">
                        <Copy size={12} />
                      </button>
                      <span className="mx-1">·</span>
                      <span>Z Big Pickle</span>
                      <span className="mx-1">·</span>
                      <span>8s</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Absolute positioned Composer at the bottom */}
      <div className="absolute bottom-0 left-0 right-0 bg-transparent py-4 bg-gradient-to-t from-white via-white/95 to-transparent pointer-events-none z-30">
        <Composer onSend={handleSend} mode={composerMode} setMode={setComposerMode} />
      </div>
    </div>
  );
};
