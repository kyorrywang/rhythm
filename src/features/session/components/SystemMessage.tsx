import { motion } from 'framer-motion';
import { BellRing, Clock3, Scissors, TimerReset } from 'lucide-react';
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
      <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#fffdfa_0%,#f7f3ec_100%)] px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-slate-400">
          {icon}
          <span>System Event</span>
        </div>
        <p className="mt-3 text-sm leading-7 text-slate-700">{message.content}</p>
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
