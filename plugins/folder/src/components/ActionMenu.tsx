import type { MouseEventHandler, ReactNode } from 'react';
import { Clipboard, Eye, FilePlus2, FolderPlus, MoreHorizontal, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import type { BackendWorkspaceDirEntry } from '../../../../src/shared/types/api';
import { Button } from '../../../../src/shared/ui/Button';

export function ActionMenu({
  entry,
  onCopyPath,
  onCreateFile,
  onCreateDir,
  onRename,
  onDelete,
  onReveal,
  onRefresh,
}: {
  entry: BackendWorkspaceDirEntry;
  onCopyPath: (path: string) => void;
  onCreateFile?: (basePath?: string) => void;
  onCreateDir?: (basePath?: string) => void;
  onRename?: () => void;
  onDelete?: () => void;
  onReveal?: () => void;
  onRefresh?: () => void;
}) {
  return (
    <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      {entry.kind === 'directory' && onCreateFile && (
        <IconAction
          title="新建文件"
          icon={<FilePlus2 size={13} />}
          onClick={(event) => {
            event.stopPropagation();
            onCreateFile(entry.path);
          }}
        />
      )}
      {entry.kind === 'directory' && onCreateDir && (
        <IconAction
          title="新建目录"
          icon={<FolderPlus size={13} />}
          onClick={(event) => {
            event.stopPropagation();
            onCreateDir(entry.path);
          }}
        />
      )}
      {onRefresh && entry.kind === 'directory' && (
        <IconAction
          title="刷新目录"
          icon={<RefreshCw size={13} />}
          onClick={(event) => {
            event.stopPropagation();
            onRefresh();
          }}
        />
      )}
      {onRename && (
        <IconAction
          title="重命名"
          icon={<Pencil size={13} />}
          onClick={(event) => {
            event.stopPropagation();
            onRename();
          }}
        />
      )}
      {onReveal && (
        <IconAction
          title="在系统中显示"
          icon={<Eye size={13} />}
          onClick={(event) => {
            event.stopPropagation();
            onReveal();
          }}
        />
      )}
      <IconAction
        title="复制相对路径"
        icon={<Clipboard size={13} />}
        onClick={(event) => {
          event.stopPropagation();
          onCopyPath(entry.path);
        }}
      />
      {onDelete && (
        <IconAction
          title="删除"
          icon={<Trash2 size={13} />}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          danger
        />
      )}
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-300">
        <MoreHorizontal size={14} />
      </span>
    </span>
  );
}

function IconAction({
  title,
  icon,
  onClick,
  danger = false,
}: {
  title: string;
  icon: ReactNode;
  onClick: MouseEventHandler<HTMLButtonElement>;
  danger?: boolean;
}) {
  return (
    <Button
      variant="unstyled"
      size="none"
      onClick={onClick}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${
        danger
          ? 'text-rose-300 hover:bg-rose-50 hover:text-rose-700'
          : 'text-slate-300 hover:bg-slate-100 hover:text-slate-700'
      }`}
      title={title}
    >
      {icon}
    </Button>
  );
}
