import { cn } from '@/shared/lib/utils';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import { Button } from '@/shared/ui/Button';
import { themeRecipes } from '@/shared/theme/recipes';

interface CodeBlockProps {
  language: string;
  code: string;
}

SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('sh', bash);
SyntaxHighlighter.registerLanguage('shell', bash);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('diff', diff);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('js', javascript);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('md', markdown);
SyntaxHighlighter.registerLanguage('html', markup);
SyntaxHighlighter.registerLanguage('xml', markup);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('py', python);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('rs', rust);
SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('ts', typescript);

export const CodeBlock = ({ language, code }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(code.split('\n').length > 30);
  const normalizedLanguage = language?.trim().toLowerCase() || 'text';
  const isPlainText = normalizedLanguage === 'text' || normalizedLanguage === 'txt' || normalizedLanguage === 'plain';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lineCount = code.split('\n').length;
  const isLong = lineCount > 30;

  if (isPlainText) {
    return (
      <div className={`not-prose group relative my-2 ${themeRecipes.mutedCard()}`}>
        <Button
          variant="unstyled"
          size="none"
          onClick={handleCopy}
          className="absolute right-2 top-2 rounded-[var(--theme-radius-control)] p-1 text-[var(--theme-code-muted)] opacity-0 transition-all hover:bg-[var(--theme-surface)] hover:text-[var(--theme-text-primary)] group-hover:opacity-100"
          title="复制"
        >
          {copied ? <Check size={14} className="text-[var(--theme-success-text)]" /> : <Copy size={14} />}
        </Button>
        <pre
          className="m-0 overflow-x-auto whitespace-pre-wrap px-[var(--theme-card-padding-x)] py-[var(--theme-card-padding-y)] pr-9 font-mono text-[13px] leading-6 text-[var(--theme-text-secondary)]"
          style={{ background: 'transparent' }}
        >
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div className={`not-prose relative group my-3 overflow-hidden ${themeRecipes.surfaceCard()}`}>
      <div className="flex items-center justify-between border-b-[var(--theme-divider-width)] border-[var(--theme-border)] bg-[var(--theme-code-header-bg)] px-[var(--theme-card-padding-x)] py-[calc(var(--theme-card-padding-y)*0.72)]">
        <span className="font-mono text-[11px] uppercase tracking-[var(--theme-eyebrow-spacing)] text-[var(--theme-text-muted)]">{normalizedLanguage}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="unstyled"
            size="none"
            onClick={handleCopy}
            className="rounded-[var(--theme-radius-control)] p-1 text-[var(--theme-code-muted)] transition-colors hover:bg-[var(--theme-surface)] hover:text-[var(--theme-text-primary)]"
            title="复制"
          >
            {copied ? <Check size={14} className="text-[var(--theme-success-text)]" /> : <Copy size={14} />}
          </Button>
          {isLong && (
            <Button
              variant="unstyled"
              size="none"
              onClick={() => setCollapsed(!collapsed)}
              className="rounded-[var(--theme-radius-control)] p-1 text-[var(--theme-code-muted)] transition-colors hover:bg-[var(--theme-surface)] hover:text-[var(--theme-text-primary)]"
              title={collapsed ? '展开' : '折叠'}
            >
              {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </Button>
          )}
        </div>
      </div>
      <div className={cn('overflow-hidden transition-all', collapsed && isLong ? 'max-h-[400px]' : '')}>
        <SyntaxHighlighter
          language={normalizedLanguage}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: '0.82rem',
            background: 'var(--theme-code-bg)',
            padding: '1rem',
            color: 'var(--theme-code-text)',
          }}
          showLineNumbers={lineCount > 5}
        >
          {code}
        </SyntaxHighlighter>
      </div>
      {collapsed && isLong && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[var(--theme-surface)] to-transparent" />
      )}
    </div>
  );
};
