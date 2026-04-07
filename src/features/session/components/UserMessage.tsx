import { Copy } from 'lucide-react';
import { motion } from 'framer-motion';
import { Message } from '@/shared/types/schema';

interface UserMessageProps {
  message: Message;
}

export const UserMessage = ({ message }: UserMessageProps) => {
  const mode = (message.mode || 'Chat').toUpperCase();
  const time = new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const handleCopy = async () => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      // Ignore clipboard failures in the read-only presentation layer.
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative flex w-full flex-col items-end pb-2 pt-4"
    >
      <div className="flex max-w-[82%] flex-col items-end">
        <div className="rounded-[22px] rounded-tr-md bg-slate-900 px-4 py-3 text-[14px] leading-7 text-white shadow-[0_8px_22px_rgba(15,23,42,0.10)] whitespace-pre-wrap select-text">
          {message.content}
        </div>

        <div className="mt-1.5 flex h-6 items-center justify-end gap-2 pr-1 text-[12px] text-slate-400">
          <span className="font-medium text-slate-500">{mode}</span>
          <span className="text-slate-300">·</span>
          <span>{time}</span>
          <span className="text-slate-300">|</span>
          <button
            onClick={handleCopy}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            title="Copy"
          >
            <Copy size={14}/>
          </button>
        </div>
      </div>
    </motion.div>
  );
};
