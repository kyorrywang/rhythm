import { Clipboard, MoreHorizontal } from 'lucide-react';

export function ActionMenu({
  path,
  onCopyPath,
}: {
  path: string;
  onCopyPath: (path: string) => void;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        onCopyPath(path);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        onCopyPath(path);
      }}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
      title="复制相对路径"
    >
      <span className="sr-only">复制相对路径</span>
      <Clipboard size={13} className="hidden group-hover:block" />
      <MoreHorizontal size={14} className="group-hover:hidden" />
    </span>
  );
}
