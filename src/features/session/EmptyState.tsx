import { Sparkles } from 'lucide-react';

export const EmptyState = () => (
  <div className="flex-1 flex flex-col items-center justify-center -mt-20 px-6">
    <div className="relative mb-8 flex justify-center group pointer-events-none">
      <div className="absolute inset-0 bg-indigo-500/10 rounded-3xl blur-2xl group-hover:bg-indigo-500/20 transition-all duration-700 ease-in-out"></div>
      <div className="relative w-20 h-20 bg-white/60 backdrop-blur-sm border border-indigo-50/50 shadow-[0_4px_24px_rgba(0,0,0,0.02)] rounded-[24px] flex items-center justify-center transform group-hover:scale-[1.02] transition-all duration-500 ring-1 ring-black/[0.03]">
        <Sparkles className="w-9 h-9 text-indigo-500/90" strokeWidth={1.5} />
      </div>
    </div>
    <h1 className="text-[26px] font-semibold bg-gradient-to-br from-gray-900 to-gray-600 bg-clip-text text-transparent mb-4 tracking-tight flex items-center gap-2">
      构建任何东西
    </h1>
    <p className="text-[14px] text-gray-500 max-w-[420px] text-center leading-relaxed">
      通过自然语言描述需求，我们能为您编写和重构代码、解析底层逻辑或搭建复杂应用的界面。
    </p>
  </div>
);
