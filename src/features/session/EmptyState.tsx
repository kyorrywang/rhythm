import { Sparkles } from 'lucide-react';

export const EmptyState = () => (
  <div className="flex min-h-full flex-col items-center justify-center px-6 py-12">
    <div className="relative mb-8 flex justify-center pointer-events-none">
      <div className="absolute inset-0 rounded-[32px] bg-amber-400/15 blur-3xl" />
      <div className="relative flex h-24 w-24 items-center justify-center rounded-[28px] border border-amber-200/60 bg-white shadow-[0_24px_60px_rgba(146,93,24,0.08)]">
        <Sparkles className="h-10 w-10 text-amber-700/90" strokeWidth={1.5} />
      </div>
    </div>
    <h1 className="mb-4 bg-gradient-to-br from-slate-950 via-slate-800 to-amber-800 bg-clip-text text-[30px] font-semibold tracking-tight text-transparent">
      从第一条消息开始会话
    </h1>
    <p className="max-w-[520px] text-center text-[14px] leading-7 text-slate-500">
      这里不要求先手动新建会话。直接在底部输入需求，我们会自动创建新会话、加入左侧列表，并立即开始本轮对话。
    </p>
  </div>
);
