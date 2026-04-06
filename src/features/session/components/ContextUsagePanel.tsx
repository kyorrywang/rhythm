import { useState } from 'react';
import { Session } from '@/types/schema';
import { formatTokenCount, formatPercentage } from '@/lib/formatters';

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

  const totalTokens = (usage?.inputTokens || 0) + (usage?.outputTokens || 0);
  const contextLimit = 1048576;

  const toolCallSegments = messages.flatMap(m => m.segments || []).filter(s => s.type === 'tool');
  const toolCallCount = toolCallSegments.length;

  const estimatedTextTokens = messages.reduce((acc, m) => {
    if (m.role === 'user' && m.content) return acc + Math.ceil(m.content.length / 4);
    return acc;
  }, 0);

  const otherTokens = Math.max(0, totalTokens - estimatedTextTokens - (usage?.outputTokens || 0) - toolCallCount * 50);

  const contextBreakdown = [
    { label: '用户', percent: totalTokens > 0 ? (estimatedTextTokens / totalTokens) * 100 : 0, color: 'bg-green-600' },
    { label: '助手', percent: totalTokens > 0 ? ((usage?.outputTokens || 0) / totalTokens) * 100 : 0, color: 'bg-[#8b5cf6]' },
    { label: '工具调用', percent: totalTokens > 0 ? (toolCallCount * 50 / totalTokens) * 100 : 0, color: 'bg-[#b45309]' },
    { label: '其他', percent: totalTokens > 0 ? (otherTokens / totalTokens) * 100 : 0, color: 'bg-[#71717a]' },
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
        className={`absolute top-0 right-0 bottom-0 w-[420px] bg-white border-l border-zinc-200 z-50 transform transition-transform duration-300 ease-in-out shadow-[-10px_0_30px_rgba(0,0,0,0.05)] overflow-y-auto ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="p-6 text-[13px] text-zinc-800 space-y-6">
          <div className="space-y-1">
            <div className="text-zinc-500">会话</div>
            <div>{session.title || 'Untitled'}</div>
          </div>

          <div className="space-y-1">
            <div className="text-zinc-500">消息数</div>
            <div>{messages.length}</div>
          </div>

          <div className="space-y-1">
            <div className="text-zinc-500">总 token</div>
            <div>{totalTokens > 0 ? formatTokenCount(totalTokens) : '—'}</div>
          </div>

          {usage && (
            <>
              <div className="space-y-1">
                <div className="text-zinc-500">使用率</div>
                <div>{formatPercentage(totalTokens, contextLimit)} ({formatTokenCount(totalTokens)} / {formatTokenCount(contextLimit)})</div>
              </div>

              <div className="space-y-1">
                <div className="text-zinc-500">输入 token</div>
                <div>{formatTokenCount(usage.inputTokens)}</div>
              </div>

              <div className="space-y-1">
                <div className="text-zinc-500">输出 token</div>
                <div>{formatTokenCount(usage.outputTokens)}</div>
              </div>

            </>
          )}

          <div className="space-y-1">
            <div className="text-zinc-500">用户消息</div>
            <div>{userMessages}</div>
          </div>

          <div className="space-y-1">
            <div className="text-zinc-500">助手消息</div>
            <div>{assistantMessages}</div>
          </div>

          <div className="space-y-1">
            <div className="text-zinc-500">创建时间</div>
            <div>{new Date(session.updatedAt).toLocaleString('zh-CN')}</div>
          </div>

          <div className="space-y-2">
            <div className="text-zinc-500">上下文拆分</div>
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
              <div className="text-xs text-zinc-400">暂无 token 数据</div>
            )}
          </div>

          <div className="space-y-2 pb-6">
            <div className="text-zinc-500 mb-2">原始消息</div>
            <div className="border border-zinc-200 rounded-md overflow-hidden bg-white">
              {messages.map((msg) => (
                <div key={msg.id} className="border-b border-zinc-100 last:border-b-0">
                  <div
                    className="px-3 py-2.5 flex items-center justify-between hover:bg-zinc-50 cursor-pointer text-xs"
                    onClick={() => setExpandedMsgId(expandedMsgId === msg.id ? null : msg.id)}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-medium">{msg.role}</span>
                      <span className="text-zinc-400">• {msg.id.substring(0, 16)}...</span>
                    </div>
                    <span className="text-zinc-400 whitespace-nowrap ml-2">
                      {new Date(msg.createdAt).toLocaleTimeString('zh-CN')}
                    </span>
                  </div>
                  {expandedMsgId === msg.id && (
                    <div className="px-3 py-3 bg-white border-t border-zinc-100 text-[12px] overflow-x-auto">
                      <pre className="text-teal-600 font-mono leading-relaxed">
                        {JSON.stringify({
                          id: msg.id,
                          role: msg.role,
                          content: msg.content?.substring(0, 200),
                          segments: msg.segments?.length || 0,
                          status: msg.status,
                          totalTimeMs: msg.totalTimeMs,
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
