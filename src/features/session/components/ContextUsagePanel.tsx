import { useState } from 'react';
import { X } from 'lucide-react';
import { Message, MessageSegment, Session } from '@/shared/types/schema';
import { formatTokenCount, formatPercentage } from '@/shared/lib/formatters';
import { DEFAULT_MAX_TOKENS } from '@/shared/lib/constants';
import { themeRecipes } from '@/shared/theme/recipes';
import { Button } from '@/shared/ui/Button';
import { getMessageTextContent } from '@/shared/lib/sessionState';

interface ContextUsagePanelProps {
  session: Session;
  isOpen: boolean;
  onClose: () => void;
}

export const ContextUsagePanel = ({ session, isOpen, onClose }: ContextUsagePanelProps) => {
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null);

  const messages = session.messages || [];
  const userMessages = messages.filter(m => m.role === 'user').length;
  const assistantMessages = messages.filter(m => m.role === 'assistant').length;
  const usage = session.usage;
  const estimatedUsage = estimateUsageFromMessages(messages);
  const isEstimatedUsage = !usage;

  const inputTokens = usage?.inputTokens ?? estimatedUsage.inputTokens;
  const outputTokens = usage?.outputTokens ?? estimatedUsage.outputTokens;
  const totalTokens = inputTokens + outputTokens;
  const contextLimit = DEFAULT_MAX_TOKENS;

  const toolCallCount = estimatedUsage.toolCallCount;
  const toolTokens = estimatedUsage.toolTokens;
  const otherTokens = Math.max(0, totalTokens - estimatedUsage.userTokens - estimatedUsage.assistantTokens - toolTokens);

  const contextBreakdown = [
    { label: '用户', percent: totalTokens > 0 ? (estimatedUsage.userTokens / totalTokens) * 100 : 0, color: 'bg-[var(--theme-success-text)]' },
    { label: '助手', percent: totalTokens > 0 ? (estimatedUsage.assistantTokens / totalTokens) * 100 : 0, color: 'bg-[var(--theme-accent)]' },
    { label: '工具调用', percent: totalTokens > 0 ? (toolTokens / totalTokens) * 100 : 0, color: 'bg-[var(--theme-warning-text)]' },
    { label: '其他', percent: totalTokens > 0 ? (otherTokens / totalTokens) * 100 : 0, color: 'bg-[var(--theme-text-muted)]' },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="absolute inset-0 z-40 bg-transparent"
          onClick={onClose}
        />
      )}
      <div
        className={`absolute top-0 right-0 bottom-0 z-50 w-[440px] transform overflow-y-auto border-l-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-surface)] transition-transform duration-300 ease-in-out shadow-[var(--theme-shadow-strong)] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="space-y-[var(--theme-section-gap)] p-[var(--theme-panel-padding-x)] text-[length:var(--theme-body-size)] text-[var(--theme-text-primary)]">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className={themeRecipes.eyebrow()}>会话</div>
              <div className={themeRecipes.title()}>{session.title || 'Untitled'}</div>
              <div className={`text-[length:var(--theme-meta-size)] ${themeRecipes.description()}`}>最近更新 {new Date(session.updatedAt).toLocaleString('zh-CN')}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]">
              <X size={16} />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="消息数" value={String(messages.length)} />
            <MetricCard label={isEstimatedUsage ? '总 token 估算' : '总 token'} value={totalTokens > 0 ? formatTokenCount(totalTokens) : '—'} />
            <MetricCard label="用户消息" value={String(userMessages)} />
            <MetricCard label="助手消息" value={String(assistantMessages)} />
            <MetricCard label="工具调用" value={String(toolCallCount)} />
            <MetricCard label="上下文上限" value={formatTokenCount(contextLimit)} />
          </div>

          <div className="space-y-1">
            <div className={themeRecipes.eyebrow()}>使用率{isEstimatedUsage ? '（估算）' : ''}</div>
            <div>{formatPercentage(totalTokens, contextLimit)} ({formatTokenCount(totalTokens)} / {formatTokenCount(contextLimit)})</div>
          </div>

          <div className="space-y-1">
            <div className={themeRecipes.eyebrow()}>输入 token{isEstimatedUsage ? '（估算）' : ''}</div>
            <div>{formatTokenCount(inputTokens)}</div>
          </div>

          <div className="space-y-1">
            <div className={themeRecipes.eyebrow()}>输出 token{isEstimatedUsage ? '（估算）' : ''}</div>
            <div>{formatTokenCount(outputTokens)}</div>
          </div>

          <div className="space-y-2">
            <div className={themeRecipes.eyebrow()}>上下文拆分</div>
            {totalTokens > 0 ? (
              <>
                <div className="flex h-2 w-full rounded-full overflow-hidden">
                  {contextBreakdown.map((item, i) => (
                    item.percent > 0 && (
                      <div key={i} className={`${item.color}`} style={{ width: `${item.percent}%` }} />
                    )
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-3">
                  {contextBreakdown.map((item, i) => (
                    item.percent > 0 && (
                      <div key={i} className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${item.color}`}></div>
                        {item.label} {item.percent.toFixed(1)}%
                      </div>
                    )
                  ))}
                </div>
              </>
            ) : (
              <div className={`text-[length:var(--theme-meta-size)] ${themeRecipes.description()}`}>暂无 token 数据</div>
            )}
          </div>

          <div className="space-y-[var(--theme-toolbar-gap)] pb-6">
            <div className={themeRecipes.eyebrow()}>原始消息</div>
            <div className="overflow-hidden rounded-[var(--theme-radius-card)] border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-surface)]">
              {messages.map((msg) => (
                <div key={msg.id} className="border-b-[var(--theme-divider-width)] border-[var(--theme-border)] last:border-b-0">
                  <div
                    className="flex cursor-pointer items-center justify-between px-[var(--theme-control-padding-x-sm)] py-[calc(var(--theme-row-padding-y)*0.9)] text-[length:var(--theme-meta-size)] hover:bg-[var(--theme-surface-muted)]"
                    onClick={() => setExpandedMsgId(expandedMsgId === msg.id ? null : msg.id)}
                  >
                    <div className="flex items-center gap-[var(--theme-toolbar-gap)] truncate">
                      <span className="font-medium">{msg.role}</span>
                      <span className="text-[var(--theme-text-muted)]">• {msg.id.substring(0, 16)}...</span>
                    </div>
                    <span className="ml-2 whitespace-nowrap text-[var(--theme-text-muted)]">
                      {new Date(msg.createdAt).toLocaleTimeString('zh-CN')}
                    </span>
                  </div>
                  {expandedMsgId === msg.id && (
                    <div className="overflow-x-auto border-t-[var(--theme-divider-width)] border-[var(--theme-border)] bg-[var(--theme-surface)] px-[var(--theme-control-padding-x-sm)] py-[var(--theme-card-padding-y)] text-[length:var(--theme-meta-size)]">
                      <pre className="font-mono leading-relaxed text-[var(--theme-accent)]">
                        {JSON.stringify({
                          id: msg.id,
                          role: msg.role,
                          content: getMessageText(msg).substring(0, 200),
                          segments: msg.segments?.length || 0,
                          status: msg.status,
                          durationMs: msg.startedAt && msg.endedAt ? Math.max(0, msg.endedAt - msg.startedAt) : undefined,
                        }, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const MetricCard = ({ label, value }: { label: string; value: string }) => (
  <div className={`${themeRecipes.mutedCard()} px-[var(--theme-card-padding-x)] py-[var(--theme-card-padding-y)]`}>
    <div className={themeRecipes.eyebrow()}>{label}</div>
    <div className={`mt-[var(--theme-toolbar-gap)] ${themeRecipes.sectionTitle()}`}>{value}</div>
  </div>
);

function estimateUsageFromMessages(messages: Message[]) {
  let userTokens = 0;
  let assistantTokens = 0;
  let toolTokens = 0;
  let toolCallCount = 0;

  for (const message of messages) {
    const textTokens = estimateTokens(getMessageText(message));
    if (message.role === 'assistant') {
      assistantTokens += textTokens;
    } else {
      userTokens += textTokens;
    }

    for (const segment of message.segments || []) {
      if (segment.type === 'tool') {
        toolCallCount += 1;
        toolTokens += estimateToolTokens(segment);
      }
    }
  }

  return {
    userTokens,
    assistantTokens,
    toolTokens,
    toolCallCount,
    inputTokens: userTokens + toolTokens,
    outputTokens: assistantTokens,
  };
}

function getMessageText(message: Message) {
  const derivedText = getMessageTextContent(message);
  if (derivedText.trim()) return derivedText;
  return (message.segments || [])
    .filter((segment): segment is MessageSegment & { type: 'text' | 'thinking' } => segment.type === 'text' || segment.type === 'thinking')
    .map((segment) => segment.content)
    .join('\n\n');
}

function estimateToolTokens(segment: MessageSegment & { type: 'tool' }) {
  const payload = [
    segment.tool.name,
    JSON.stringify(segment.tool.arguments ?? {}),
    ...(segment.tool.logs || []),
    segment.tool.result || '',
  ].join('\n');
  return Math.max(16, estimateTokens(payload));
}

function estimateTokens(text: string) {
  if (!text.trim()) return 0;
  let tokens = 0;
  let asciiRunLength = 0;

  for (const char of text) {
    if (/[\u4e00-\u9fff]/.test(char)) {
      tokens += Math.ceil(asciiRunLength / 4);
      asciiRunLength = 0;
      tokens += 1;
    } else {
      asciiRunLength += 1;
    }
  }

  return tokens + Math.ceil(asciiRunLength / 4);
}
