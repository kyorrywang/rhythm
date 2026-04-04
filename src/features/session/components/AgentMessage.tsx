import { useState, useEffect } from 'react';
import { Loader2, ChevronRight, ChevronDown, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, ToolCall } from '@/types/schema';
import { getToolPresentation } from '@/features/session/toolPresentation';

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

  // Auto-collapse when finished
  useEffect(() => {
    if (isRunning) {
      setIsExpanded(true);
    } else {
      setIsExpanded(false);
    }
  }, [isRunning]);

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

export const AgentMessage = ({ message, isLast, isSessionRunning }: AgentMessageProps) => {
  const [isThinkingExpanded, setThinkingExpanded] = useState(!!message.isThinking);

  useEffect(() => {
    if (!message.isThinking) {
      setThinkingExpanded(false);
    }
  }, [message.isThinking]);

  const isMessageRunning = isSessionRunning && isLast;
  const isMessageComplete = !isSessionRunning && isLast;

  return (
    <>
      {/* Thinking Phase - show when actively thinking OR when had a thinking phase */}
      {(message.isThinking || message.thinkingTimeCostMs !== undefined) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="py-2 ml-4 mt-4"
        >
          <button
            onClick={() => setThinkingExpanded(!isThinkingExpanded)}
            className="flex items-center gap-2 text-[13px] text-gray-600 hover:text-gray-800 transition-colors cursor-pointer outline-none"
          >
            {message.isThinking ? (
              <span className="font-bold text-gray-800">思考中...</span>
            ) : (
              <span className="font-bold text-gray-800">已思考</span>
            )}

            <span className="text-gray-500">
              <Timer 
                isRunning={!!message.isThinking || !!(message as any).isInsideThink} 
                startTime={message.thinkingStartTime || message.createdAt} 
                finalMs={message.thinkingTimeCostMs ?? 0} 
              />
            </span>

            {isThinkingExpanded ? <ChevronDown size={14} className="text-gray-400 ml-1" /> : <ChevronRight size={14} className="text-gray-400 ml-1" />}
          </button>

          <AnimatePresence>
            {isThinkingExpanded && (message.isThinking || message.thinkingContent) && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mt-2"
              >
                <div className="text-[13px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-3 max-w-[95%] max-h-[200px] overflow-y-auto custom-scrollbar whitespace-pre-wrap leading-relaxed">
                  {message.thinkingContent ? (
                    message.thinkingContent
                  ) : (
                    <p className="animate-pulse">...</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Main Content & Tools Container */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="group relative pt-2 ml-4 pr-12 pb-6 border-transparent"
      >
        {/* Tool Blocks */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-4 flex flex-col gap-3 text-[13px] text-gray-800">
            {message.toolCalls.map(tool => (
              <ToolBlock key={tool.id} tool={tool} />
            ))}
          </div>
        )}

        {/* Markdown Content */}
        {message.content && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="prose prose-sm max-w-none text-gray-800 mt-2"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </motion.div>
        )}

        {/* Running indicator - always visible for last message while session is running */}
        {isMessageRunning && (
          <div className="flex items-center justify-start mt-2 text-[11px] text-gray-400">
            <Loader2 size={12} className="animate-spin" />
            <span className="mx-1.5">·</span>
            <Timer isRunning={true} startTime={message.createdAt} />
          </div>
        )}

        {/* Hover Actions - completed last message shows copy · model · time */}
        {isMessageComplete && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-start mt-2 text-[11px] text-gray-400 absolute bottom-1 left-0 bg-white/80 pr-2">
            <button className="hover:text-gray-700 hover:bg-gray-100 p-1 rounded transition-colors flex items-center gap-1.5 text-gray-500" title="Copy">
              <Copy size={12} />
            </button>
            <span className="mx-1">·</span>
            <span>Rhythm AI</span>
            <span className="mx-1">·</span>
            <Timer isRunning={false} startTime={message.createdAt} finalMs={message.totalTimeMs} />
          </div>
        )}

        {/* Hover Actions - non-last messages show copy · model */}
        {!isLast && !message.isThinking && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-start mt-2 text-[11px] text-gray-400 absolute bottom-1 left-0 bg-white/80 pr-2">
            <button className="hover:text-gray-700 hover:bg-gray-100 p-1 rounded transition-colors flex items-center gap-1.5 text-gray-500" title="Copy">
              <Copy size={12} />
            </button>
            <span className="mx-1">·</span>
            <span>Rhythm AI</span>
          </div>
        )}
      </motion.div>
    </>
  );
};
