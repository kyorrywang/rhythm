import { Check, Copy, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { Message } from '@/shared/types/schema';
import { Button } from '@/shared/ui/Button';

interface UserMessageProps {
  message: Message;
}

export const UserMessage = ({ message }: UserMessageProps) => {
  const [copied, setCopied] = useState(false);
  const mode = (message.mode || 'Chat').toUpperCase();
  const time = new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const attachments = message.attachments || [];

  const handleCopy = async () => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
        <div className="rounded-[22px] rounded-tr-sm bg-slate-900 px-4 py-3 text-[14px] leading-7 text-white shadow-[0_8px_22px_rgba(15,23,42,0.10)] whitespace-pre-wrap select-text">
          {attachments.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="overflow-hidden rounded-2xl bg-white/10">
                  {attachment.kind === 'image' && attachment.previewUrl ? (
                    <img src={attachment.previewUrl} alt={attachment.name} className="max-h-52 max-w-72 object-cover" />
                  ) : (
                    <div className="flex max-w-72 items-center gap-2 px-3 py-2 text-xs text-slate-100">
                      <FileText size={14} />
                      <span className="truncate">{attachment.name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {message.content}
        </div>

        <div className="mt-1.5 flex h-6 items-center justify-end gap-2 pr-1 text-[12px] text-slate-400">
          <span className="font-medium text-slate-500">{mode}</span>
          <span className="text-slate-300">·</span>
          <span>{time}</span>
          <span className="text-slate-300">|</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            className="h-7 w-7 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Copy"
          >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14}/>}
          </Button>
        </div>
      </div>
    </motion.div>
  );
};
