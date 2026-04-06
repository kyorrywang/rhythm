import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  MessageSquareQuote,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import { getToolPresentation } from '@/features/session/toolPresentation';
import { useDisplayStore } from '@/shared/state/useDisplayStore';
import { useSessionStore } from '@/shared/state/useSessionStore';
import type { Message, MessageSegment, ToolCall } from '@/shared/types/schema';
import { CodeBlock } from '@/shared/ui/CodeBlock';

interface AgentMessageProps {
  message: Message;
  isLast?: boolean;
  isSessionRunning?: boolean;
}

const Timer = ({ isRunning, startTime, finalMs }: { isRunning: boolean; startTime: number; finalMs?: number }) => {
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

const SegmentCard = ({
  icon,
  title,
  summary,
  running,
  timerStart,
  timerMs,
  defaultExpanded,
  children,
  tone = 'neutral',
  action,
}: {
  icon: React.ReactNode;
  title: string;
  summary?: string;
  running?: boolean;
  timerStart?: number;
  timerMs?: number;
  defaultExpanded: boolean;
  children?: React.ReactNode;
  tone?: 'neutral' | 'warning' | 'success';
  action?: React.ReactNode;
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);

  const bgClass = tone === 'warning'
    ? 'border-amber-200 bg-amber-50/70'
    : tone === 'success'
      ? 'border-emerald-200 bg-emerald-50/70'
      : 'border-slate-200 bg-white';

  return (
    <div className={`mb-3 overflow-hidden rounded-2xl border ${bgClass}`}>
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <button
          onClick={() => setIsExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <div className="mt-0.5 text-slate-500">{icon}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-slate-900">{title}</span>
              {running && <Loader2 size={12} className="animate-spin text-sky-500" />}
              {!running && timerStart !== undefined && (
                <span className="text-[11px] text-slate-400">
                  <Timer isRunning={false} startTime={timerStart} finalMs={timerMs} />
                </span>
              )}
              {running && timerStart !== undefined && (
                <span className="text-[11px] text-slate-400">
                  <Timer isRunning={true} startTime={timerStart} />
                </span>
              )}
            </div>
            {summary && (
              <div className="mt-1 truncate text-[12px] leading-5 text-slate-500">{summary}</div>
            )}
          </div>
          <div className="pt-0.5 text-slate-400">
            {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </div>
        </button>
        {action}
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-slate-100"
          >
            <div className="px-4 py-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ToolBlock = ({ tool }: { tool: ToolCall }) => {
  const isRunning = tool.status === 'running';
  const presentation = getToolPresentation(tool);
  const config = useDisplayStore((s) => s.preferences.toolCall);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const openWorkbench = useSessionStore((s) => s.openWorkbench);

  const defaultExpanded = isRunning
    ? config.whileRunning === 'expand'
    : config.whenDone === 'expand';

  if (tool.name === 'spawn_subagent') {
    return (
      <SegmentCard
        icon={<Sparkles size={15} />}
        title={presentation.title}
        summary={presentation.summary}
        running={false}
        timerStart={tool.startTime || Date.now()}
        timerMs={tool.executionTime}
        defaultExpanded={defaultExpanded}
        action={tool.subSessionId ? (
          <button
            onClick={() => setActiveSession(tool.subSessionId!)}
            className="rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 transition-colors hover:bg-sky-100"
          >
            进入子会话
          </button>
        ) : undefined}
      >
        <div className="text-sm leading-6 text-slate-600">
          {presentation.details || '子代理任务已创建，完成后可从这里进入对应子会话。'}
        </div>
      </SegmentCard>
    );
  }

  return (
    <SegmentCard
      icon={<TerminalSquare size={15} />}
      title={presentation.title}
      summary={presentation.summary}
      running={isRunning}
      timerStart={tool.startTime || Date.now()}
      timerMs={tool.executionTime}
      defaultExpanded={defaultExpanded}
      action={presentation.actionTarget ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            openWorkbench({
              isOpen: true,
              mode: presentation.actionTarget!.mode,
              title: presentation.actionTarget!.title,
              description: presentation.actionTarget!.description,
              content: presentation.actionTarget!.content,
              meta: presentation.actionTarget!.meta,
            });
          }}
          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          {presentation.actionLabel || '打开'}
        </button>
      ) : undefined}
      tone={tool.status === 'error' ? 'warning' : 'neutral'}
    >
      <div className="space-y-3">
        <div className="grid gap-3 text-[12px] text-slate-500 md:grid-cols-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">状态</div>
            <div className="mt-1 text-slate-700">
              {tool.status === 'running' ? '执行中' : tool.status === 'completed' ? '已完成' : '失败'}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">参数</div>
            <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
              {JSON.stringify(tool.arguments, null, 2)}
            </pre>
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">输出</div>
          <pre className="mt-1 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 px-3 py-3 text-[11px] leading-6 text-slate-100">
            {presentation.details || '暂无输出'}
          </pre>
        </div>
      </div>
    </SegmentCard>
  );
};

const AskSegment = ({ segment }: { segment: MessageSegment & { type: 'ask' } }) => {
  const isWaiting = segment.status === 'waiting';
  const config = useDisplayStore((s) => s.preferences.ask);
  const qaList = segment.questions && segment.questions.length > 0
    ? segment.questions
    : [{ question: segment.question, options: segment.options, selectionType: segment.selectionType }];

  const defaultExpanded = isWaiting
    ? config.whileRunning === 'expand'
    : config.whenDone === 'expand';

  return (
    <SegmentCard
      icon={<MessageSquareQuote size={15} />}
      title="Ask"
      summary={qaList[0]?.question || ''}
      running={isWaiting}
      timerStart={segment.startTime || Date.now()}
      timerMs={segment.timeCostMs}
      defaultExpanded={defaultExpanded}
      tone={isWaiting ? 'warning' : 'success'}
    >
      <div className="space-y-4">
        {qaList.map((q, qi) => (
          <div key={qi} className={qi > 0 ? 'border-t border-slate-100 pt-4' : ''}>
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">问题 {qi + 1}</div>
            <p className="mt-2 text-sm text-slate-800">{q.question}</p>
            {q.options.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {q.options.map((opt) => {
                  const selected = segment.answer?.selected.includes(opt);
                  return (
                    <span
                      key={opt}
                      className={`rounded-full px-3 py-1 text-xs ${
                        selected ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {opt}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {!isWaiting && (
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">回答结果</div>
            <p className="mt-2 text-sm text-slate-700">
              {segment.answer?.text || (segment.answer?.selected.length ? segment.answer.selected.join(', ') : '已忽略')}
            </p>
          </div>
        )}
      </div>
    </SegmentCard>
  );
};

const ThinkingSegment = ({ segment, isLive }: { segment: MessageSegment & { type: 'thinking' }; isLive: boolean }) => {
  const config = useDisplayStore((s) => s.preferences.thinking);
  const defaultExpanded = isLive
    ? config.whileRunning === 'expand'
    : config.whenDone === 'expand';

  return (
    <SegmentCard
      icon={<Sparkles size={15} />}
      title="Thinking"
      summary={segment.content ? segment.content.slice(0, 80) : '思考中...'}
      running={isLive}
      timerStart={segment.startTime || Date.now()}
      timerMs={segment.timeCostMs}
      defaultExpanded={defaultExpanded}
    >
      <div className="whitespace-pre-wrap text-[13px] leading-7 text-slate-600">
        {segment.content || '...'}
      </div>
    </SegmentCard>
  );
};

const PermissionSegment = ({ segment }: { segment: MessageSegment & { type: 'permission' } }) => {
  const icon = segment.status === 'approved'
    ? <ShieldCheck size={15} />
    : segment.status === 'denied'
      ? <ShieldX size={15} />
      : <ShieldAlert size={15} />;

  const tone = segment.status === 'approved'
    ? 'success'
    : segment.status === 'denied'
      ? 'warning'
      : 'warning';

  const summary = segment.status === 'waiting'
    ? `等待权限确认: ${segment.request.toolName}`
    : `${segment.request.toolName} 已${segment.status === 'approved' ? '允许' : '拒绝'}`;

  return (
    <SegmentCard
      icon={icon}
      title="Permission"
      summary={summary}
      running={segment.status === 'waiting'}
      timerStart={segment.startTime || Date.now()}
      defaultExpanded
      tone={tone}
    >
      <div className="space-y-3 text-sm text-slate-700">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">工具</div>
          <p className="mt-1">{segment.request.toolName}</p>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">原因</div>
          <p className="mt-1 leading-6">{segment.request.reason}</p>
        </div>
      </div>
    </SegmentCard>
  );
};

export const AgentMessage = ({ message, isLast, isSessionRunning }: AgentMessageProps) => {
  const isMessageRunning = isSessionRunning && isLast;
  const isMessageComplete = !isSessionRunning && isLast;
  const segments = message.segments || [];

  const handleCopy = async () => {
    const text = segments
      .filter((segment) => segment.type === 'text')
      .map((segment) => segment.content)
      .join('\n\n');

    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Ignore clipboard failures in the presentation layer.
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="group relative ml-2 flex flex-col pb-8 pt-2"
    >
      <div className="mb-4 flex items-center gap-3 text-xs text-slate-400">
        <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-slate-900 text-white">
          <Sparkles size={15} />
        </div>
        <span className="font-medium text-slate-700">Rhythm AI</span>
        <span className="text-slate-300">•</span>
        <span>{new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      <div className="relative">
        {segments.map((segment, index) => (
          <div key={index}>
            {segment.type === 'thinking' && <ThinkingSegment segment={segment} isLive={segment.isLive || false} />}
            {segment.type === 'tool' && <ToolBlock tool={segment.tool} />}
            {segment.type === 'ask' && <AskSegment segment={segment} />}
            {segment.type === 'permission' && <PermissionSegment segment={segment} />}
            {segment.type === 'text' && segment.content && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-[0_16px_40px_rgba(15,23,42,0.04)]"
              >
                <div className="prose prose-sm max-w-none text-slate-800">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '');
                        return match ? (
                          <CodeBlock
                            language={match[1]}
                            code={String(children).replace(/\n$/, '')}
                          />
                        ) : (
                          <code {...props} className={`${className || ''} rounded-md bg-slate-100 px-1.5 py-0.5 text-sm text-fuchsia-700 font-mono`}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {segment.content}
                  </ReactMarkdown>
                </div>
              </motion.div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 h-6 flex-col justify-center">
        {isMessageRunning ? (
          <div className="flex items-center text-[12px] text-slate-400">
            <Loader2 size={14} className="animate-spin text-slate-400" />
            <span className="mx-2">·</span>
            <Timer isRunning startTime={message.createdAt} />
          </div>
        ) : (
          <div className="flex items-center text-[12px] text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={handleCopy}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              title="Copy"
            >
              <Copy size={14} />
            </button>
            <span className="mx-2 text-slate-300">|</span>
            <span>Rhythm AI</span>
            {isMessageComplete && (
              <>
                <span className="mx-2 text-slate-300">·</span>
                <Timer isRunning={false} startTime={message.createdAt} finalMs={message.totalTimeMs} />
              </>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};
