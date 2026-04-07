import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Sparkles,
} from 'lucide-react';
import { getToolPresentation } from '@/features/session/toolPresentation';
import { useDisplayStore } from '@/shared/state/useDisplayStore';
import { useSessionStore } from '@/shared/state/useSessionStore';
import { usePermissionStore } from '@/shared/state/usePermissionStore';
import { approvePermission } from '@/shared/api/commands';
import type { Message, MessageSegment, ToolCall } from '@/shared/types/schema';
import { Button } from '@/shared/ui/Button';
import { CodeBlock } from '@/shared/ui/CodeBlock';

interface AgentMessageProps {
  message: Message;
  sessionId: string;
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
  title,
  summary,
  running,
  timerStart,
  timerMs,
  defaultExpanded,
  children,
  action,
}: {
  title: string;
  summary?: React.ReactNode;
  running?: boolean;
  timerStart?: number;
  timerMs?: number;
  defaultExpanded: boolean;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const canExpand = Boolean(children);

  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);

  return (
    <div className="border-t border-slate-100 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3 py-3">
        <div
          onClick={() => canExpand && setIsExpanded((v) => !v)}
          onKeyDown={(event) => {
            if (!canExpand || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            setIsExpanded((v) => !v);
          }}
          className={`flex min-w-0 flex-1 items-baseline gap-1 text-left text-[13px] leading-6 ${canExpand ? 'cursor-pointer' : ''}`}
          role={canExpand ? 'button' : undefined}
          tabIndex={canExpand ? 0 : undefined}
        >
          <span className="shrink-0 font-semibold text-slate-900">{title}</span>
          {summary && <span className="min-w-0 truncate text-slate-600">{summary}</span>}
          <span className="shrink-0 text-[11px] text-slate-400">
            {timerStart !== undefined && <Timer isRunning={Boolean(running)} startTime={timerStart} finalMs={timerMs} />}
          </span>
          {canExpand && (
            <span className="-ml-0.5 shrink-0 text-slate-400">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          )}
        </div>
        {action}
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pb-4 pr-1">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                {children}
              </div>
            </div>
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
    const subagentSummary = tool.subSessionId ? (
      <Button
        variant="link"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          setActiveSession(tool.subSessionId!);
        }}
        className="min-w-0 truncate text-[13px] leading-6"
      >
        {presentation.summary || '打开子会话'}
      </Button>
    ) : presentation.summary;

    return (
      <SegmentCard
        title="Dynamic智能体"
        summary={subagentSummary}
        running={false}
        timerStart={tool.startTime || Date.now()}
        timerMs={tool.executionTime}
        defaultExpanded={defaultExpanded}
      />
    );
  }

  return (
    <SegmentCard
      title={presentation.title}
      summary={presentation.summary}
      running={isRunning}
      timerStart={tool.startTime || Date.now()}
      timerMs={tool.executionTime}
      defaultExpanded={defaultExpanded}
      action={presentation.actionTarget ? (
        <Button
          variant="link"
          size="sm"
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
          className="text-[12px]"
        >
          {presentation.actionLabel || '打开 Workbench'}
        </Button>
      ) : undefined}
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
  const title = segment.title.trim();

  const defaultExpanded = isWaiting
    ? config.whileRunning === 'expand'
    : config.whenDone === 'expand';

  return (
    <SegmentCard
      title="Ask"
      summary={title}
      running={isWaiting}
      defaultExpanded={defaultExpanded}
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
      title="Thinking"
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

const PermissionSegment = ({
  segment,
  sessionId,
}: {
  segment: MessageSegment & { type: 'permission' };
  sessionId: string;
}) => {
  const [alwaysAllow, setAlwaysAllow] = useState(false);
  const resolvePending = usePermissionStore((s) => s.resolvePending);
  const resolvePermissionRequestInTimeline = useSessionStore((s) => s.resolvePermissionRequestInTimeline);
  const updateSession = useSessionStore((s) => s.updateSession);
  const grantSessionPermission = useSessionStore((s) => s.grantSessionPermission);
  const isWaiting = segment.status === 'waiting';

  const summary = segment.status === 'waiting'
    ? `等待权限确认: ${segment.request.toolName}`
    : `${segment.request.toolName} 已${segment.status === 'approved' ? '允许' : '拒绝'}`;

  const resolve = async (approved: boolean) => {
    if (!isWaiting) return;
    if (approved && alwaysAllow) {
      grantSessionPermission(sessionId, segment.request.toolName);
    }
    await approvePermission({ toolId: segment.request.toolId, approved });
    resolvePending(segment.request.toolId, approved);
    resolvePermissionRequestInTimeline(sessionId, segment.request.toolId, approved);
    updateSession(sessionId, {
      phase: 'streaming',
      permissionPending: false,
    });
  };

  return (
    <SegmentCard
      title="Permission"
      summary={summary}
      running={isWaiting}
      defaultExpanded
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
        {isWaiting && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={alwaysAllow}
                onChange={(event) => setAlwaysAllow(event.target.checked)}
                className="rounded border-slate-300"
              />
              本会话始终允许此工具
            </label>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void resolve(false)}
                className="rounded-xl text-xs text-slate-500 hover:text-slate-800"
              >
                拒绝
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void resolve(true)}
                className="rounded-xl bg-amber-600 text-xs hover:bg-amber-700"
              >
                允许
              </Button>
            </div>
          </div>
        )}
      </div>
    </SegmentCard>
  );
};

export const AgentMessage = ({ message, sessionId, isLast, isSessionRunning }: AgentMessageProps) => {
  const [copied, setCopied] = useState(false);
  const isMessageRunning = Boolean(isSessionRunning && isLast);
  const isMessageComplete = !isSessionRunning && isLast;
  const segments = message.segments || [];
  const modelName = message.model || 'Rhythm AI';

  const handleCopy = async () => {
    const text = segments
      .filter((segment) => segment.type === 'text')
      .map((segment) => segment.content)
      .join('\n\n');

    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
      <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
        <div className="mb-3 flex items-center gap-3 text-xs text-slate-400">
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
              {segment.type === 'permission' && <PermissionSegment segment={segment} sessionId={sessionId} />}
              {segment.type === 'text' && segment.content && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="border-t border-slate-100 first:border-t-0 py-4"
                >
                  <div className="prose prose-sm max-w-none text-slate-800">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        pre({ children }) {
                          return <>{children}</>;
                        },
                        code({ inline, className, children }: any) {
                          const match = /language-(\w+)/.exec(className || '');
                          const code = String(children).replace(/\n$/, '');
                          const isBlock = !inline && (match || String(children).includes('\n'));

                          return isBlock ? (
                            <CodeBlock
                              language={match?.[1] || 'text'}
                              code={code}
                            />
                          ) : (
                            <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.92em] text-fuchsia-700">
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
      </div>

      <div className="mt-3 h-6 flex-col justify-center">
        <div className="flex items-center text-[12px] text-slate-400">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            className="h-7 w-7 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Copy"
          >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </Button>
          <span className="mx-2 text-slate-300">|</span>
          <span>{modelName}</span>
          <span className="mx-2 text-slate-300">·</span>
          <Timer
            isRunning={isMessageRunning}
            startTime={message.createdAt}
            finalMs={isMessageComplete ? message.totalTimeMs : undefined}
          />
        </div>
      </div>
    </motion.div>
  );
};
