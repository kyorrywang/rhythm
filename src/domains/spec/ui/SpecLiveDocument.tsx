import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function SpecLiveDocument({ markdown }: { markdown: string }) {
  return (
    <div className="rounded-[var(--theme-radius-shell)] border-[var(--theme-border-width)] border-[var(--theme-border)] bg-[var(--theme-surface)] px-6 py-6">
      <div className="prose prose-sm max-w-none text-[var(--theme-text-primary)]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </div>
    </div>
  );
}
