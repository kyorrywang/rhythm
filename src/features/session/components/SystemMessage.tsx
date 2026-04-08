import { motion } from 'framer-motion';
import { BellRing, Clock3, Scissors, TimerReset } from 'lucide-react';
import { themeRecipes } from '@/shared/theme/recipes';
import type { Message } from '@/shared/types/schema';

export const SystemMessage = ({ message }: { message: Message }) => {
  const icon = pickIcon(message.content || '');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-2 mb-6 mt-2"
    >
      <div className={`${themeRecipes.surfaceCard()} bg-[linear-gradient(180deg,var(--theme-surface)_0%,var(--theme-panel-bg)_100%)] px-[var(--theme-card-padding-x)] py-[var(--theme-card-padding-y)]`}>
        <div className={`flex items-center gap-[var(--theme-toolbar-gap)] ${themeRecipes.eyebrow()}`}>
          {icon}
          <span>System Event</span>
        </div>
        <p className={`mt-[var(--theme-panel-header-gap)] leading-7 ${themeRecipes.description()}`}>{message.content}</p>
      </div>
    </motion.div>
  );
};

function pickIcon(content: string) {
  if (content.includes('压缩')) return <Scissors size={14} />;
  if (content.includes('定时任务')) return <TimerReset size={14} />;
  if (content.includes('中断')) return <BellRing size={14} />;
  return <Clock3 size={14} />;
}
