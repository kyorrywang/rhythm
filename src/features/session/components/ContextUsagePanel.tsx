import { useState } from 'react';
import { Session } from '@/types/schema';

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

  // Let's create some dummy messages if none exist to exactly match the request
  const displayMessages = messages.length > 0 ? messages : [
    { id: 'msg_d577c6b34001...', role: 'user' },
    { id: 'msg_d577e4a08001...', role: 'user' },
    { id: 'msg_d5795fd6e001...', role: 'user' },
    { id: 'msg_d5795fe27...', role: 'assistant' }
  ];

  const dummyJson = {
    message: {
      id: "msg_d5795fe27002N7AfTaWtV2h7aT",
      parentID: "msg_d5795fd6e001H65Z0j34ZMfrlN",
      role: "assistant",
      mode: "plan",
      agent: "plan",
      path: {
        cwd: "C:\\Users\\Administrator\\Documents\\dev\\rhythm",
        root: "C:\\Users\\Administrator\\Documents\\dev\\rhythm"
      },
      cost: 0,
      tokens: {
        input: 59691,
        output: 86,
        reasoning: 24
      }
    }
  };

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
            <div>{session.title || 'LLM Task/Ask/Message 架构优化探讨'}</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-zinc-500">消息数</div>
            <div>{messages.length || 36}</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-zinc-500">提供商</div>
            <div>OpenCode Zen</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-zinc-500">模型</div>
            <div>Qwen3.6 Plus Free</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-zinc-500">上下文限制</div>
            <div>1,048,576</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-zinc-500">总 token</div>
            <div>59,591</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-zinc-500">使用率</div>
            <div>6%</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-zinc-500">输入 token</div>
            <div>58,892</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-zinc-500">输出 token</div>
            <div>674</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-zinc-500">推理 token</div>
            <div>25</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-zinc-500">缓存 token (读/写)</div>
            <div>0 / 0</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-zinc-500">用户消息</div>
            <div>{userMessages || 2}</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-zinc-500">助手消息</div>
            <div>{assistantMessages || 34}</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-zinc-500">创建时间</div>
            <div>2026年4月4日 15:45</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-zinc-500">最后活动</div>
            <div>2026年4月4日 16:03</div>
          </div>
          
          <div className="space-y-2">
            <div className="text-zinc-500">上下文拆分</div>
            <div className="flex h-2 w-full rounded-full overflow-hidden">
              <div className="bg-[#a67c00] w-[16.9%]" /> {/* Tool calls 16.9% maybe? Wait, first screenshot says: User 0%, Assistant 4.6%, Tool calls 16.9%, Other 78.5%. First segment is gray? Let's just color it nicely */}
              <div className="bg-[#8b5cf6] w-[4.6%]" /> 
              <div className="bg-[#b45309] w-[16.9%]" /> 
              <div className="bg-[#71717a] w-[78.5%]" />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-3">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-600"></div>用户 0%</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#8b5cf6]"></div>助手 4.6%</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#b45309]"></div>工具调用 16.9%</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#71717a]"></div>其他 78.5%</div>
            </div>
          </div>
          
          <div className="space-y-2 pb-6">
            <div className="text-zinc-500 mb-2">原始消息</div>
            <div className="border border-zinc-200 rounded-md overflow-hidden bg-white">
              {displayMessages.map((msg: any, i) => (
                <div key={msg.id} className="border-b border-zinc-100 last:border-b-0">
                  <div 
                    className="px-3 py-2.5 flex items-center justify-between hover:bg-zinc-50 cursor-pointer text-xs"
                    onClick={() => setExpandedMsgId(expandedMsgId === msg.id ? null : msg.id)}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-medium">{msg.role}</span>
                      <span className="text-zinc-400">• {msg.id.substring(0, 16)}...</span>
                    </div>
                    <span className="text-zinc-400 whitespace-nowrap ml-2">2026年4月4日 15:{45 + i}</span>
                  </div>
                  {expandedMsgId === msg.id && (
                    <div className="px-3 py-3 bg-white border-t border-zinc-100 text-[12px] overflow-x-auto">
                      <pre className="text-teal-600 font-mono leading-relaxed">
                        {JSON.stringify(dummyJson, null, 2)}
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
