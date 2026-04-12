import { Sparkles } from 'lucide-react';
import { themeRecipes } from '@/ui/theme/recipes';

export const EmptyState = () => (
  <div className="flex min-h-full flex-col items-center justify-center px-6 py-12">
    <div className="relative mb-8 flex justify-center pointer-events-none">
      <div className="absolute inset-0 rounded-[var(--theme-radius-shell)] bg-[color:color-mix(in_srgb,var(--theme-warning-surface)_72%,transparent)] blur-3xl" />
      <div className="relative flex h-24 w-24 items-center justify-center rounded-[var(--theme-radius-shell)] border-[var(--theme-border-width)] border-[var(--theme-warning-border)] bg-[var(--theme-surface)] shadow-[var(--theme-shadow-strong)]">
        <Sparkles className="h-10 w-10 text-[var(--theme-warning-text)]" strokeWidth={1.5} />
      </div>
    </div>
    <h1 className={`mb-[var(--theme-section-gap)] bg-gradient-to-br from-[var(--theme-text-primary)] via-[var(--theme-text-secondary)] to-[var(--theme-warning-text)] bg-clip-text text-[clamp(1.75rem,2.4vw,2.1rem)] font-[var(--theme-title-weight)] tracking-tight text-transparent`}>
      从第一条消息开始会话
    </h1>
    <p className={`max-w-[520px] text-center leading-7 ${themeRecipes.description()}`}>
      这里不要求先手动新建会话。直接在底部输入需求，我们会自动创建新会话、加入左侧列表，并立即开始本轮对话。
    </p>
  </div>
);
