import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { IconButton } from './IconButton';

export function CopyIconButton({
  text,
  title = '复制',
  className,
}: {
  text: string;
  title?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failures in presentation components.
    }
  };

  return (
    <IconButton
      onClick={() => void handleCopy()}
      title={title}
      className={cn(
        'text-[var(--theme-text-muted)] hover:bg-[var(--theme-surface-muted)] hover:text-[var(--theme-text-primary)]',
        className,
      )}
    >
      {copied ? <Check size={14} className="text-[var(--theme-success-text)]" /> : <Copy size={14} />}
    </IconButton>
  );
}
