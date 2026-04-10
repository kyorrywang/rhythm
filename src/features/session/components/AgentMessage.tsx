import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { getToolPresentation } from '@/features/session/toolPresentation';
import { createPluginContext } from '@/plugin/host/createPluginContext';
import type { MessageActionContribution, ToolResultActionContribution } from '@/plugin/sdk';
import { usePluginHostStore } from '@/plugin/host/usePluginHostStore';
import { themeRecipes } from '@/shared/theme/recipes';
import { useDisplayStore } from '@/shared/state/useDisplayStore';
import { useSessionStore } from '@/shared/state/useSessionStore';
import { usePermissionStore } from '@/shared/state/usePermissionStore';
import { approvePermission } from '@/shared/api/commands';
import { resolvePermissionGrantSessionId } from '@/shared/lib/sessionPermissions';
import type { Message, MessageSegment, ToolCall } from '@/shared/types/schema';
import { Badge, Button, CopyIconButton } from '@/shared/ui';
import { CodeBlock } from '@/shared/ui/CodeBlock';

interface AgentMessageProps {
  message: Message;
  sessionId: string;
  isLast?: boolean;
  isSessionRunning?: boolean;
}

type TextRenderBlock =
  | { type: 'markdown'; content: string }
  | { type: 'tool'; tool: ToolCall };

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
    <div className="border-t-[var(--theme-divider-width)] border-[var(--theme-border)] first:border-t-0">
      <div className="flex items-baseline justify-between gap-[var(--theme-toolbar-gap)] py-[var(--theme-toolbar-gap)]">
        <div
          onClick={() => canExpand && setIsExpanded((v) => !v)}
          onKeyDown={(event) => {
            if (!canExpand || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            setIsExpanded((v) => !v);
          }}
          className={`flex min-w-0 flex-1 items-baseline gap-[calc(var(--theme-toolbar-gap)*0.5)] text-left text-[length:var(--theme-body-size)] leading-6 ${canExpand ? 'cursor-pointer' : ''}`}
          role={canExpand ? 'button' : undefined}
          tabIndex={canExpand ? 0 : undefined}
        >
          <span className={`shrink-0 ${themeRecipes.sectionTitle()}`}>{title}</span>
          {summary && <span className={`min-w-0 truncate ${themeRecipes.description()}`}>{summary}</span>}
          <span className="shrink-0 text-[length:var(--theme-meta-size)] text-[var(--theme-text-muted)]">
            {timerStart !== undefined && <Timer isRunning={Boolean(running)} startTime={timerStart} finalMs={timerMs} />}
          </span>
          {canExpand && (
            <span className="-ml-0.5 shrink-0 text-[var(--theme-text-muted)]">
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
            <div className="pb-[var(--theme-section-gap)] pr-1">
              <div className={`${themeRecipes.mutedCard()} px-[var(--theme-card-padding-x)] py-[var(--theme-card-padding-y)]`}>
                {children}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ToolBlock = ({ tool, sessionId }: { tool: ToolCall; sessionId: string }) => {
  const isRunning = tool.status === 'running';
  const presentation = getToolPresentation(tool);
  const config = useDisplayStore((s) => s.preferences.toolCall);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const toolResultActions = usePluginHostStore((s) => s.toolResultActions);
  const orchestratorSummary = renderOrchestratorSummary(tool);

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

  if (orchestratorSummary) {
    return (
      <SegmentCard
        title={orchestratorSummary.title}
        summary={orchestratorSummary.summary}
        running={isRunning}
        timerStart={tool.startTime || Date.now()}
        timerMs={tool.executionTime}
        defaultExpanded={defaultExpanded}
        action={<ToolActionButtons actions={toolResultActions} tool={tool} sessionId={sessionId} />}
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
      action={<ToolActionButtons actions={toolResultActions} tool={tool} sessionId={sessionId} />}
    >
      <div className="space-y-[var(--theme-toolbar-gap)]">
        <div className="grid gap-[var(--theme-toolbar-gap)] text-[length:var(--theme-meta-size)] text-[var(--theme-text-secondary)] md:grid-cols-3">
          <div>
            <div className={themeRecipes.eyebrow()}>状态</div>
            <div className="mt-1">
              <Badge tone={tool.status === 'running' ? 'warning' : tool.status === 'completed' ? 'success' : 'danger'}>
                {tool.status === 'running' ? '执行中' : tool.status === 'completed' ? '已完成' : '失败'}
              </Badge>
            </div>
          </div>
          <div className="md:col-span-2">
            <div className={themeRecipes.eyebrow()}>参数</div>
            <pre className="mt-1 whitespace-pre-wrap rounded-[var(--theme-radius-control)] bg-[var(--theme-surface)] px-[var(--theme-control-padding-x-sm)] py-[calc(var(--theme-row-padding-y)*0.7)] text-[length:var(--theme-meta-size)] leading-5 text-[var(--theme-text-secondary)]">
              {JSON.stringify(tool.arguments, null, 2)}
            </pre>
          </div>
        </div>
        <div>
          <div className={themeRecipes.eyebrow()}>输出</div>
          <pre className="mt-1 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-[var(--theme-radius-control)] bg-[var(--theme-accent)] px-[var(--theme-control-padding-x-sm)] py-[var(--theme-card-padding-y)] text-[length:var(--theme-meta-size)] leading-6 text-[var(--theme-accent-contrast)]">
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
      <div className="space-y-[var(--theme-section-gap)]">
        {qaList.map((q, qi) => (
          <div key={qi} className={qi > 0 ? 'border-t-[var(--theme-divider-width)] border-[var(--theme-border)] pt-[var(--theme-section-gap)]' : ''}>
            <div className={themeRecipes.eyebrow()}>问题 {qi + 1}</div>
            <p className={`mt-[var(--theme-toolbar-gap)] ${themeRecipes.description()}`}>{q.question}</p>
            {q.options.length > 0 && (
              <div className="mt-[var(--theme-toolbar-gap)] flex flex-wrap gap-[var(--theme-toolbar-gap)]">
                {q.options.map((opt) => {
                  const selected = segment.answer?.selected.includes(opt);
                  return (
                    <Badge key={opt} tone={selected ? 'success' : 'muted'}>
                      {opt}
                    </Badge>
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
      <div className={`whitespace-pre-wrap leading-7 ${themeRecipes.description()}`}>
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
      const grantSessionId = resolvePermissionGrantSessionId(
        useSessionStore.getState().sessions,
        sessionId,
      );
      grantSessionPermission(grantSessionId, segment.request.toolName);
    }
    await approvePermission({ toolId: segment.request.toolId, approved });
    resolvePending(segment.request.toolId, approved);
    resolvePermissionRequestInTimeline(sessionId, segment.request.toolId, approved);
    updateSession(sessionId, {
      phase: 'streaming',
      permissionPending: false,
      runtime: {
        state: 'streaming',
        message: '正在流式生成。',
        updatedAt: Date.now(),
      },
    });
  };

  return (
    <SegmentCard
      title="Permission"
      summary={summary}
      running={isWaiting}
      defaultExpanded
    >
      <div className={`space-y-[var(--theme-toolbar-gap)] ${themeRecipes.description()}`}>
        <div>
          <div className={themeRecipes.eyebrow()}>工具</div>
          <p className="mt-1">{segment.request.toolName}</p>
        </div>
        <div>
          <div className={themeRecipes.eyebrow()}>原因</div>
          <p className="mt-1 leading-6">{segment.request.reason}</p>
        </div>
        {isWaiting && (
          <div className="flex flex-wrap items-center justify-between gap-[var(--theme-toolbar-gap)] border-t-[var(--theme-divider-width)] border-[var(--theme-border)] pt-[var(--theme-toolbar-gap)]">
            <label className="flex cursor-pointer items-center gap-[var(--theme-toolbar-gap)] text-[length:var(--theme-meta-size)] text-[var(--theme-text-secondary)]">
              <input
                type="checkbox"
                checked={alwaysAllow}
                onChange={(event) => setAlwaysAllow(event.target.checked)}
                className="rounded border-[var(--theme-border-strong)]"
              />
              本会话始终允许此工具
            </label>
            <div className={themeRecipes.toolbar()}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void resolve(false)}
              >
                拒绝
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void resolve(true)}
                className="bg-[var(--theme-warning-text)] hover:bg-[color:color-mix(in_srgb,var(--theme-warning-text)_88%,black)]"
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

const RetryStatusSegment = ({ segment }: { segment: Extract<MessageSegment, { type: 'retry' }> }) => {
  const badgeLabel =
    segment.state === 'retrying'
      ? '重试中'
      : '429 限流';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="border-t-[var(--theme-divider-width)] border-[var(--theme-border)] py-[var(--theme-section-gap)] first:border-t-0"
    >
      <div className={`${themeRecipes.mutedCard()} flex items-center justify-between gap-3 px-[var(--theme-card-padding-x)] py-[var(--theme-card-padding-y)]`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone={segment.state === 'retrying' ? 'default' : 'warning'}>
              {badgeLabel}
            </Badge>
            <span className="text-xs text-[var(--theme-text-muted)]">第 {Math.max(segment.attempt, 1)} 次</span>
          </div>
          <div className="mt-2 text-sm text-[var(--theme-text-primary)]">
            {segment.message}
          </div>
        </div>
        {typeof segment.retryInSeconds === 'number' && segment.retryInSeconds > 0 && (
          <div className="shrink-0 text-right">
            <div className="text-2xl font-semibold text-[var(--theme-accent)]">{segment.retryInSeconds}</div>
            <div className="text-xs text-[var(--theme-text-muted)]">秒后重试</div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

function tryParseInlineToolPayload(raw: string) {
  const jsonMatches = raw.match(/\{[\s\S]*\}/g) || [];
  for (const candidate of jsonMatches) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

function matchStringField(raw: string, keys: string[]) {
  for (const key of keys) {
    const quoted = new RegExp(`["']${key}["']\\s*[:=]\\s*["']([^"']+)["']`, 'i').exec(raw);
    if (quoted?.[1]) return quoted[1];
    const plain = new RegExp(`${key}\\s*[:=]\\s*([^\\n>]+)`, 'i').exec(raw);
    if (plain?.[1]) return plain[1].trim();
  }
  return '';
}

function buildInlineToolCall(raw: string, index: number, startTime: number): ToolCall | null {
  const parsed = tryParseInlineToolPayload(raw);
  const toolName = String(
    parsed?.name
    || parsed?.tool
    || parsed?.tool_name
    || matchStringField(raw, ['name', 'tool', 'tool_name']),
  ).trim();

  const mappedName = toolName === 'write_file' ? 'write' : toolName === 'edit_file' ? 'edit' : toolName === 'read_file' ? 'read' : toolName;
  if (!['write', 'edit', 'read', 'delete'].includes(mappedName)) {
    return null;
  }

  const argumentsObject = (() => {
    if (parsed && typeof parsed === 'object') {
      const path = String(parsed.path || parsed.file || parsed.target_path || '').trim();
      const content = String(parsed.content || parsed.text || '').trim();
      const search = String(parsed.search || '').trim();
      const replace = String(parsed.replace || '').trim();
      return { path, content, search, replace };
    }
    return {
      path: matchStringField(raw, ['path', 'file', 'target_path']),
      content: matchStringField(raw, ['content', 'text']),
      search: matchStringField(raw, ['search']),
      replace: matchStringField(raw, ['replace']),
    };
  })();

  return {
    id: `provisional-inline-tool-${index}`,
    name: mappedName,
    arguments: argumentsObject,
    status: 'running',
    logs: ['Waiting for the actual tool execution to start.'],
    startTime,
  };
}

function buildTextRenderBlocks(content: string, startTime: number): TextRenderBlock[] {
  const blocks: TextRenderBlock[] = [];
  const pattern = /<(?:minimax:tool_call|invoke)\b[\s\S]*?(?:<\/(?:minimax:tool_call|invoke)>|$)/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let inlineIndex = 0;

  while ((match = pattern.exec(content)) !== null) {
    const before = content.slice(cursor, match.index);
    if (before) {
      blocks.push({ type: 'markdown', content: before });
    }
    const tool = buildInlineToolCall(match[0], inlineIndex++, startTime);
    if (tool) {
      blocks.push({ type: 'tool', tool });
    } else {
      blocks.push({ type: 'markdown', content: match[0] });
    }
    cursor = match.index + match[0].length;
  }

  const tail = content.slice(cursor);
  if (tail) {
    blocks.push({ type: 'markdown', content: tail });
  }

  return blocks.length > 0 ? blocks : [{ type: 'markdown', content }];
}

const renderOrchestratorSummary = (tool: ToolCall): { title: string; summary: React.ReactNode } | null => {
  if (
    tool.name !== 'orchestrator.createPlanDraft'
    && tool.name !== 'orchestrator.createPlanDraftFromSession'
    && tool.name !== 'orchestrator.updatePlanDraft'
    && tool.name !== 'orchestrator.getPlanDraft'
    && tool.name !== 'orchestrator.confirmPlanDraft'
    && tool.name !== 'orchestrator.getRun'
    && tool.name !== 'orchestrator.pauseRun'
    && tool.name !== 'orchestrator.resumeRun'
    && tool.name !== 'orchestrator.cancelRun'
    && tool.name !== 'orchestrator.createTemplate'
    && tool.name !== 'orchestrator.createSampleNovelTemplate'
    && tool.name !== 'orchestrator.createSampleSoftwareTemplate'
    && tool.name !== 'orchestrator.updateTemplate'
    && tool.name !== 'orchestrator.duplicateTemplate'
  ) {
    return null;
  }

  const ctx = createPluginContext('orchestrator');
  const parsed = parseToolResult(tool);

  if (isOrchestratorPlanDraftResult(parsed)) {
    return {
      title: '计划草稿',
      summary: (
        <span className="flex min-w-0 items-center gap-2">
          <Button
            variant="link"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              ctx.ui.workbench.open({
                id: `orchestrator.plan-draft:${parsed.id}`,
                viewId: 'orchestrator.plan-draft',
                title: parsed.title || parsed.goal || 'Plan Draft',
                description: parsed.status,
                payload: { planDraft: parsed },
                layoutMode: 'replace',
              });
            }}
            className="min-w-0 truncate text-[13px] leading-6"
          >
            {parsed.title || parsed.goal || '打开计划草稿'}
          </Button>
          <Badge tone={parsed.status === 'confirmed' ? 'success' : 'warning'}>
            {parsed.status}
          </Badge>
        </span>
      ),
    };
  }

  if (isOrchestratorRunResult(parsed)) {
    return {
      title: 'Agent 编排器',
      summary: (
        <span className="flex min-w-0 items-center gap-2">
          <Button
            variant="link"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              ctx.ui.workbench.open({
                id: `orchestrator.run:${parsed.id}`,
                viewId: 'orchestrator.run',
                title: parsed.goal || 'Run',
                description: parsed.planTitle,
                payload: { run: parsed },
                layoutMode: 'replace',
              });
            }}
            className="min-w-0 truncate text-[13px] leading-6"
          >
            {parsed.goal || parsed.planTitle || '打开运行'}
          </Button>
          <Badge tone={mapRunStatusTone(parsed.status)}>
            {parsed.status}
          </Badge>
          {parsed.currentStageName ? (
            <span className="truncate text-[12px] text-[var(--theme-text-muted)]">{parsed.currentStageName}</span>
          ) : null}
          {(parsed.lastHumanInterventionSummary || parsed.engineHealthSummary || parsed.lastDecisionSummary) ? (
            <span className="truncate text-[12px] text-[var(--theme-text-muted)]">
              {parsed.lastHumanInterventionSummary || parsed.engineHealthSummary || parsed.lastDecisionSummary}
            </span>
          ) : null}
        </span>
      ),
    };
  }

  if (isOrchestratorTemplateResult(parsed)) {
    return {
      title: 'Agent 编排器模板',
      summary: (
        <Button
          variant="link"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            ctx.ui.workbench.open({
              id: `orchestrator.template:${parsed.id}`,
              viewId: 'orchestrator.template',
              title: parsed.name || 'Template',
              description: parsed.domain,
              payload: { template: parsed },
              layoutMode: 'replace',
            });
          }}
          className="min-w-0 truncate text-[13px] leading-6"
        >
          {parsed.name || '打开模板'}
        </Button>
      ),
    };
  }

  return null;
};

const parseToolResult = (tool: ToolCall): unknown => {
  if (!tool.result) return null;
  try {
    const parsed = JSON.parse(tool.result) as { ok?: boolean; data?: unknown } | unknown;
    if (parsed && typeof parsed === 'object' && 'data' in parsed) {
      return (parsed as { data?: unknown }).data;
    }
    return parsed;
  } catch {
    return null;
  }
};

const isOrchestratorRunResult = (value: unknown): value is {
  id: string;
  goal?: string;
  planTitle?: string;
  status: string;
  currentStageName?: string;
  lastDecisionSummary?: string;
  engineHealthSummary?: string;
  lastHumanInterventionSummary?: string;
} => Boolean(
  value
  && typeof value === 'object'
  && 'id' in value
  && 'planId' in value
  && 'status' in value,
);

const isOrchestratorPlanDraftResult = (value: unknown): value is {
  id: string;
  title?: string;
  goal?: string;
  status: string;
} => Boolean(
  value
  && typeof value === 'object'
  && 'id' in value
  && 'goal' in value
  && 'overview' in value
  && 'stages' in value,
);

const mapRunStatusTone = (status: string): 'success' | 'warning' | 'danger' | 'muted' => {
  if (status === 'completed') return 'success';
  if (status === 'running' || status === 'pause_requested') return 'warning';
  if (status === 'failed' || status === 'cancelled' || status === 'interrupted') return 'danger';
  return 'muted';
};

const isOrchestratorTemplateResult = (value: unknown): value is {
  id: string;
  name?: string;
  domain?: string;
} => Boolean(
  value
  && typeof value === 'object'
  && 'id' in value
  && 'stageRows' in value
  && 'domain' in value,
);

const ToolActionButtons = ({
  actions,
  tool,
  sessionId,
}: {
  actions: ToolResultActionContribution[];
  tool: ToolCall;
  sessionId: string;
}) => {
  const visibleActions = actions
    .filter((action) => {
      try {
        const ctx = createPluginContext(action.pluginId || 'unknown');
        return action.when ? action.when({ ctx, tool, sessionId }) : true;
      } catch {
        return false;
      }
    })
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  if (visibleActions.length === 0) return null;

  return (
    <div className={themeRecipes.toolbar()}>
      {visibleActions.map((action) => (
        <PluginActionButton
          key={action.id}
          title={action.title}
          danger={action.danger}
          onRun={() => action.run({ ctx: createPluginContext(action.pluginId || 'unknown'), tool, sessionId })}
          pluginId={action.pluginId || 'unknown'}
        />
      ))}
    </div>
  );
};

export const AgentMessage = ({ message, sessionId, isLast, isSessionRunning }: AgentMessageProps) => {
  const isMessageRunning = Boolean(isSessionRunning && isLast);
  const isMessageComplete = !isSessionRunning && isLast;
  const segments = message.segments || [];
  const modelName = message.model || 'Rhythm AI';
  const messageActions = usePluginHostStore((s) => s.messageActions);
  const copyText = segments
    .filter((segment) => segment.type === 'text')
    .map((segment) => segment.content)
    .join('\n\n');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="group relative ml-2 flex flex-col pb-8 pt-2"
    >
      <div className={`${themeRecipes.workbenchSurface()} px-[var(--theme-panel-padding-x)] py-[var(--theme-panel-padding-y)]`}>
        <div className={`mb-[var(--theme-toolbar-gap)] flex items-center gap-[var(--theme-toolbar-gap)] text-[length:var(--theme-meta-size)] text-[var(--theme-text-muted)]`}>
          <div className="flex h-8 w-8 items-center justify-center rounded-[var(--theme-radius-card)] bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)]">
            <Sparkles size={15} />
          </div>
          <span className="font-medium text-[var(--theme-text-secondary)]">Rhythm AI</span>
          <span className="text-[var(--theme-border-strong)]">•</span>
          <span>{new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        <div className="relative">
          {segments.map((segment, index) => (
            <div key={index}>
              {segment.type === 'thinking' && <ThinkingSegment segment={segment} isLive={segment.isLive || false} />}
              {segment.type === 'tool' && <ToolBlock tool={segment.tool} sessionId={sessionId} />}
              {segment.type === 'ask' && <AskSegment segment={segment} />}
              {segment.type === 'permission' && <PermissionSegment segment={segment} sessionId={sessionId} />}
              {segment.type === 'retry' && <RetryStatusSegment segment={segment} />}
              {segment.type === 'text' && segment.content && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="border-t-[var(--theme-divider-width)] border-[var(--theme-border)] py-[var(--theme-section-gap)] first:border-t-0"
                >
                  {buildTextRenderBlocks(segment.content, message.createdAt).map((block, blockIndex) => (
                    <div key={blockIndex}>
                      {block.type === 'tool' ? (
                        <ToolBlock tool={block.tool} sessionId={sessionId} />
                      ) : (
                        <div className="prose prose-sm max-w-none text-[var(--theme-text-primary)]">
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
                                  <code className="rounded-[calc(var(--theme-radius-control)*0.7)] bg-[var(--theme-surface-muted)] px-1.5 py-0.5 font-mono text-[0.92em] text-[var(--theme-accent)]">
                                    {children}
                                  </code>
                                );
                              },
                            }}
                          >
                            {block.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-[var(--theme-toolbar-gap)] h-6 flex-col justify-center">
        <div className="flex items-center text-[length:var(--theme-meta-size)] text-[var(--theme-text-muted)]">
          <CopyIconButton text={copyText} />
          <span className="mx-2 text-[var(--theme-border-strong)]">|</span>
          <span>{modelName}</span>
          <span className="mx-2 text-[var(--theme-border-strong)]">·</span>
          <Timer
            isRunning={isMessageRunning}
            startTime={message.createdAt}
            finalMs={isMessageComplete ? message.totalTimeMs : undefined}
          />
          <MessageActionButtons actions={messageActions} message={message} sessionId={sessionId} />
        </div>
      </div>
    </motion.div>
  );
};

const MessageActionButtons = ({
  actions,
  message,
  sessionId,
}: {
  actions: MessageActionContribution[];
  message: Message;
  sessionId: string;
}) => {
  const visibleActions = actions
    .filter((action) => {
      try {
        const ctx = createPluginContext(action.pluginId || 'unknown');
        return action.when ? action.when({ ctx, message, sessionId }) : true;
      } catch {
        return false;
      }
    })
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  if (visibleActions.length === 0) return null;

  return (
    <>
      <span className="mx-2 text-[var(--theme-border-strong)]">|</span>
      {visibleActions.map((action) => (
        <PluginActionButton
          key={action.id}
          title={action.title}
          danger={action.danger}
          onRun={() => action.run({ ctx: createPluginContext(action.pluginId || 'unknown'), message, sessionId })}
          pluginId={action.pluginId || 'unknown'}
        />
      ))}
    </>
  );
};

const PluginActionButton = ({
  title,
  danger,
  pluginId,
  onRun,
}: {
  title: string;
  danger?: boolean;
  pluginId: string;
  onRun: () => void | Promise<void>;
}) => {
  const [isRunning, setIsRunning] = useState(false);

  return (
    <Button
      variant="link"
      size="sm"
      disabled={isRunning}
      onClick={(event) => {
        event.stopPropagation();
        setIsRunning(true);
        void Promise.resolve(onRun())
          .catch((error) => {
            usePluginHostStore.getState().reportPluginError(pluginId, error);
          })
          .finally(() => setIsRunning(false));
      }}
      className={`${danger ? 'text-[var(--theme-danger-text)]' : 'text-[var(--theme-text-secondary)]'}`}
    >
      {isRunning ? 'Running...' : title}
    </Button>
  );
};
