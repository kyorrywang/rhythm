import { cn } from '@/shared/lib/utils';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Button } from '@/shared/ui/Button';

interface CodeBlockProps {
  language: string;
  code: string;
}

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
      <div className="not-prose group relative my-2 rounded-2xl border border-slate-200 bg-[#f8fafc]">
        <Button
          variant="unstyled"
          size="none"
          onClick={handleCopy}
          className="absolute right-2 top-2 rounded-lg p-1 text-slate-300 opacity-0 transition-all hover:bg-white hover:text-slate-600 group-hover:opacity-100"
          title="复制"
        >
          {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
        </Button>
        <pre
          className="m-0 overflow-x-auto whitespace-pre-wrap px-4 py-3 pr-9 font-mono text-[13px] leading-6 text-slate-700"
          style={{ background: 'transparent', color: '#334155' }}
        >
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div className="not-prose relative group my-3 overflow-hidden rounded-2xl border border-slate-200 bg-[#fbfaf7]">
      <div className="flex items-center justify-between border-b border-slate-100 bg-white/70 px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-slate-400">{normalizedLanguage}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="unstyled"
            size="none"
            onClick={handleCopy}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            title="复制"
          >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </Button>
          {isLong && (
            <Button
              variant="unstyled"
              size="none"
              onClick={() => setCollapsed(!collapsed)}
              className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
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
            background: '#111827',
            padding: '1rem',
          }}
          showLineNumbers={lineCount > 5}
        >
          {code}
        </SyntaxHighlighter>
      </div>
      {collapsed && isLong && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#fbfaf7] to-transparent" />
      )}
    </div>
  );
};
