import { cn } from '@/shared/lib/utils';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeBlockProps {
  language: string;
  code: string;
}

export const CodeBlock = ({ language, code }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(code.split('\n').length > 30);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lineCount = code.split('\n').length;
  const isLong = lineCount > 30;

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-gray-200">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 border-b border-gray-200">
        <span className="text-xs text-gray-500 font-mono">{language || 'text'}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
            title="复制"
          >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
          {isLong && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
              title={collapsed ? '展开' : '折叠'}
            >
              {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          )}
        </div>
      </div>
      <div className={cn('overflow-hidden transition-all', collapsed && isLong ? 'max-h-[400px]' : '')}>
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus}
          customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.8rem' }}
          showLineNumbers={lineCount > 5}
        >
          {code}
        </SyntaxHighlighter>
      </div>
      {collapsed && isLong && (
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-gray-900 to-transparent pointer-events-none" />
      )}
    </div>
  );
};
