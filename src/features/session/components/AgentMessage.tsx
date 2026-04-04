import { useState, useEffect } from 'react';
import { Loader2, ChevronRight, ChevronDown, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message, MessageSegment, ToolCall } from '@/types/schema';
import { getToolPresentation } from '@/features/session/toolPresentation';
import { useSessionStore } from '@/store/useSessionStore';

interface AgentMessageProps {
  message: Message;
  isLast?: boolean;
  isSessionRunning?: boolean;
}

const Timer = ({ isRunning, startTime, finalMs }: { isRunning: boolean, startTime: number, finalMs?: number }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isRunning) return;
    const intervalId = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);
    return () => clearInterval(intervalId);
  }, [isRunning, startTime]);

  const ms = isRunning ? elapsed : (finalMs !== undefined ? finalMs : elapsed);
  return <>{(ms / 1000).toFixed(1)}s</>;
};

const ToolBlock = ({ tool }: { tool: ToolCall }) => {
  const isRunning = tool.status === 'running';
  const presentation = getToolPresentation(tool);
  const [isExpanded, setIsExpanded] = useState(presentation.defaultExpanded);

  useEffect(() => {
    if (isRunning) {
      setIsExpanded(true);
    } else {
      setIsExpanded(false);
    }
  }, [isRunning]);

  const isSubagent = tool.name === 'spawn_subagent';

  if (isSubagent) {
    return (
      <div className="flex items-center gap-2 text-[13px]">
        <span className="font-bold text-gray-800">{presentation.title}</span>

        {tool.subSessionId ? (
          <button
            onClick={() => useSessionStore.getState().setActiveSession(tool.subSessionId!)}
            className="text-blue-600 hover:text-blue-800 underline cursor-pointer"
          >
            {presentation.summary}
          </button>
        ) : (
          <span className="text-gray-500">{presentation.summary}</span>
        )}

        <span className="text-gray-500 ml-1">
          (<Timer isRunning={isRunning} startTime={(tool as any).startTime || Date.now()} finalMs={tool.executionTime} />)
        </span>

        {isRunning && <Loader2 size={12} className="animate-spin text-gray-400 ml-1" />}
      </div>
    );
  }

  return (
    <div>
      <div
        className="flex items-center gap-2 cursor-pointer select-none hover:text-gray-600 w-fit text-[13px]"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="font-bold text-gray-800">{presentation.title}</span>

        {isRunning ? (
          <span className="text-gray-500">正在执行...</span>
        ) : (
          <span className="font-mono text-[12px] text-gray-600 truncate max-w-[360px]">
            {presentation.summary}
          </span>
        )}

        <span className="text-gray-500 ml-1">
          (<Timer isRunning={isRunning} startTime={(tool as any).startTime || Date.now()} finalMs={tool.executionTime} />)
        </span>

        {isRunning && <Loader2 size={12} className="animate-spin text-gray-400 ml-1" />}
        {isExpanded ? <ChevronDown size={14} className="text-gray-400 ml-1" /> : <ChevronRight size={14} className="text-gray-400 ml-1" />}
      </div>

      <AnimatePresence>
        {isExpanded && presentation.details && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-2"
          >
            <div className="text-[13px] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 max-w-[95%] max-h-[150px] overflow-y-auto custom-scrollbar font-mono text-[12px] whitespace-pre-wrap">
              {presentation.details}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AskSegment = ({ segment }: { segment: MessageSegment & { type: 'ask' } }) => {
  const isWaiting = segment.status === 'waiting';
  const [isExpanded, setIsExpanded] = useState(!isWaiting);

  useEffect(() => {
    if (!isWaiting) {
      setIsExpanded(true);
    }
  }, [isWaiting]);

  const answerSummary = segment.answer
    ? segment.answer.text || segment.answer.selected.join(', ')
    : '';

  return (
    <div className="mb-2">
      <div
        className="flex items-center gap-2 cursor-pointer select-none hover:text-gray-600 w-fit text-[13px]"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="font-bold text-gray-800">Ask</span>

        {isWaiting ? (
          <>
            <span className="text-gray-500">等待回答...</span>
            <Loader2 size={12} className="animate-spin text-gray-400 ml-1" />
          </>
        ) : (
          <span className="font-mono text-[12px] text-gray-600 truncate max-w-[360px]">
            {answerSummary}
          </span>
        )}

        {isExpanded ? <ChevronDown size={14} className="text-gray-400 ml-1" /> : <ChevronRight size={14} className="text-gray-400 ml-1" />}
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-2"
          >
            <div className="text-[13px] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 max-w-[95%]">
              <div className="mb-2">
                <span className="text-gray-400 text-[11px] uppercase tracking-wide">问题</span>
                <p className="text-gray-800 mt-1">{segment.question}</p>
              </div>

              {segment.options.length > 0 && (
                <div className="mb-2">
                  <span className="text-gray-400 text-[11px] uppercase tracking-wide">选项</span>
                  <div className="mt-1 space-y-1">
                    {segment.options.map((opt, i) => {
                      const isSelected = segment.answer?.selected.includes(opt);
                      return (
                        <div
                          key={i}
                          className={`text-[12px] px-2 py-1 rounded ${
                            isSelected
                              ? 'bg-blue-100 text-blue-700 font-medium'
                              : 'text-gray-500'
                          }`}
                        >
                          {opt}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!isWaiting && segment.answer?.text && (
                <div>
                  <span className="text-gray-400 text-[11px] uppercase tracking-wide">补充说明</span>
                  <p className="text-gray-800 mt-1">{segment.answer.text}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ThinkingSegment = ({ segment, isLive }: { segment: MessageSegment & { type: 'thinking' }, isLive: boolean }) => {
  const [isExpanded, setIsExpanded] = useState(isLive);

  useEffect(() => {
    if (!isLive) {
      setIsExpanded(false);
    }
  }, [isLive]);

  return (
    <div className="py-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 cursor-pointer select-none hover:text-gray-600 w-fit text-[13px] outline-none"
      >
        <span className="font-bold text-gray-800">思考过程</span>

        <span className="text-gray-500">思考</span>

        {segment.timeCostMs !== undefined ? (
          <span className="text-gray-500 ml-1">
            (<Timer isRunning={false} startTime={0} finalMs={segment.timeCostMs} />)
          </span>
        ) : isLive && segment.startTime ? (
          <span className="text-gray-500 ml-1">
            (<Timer isRunning={true} startTime={segment.startTime} />)
          </span>
        ) : null}

        {isLive && <Loader2 size={12} className="animate-spin text-gray-400 ml-1" />}
        {isExpanded ? <ChevronDown size={14} className="text-gray-400 ml-1" /> : <ChevronRight size={14} className="text-gray-400 ml-1" />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-2"
          >
            <div className="text-[13px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-3 max-w-[95%] max-h-[200px] overflow-y-auto custom-scrollbar whitespace-pre-wrap leading-relaxed">
              {segment.content ? (
                segment.content
              ) : (
                <p className="animate-pulse">...</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const AgentMessage = ({ message, isLast, isSessionRunning }: AgentMessageProps) => {
  const isMessageRunning = isSessionRunning && isLast;
  const isMessageComplete = !isSessionRunning && isLast;

  const segments = message.segments || [];
  const hasSegments = segments.length > 0;
  const hasLegacyContent = message.content && !hasSegments;
  const hasLegacyToolCalls = message.toolCalls && message.toolCalls.length > 0 && !hasSegments;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="group relative pt-2 ml-4 pr-12 pb-6 flex flex-col border-transparent"
    >
      {/* Segments-based rendering (new timeline approach) */}
      {hasSegments && (
        <div className="relative pt-2">
          {segments.map((segment, index) => (
            <div key={index}>
              {segment.type === 'thinking' && (
                <ThinkingSegment
                  segment={segment}
                  isLive={segment.isLive || false}
                />
              )}
              {segment.type === 'tool' && (
                <div className="mb-2">
                  <ToolBlock tool={segment.tool} />
                </div>
              )}
              {segment.type === 'ask' && (
                <AskSegment segment={segment} />
              )}
              {segment.type === 'text' && segment.content && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className="prose prose-sm max-w-none text-gray-800 mt-2"
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '');
                        return match ? (
                          <SyntaxHighlighter
                            {...props}
                            style={vscDarkPlus}
                            language={match[1]}
                            PreTag="div"
                            className="rounded-md my-2 text-sm"
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code {...props} className={`${className || ''} bg-gray-100 rounded-md px-1.5 py-0.5 text-sm text-pink-600 font-mono`}>
                            {children}
                          </code>
                        );
                      }
                    }}
                  >
                    {segment.content}
                  </ReactMarkdown>
                </motion.div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Legacy content fallback (for backward compatibility) */}
      {!hasSegments && (
        <div className="relative pt-2">
          {hasLegacyToolCalls && (
            <div className="mb-4 flex flex-col gap-3 text-[13px] text-gray-800">
              {message.toolCalls!.map(tool => (
                <ToolBlock key={tool.id} tool={tool} />
              ))}
            </div>
          )}

          {hasLegacyContent && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="prose prose-sm max-w-none text-gray-800 mt-2"
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    return match ? (
                      <SyntaxHighlighter
                        {...props}
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        className="rounded-md my-2 text-sm"
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code {...props} className={`${className || ''} bg-gray-100 rounded-md px-1.5 py-0.5 text-sm text-pink-600 font-mono`}>
                        {children}
                      </code>
                    );
                  }
                }}
              >
                {message.content}
              </ReactMarkdown>
            </motion.div>
          )}
        </div>
      )}

      {/* Footer actions area */}
      <div className="mt-3 h-6 flex flex-col justify-center">
        {isMessageRunning ? (
          <div className="flex items-center justify-start text-[12px] text-gray-400">
            <Loader2 size={14} className="animate-spin text-gray-400" />
            <span className="mx-2">·</span>
            <Timer isRunning={true} startTime={message.createdAt} />
          </div>
        ) : (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-start text-[12px] text-gray-400">
            <button className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition-colors flex items-center" title="Copy">
              <Copy size={14} />
            </button>

            {message.status !== 'running' && (
              <>
                <span className="mx-2 text-gray-300">|</span>
                <span>Rhythm AI</span>
                {isMessageComplete && (
                  <>
                    <span className="mx-2 text-gray-300">·</span>
                    <Timer isRunning={false} startTime={message.createdAt} finalMs={message.totalTimeMs} />
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};
