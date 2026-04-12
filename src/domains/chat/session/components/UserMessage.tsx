import { FileText, Undo2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Message } from '@/shared/types/schema';
import { CopyIconButton, IconButton } from '@/ui/components';
import { useSessionStore } from '@/core/sessions/useSessionStore';

interface UserMessageProps {
  sessionId: string;
  message: Message;
}

export const UserMessage = ({ sessionId, message }: UserMessageProps) => {
  const mode = (message.mode || 'Chat').toUpperCase();
  const time = new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const attachments = message.attachments || [];
  const rewindSessionToMessage = useSessionStore((s) => s.rewindSessionToMessage);
  const setComposerDraft = useSessionStore((s) => s.setComposerDraft);

  const handleWithdraw = () => {
    setComposerDraft({
      text: message.content || '',
      attachments: [...attachments],
    });
    rewindSessionToMessage(sessionId, message.id);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative flex w-full flex-col items-end pb-2 pt-4"
    >
      <div className="flex max-w-[82%] flex-col items-end">
        <div className="whitespace-pre-wrap rounded-[var(--theme-radius-card)] bg-[var(--theme-accent)] px-[var(--theme-card-padding-x)] py-[var(--theme-card-padding-y)] text-[length:var(--theme-body-size)] leading-7 text-[var(--theme-accent-contrast)] shadow-[var(--theme-shadow-soft)] select-text">
          {attachments.length > 0 && (
            <div className="mb-[var(--theme-toolbar-gap)] flex flex-wrap gap-[var(--theme-toolbar-gap)]">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="overflow-hidden rounded-[var(--theme-radius-control)] bg-[color:color-mix(in_srgb,var(--theme-accent-contrast)_12%,transparent)]">
                  {attachment.kind === 'image' && attachment.previewUrl ? (
                    <img src={attachment.previewUrl} alt={attachment.name} className="max-h-52 max-w-72 object-cover" />
                  ) : (
                    <div className="flex max-w-72 items-center gap-[var(--theme-toolbar-gap)] px-[var(--theme-control-padding-x-sm)] py-[calc(var(--theme-row-padding-y)*0.7)] text-[length:var(--theme-meta-size)] text-[color:color-mix(in_srgb,var(--theme-accent-contrast)_90%,transparent)]">
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

        <div className="mt-[var(--theme-toolbar-gap)] flex h-6 items-center justify-end gap-[var(--theme-toolbar-gap)] pr-1 text-[length:var(--theme-meta-size)] text-[var(--theme-text-muted)]">
          <span className="font-medium text-[var(--theme-text-secondary)]">{mode}</span>
          <span className="text-[var(--theme-border-strong)]">·</span>
          <span>{time}</span>
          <span className="text-[var(--theme-border-strong)]">|</span>
          <span className="flex items-center gap-0">
            <IconButton
              onClick={handleWithdraw}
              title="撤回"
              className="text-[var(--theme-text-muted)] hover:bg-[var(--theme-surface-muted)] hover:text-[var(--theme-text-primary)]"
            >
              <Undo2 size={14} />
            </IconButton>
            <CopyIconButton text={message.content || ''} />
          </span>
        </div>
      </div>
    </motion.div>
  );
};
