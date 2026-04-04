import { useState } from 'react';
import { Loader2, ChevronRight, ChevronDown, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, ToolCall } from '@/types/schema';

interface AgentMessageProps {
  message: Message;
}

const ToolBlock = ({ tool }: { tool: ToolCall }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div>
      <div 
        className="flex items-center gap-2 cursor-pointer select-none hover:text-gray-600 w-fit"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="font-bold capitalize">{tool.name}</span>
        {tool.arguments && (
          <span className="font-mono text-[12px] text-gray-600 truncate max-w-[200px]">
            {JSON.stringify(tool.arguments)}
          </span>
        )}
        <span className="text-gray-500">
          {tool.status === 'running' ? <Loader2 size={12} className="animate-spin inline ml-1 mr-0.5" /> : null}
        </span>
        {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
      </div>
      
      <AnimatePresence>
        {isExpanded && tool.logs && tool.logs.length > 0 && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-2"
          >
            <div className="text-[13px] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 max-w-[95%] max-h-[150px] overflow-y-auto custom-scrollbar font-mono text-[12px] whitespace-pre-wrap">
              {tool.logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const AgentMessage = ({ message }: AgentMessageProps) => {
  const [isThinkingExpanded, setThinkingExpanded] = useState(true);

  return (
    <>
      {/* Thinking Phase */}
      {(message.isThinking || message.thinkingTimeCostMs) && (
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
              <>
                <Loader2 size={14} className="animate-spin text-blue-600" />
                <span className="font-medium text-blue-600">正在思考中</span>
              </>
            ) : (
              <span className="font-bold text-gray-800">已思考</span>
            )}
            {message.thinkingTimeCostMs && <span className={message.isThinking ? "text-gray-500" : "text-gray-800"}>{(message.thinkingTimeCostMs / 1000).toFixed(1)}s</span>}
            {isThinkingExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
          </button>
          
          <AnimatePresence>
            {isThinkingExpanded && message.isThinking && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mt-2"
              >
                <div className="text-[13px] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 max-w-[95%] max-h-[150px] overflow-y-auto custom-scrollbar">
                  <p className="animate-pulse">正在生成执行规划...</p>
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
        className="group relative pt-4 ml-4 pr-12 pb-6 border-transparent"
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

        {/* Hover Actions */}
        {!message.isThinking && (
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
