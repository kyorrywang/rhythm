import { Clipboard, Eye, FilePlus2, FolderPlus, MoreHorizontal, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import type { BackendWorkspaceDirEntry } from '../../../../src/shared/types/api';
import { IconButton, MenuContent, MenuItem, MenuPortal, MenuRoot, MenuTrigger } from '../../../../src/shared/ui';

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
    <MenuRoot>
      <MenuTrigger asChild>
        <span
          onClick={(event) => event.stopPropagation()}
          className="opacity-0 transition-opacity group-hover:opacity-100"
        >
          <IconButton title="更多操作">
            <MoreHorizontal size={14} />
          </IconButton>
        </span>
      </MenuTrigger>
      <MenuPortal>
        <MenuContent align="end" sideOffset={8}>
          {entry.kind === 'directory' && onCreateFile && (
            <MenuItem icon={<FilePlus2 size={13} />} onSelect={() => onCreateFile(entry.path)}>
              新建文件
            </MenuItem>
          )}
          {entry.kind === 'directory' && onCreateDir && (
            <MenuItem icon={<FolderPlus size={13} />} onSelect={() => onCreateDir(entry.path)}>
              新建目录
            </MenuItem>
          )}
          {onRefresh && entry.kind === 'directory' && (
            <MenuItem icon={<RefreshCw size={13} />} onSelect={() => onRefresh()}>
              刷新目录
            </MenuItem>
          )}
          {onRename && (
            <MenuItem icon={<Pencil size={13} />} onSelect={() => onRename()}>
              重命名
            </MenuItem>
          )}
          {onReveal && (
            <MenuItem icon={<Eye size={13} />} onSelect={() => onReveal()}>
              在系统中显示
            </MenuItem>
          )}
          <MenuItem icon={<Clipboard size={13} />} onSelect={() => onCopyPath(entry.path)}>
            复制相对路径
          </MenuItem>
          {onDelete && (
            <MenuItem icon={<Trash2 size={13} />} onSelect={() => onDelete()} danger>
              删除
            </MenuItem>
          )}
        </MenuContent>
      </MenuPortal>
    </MenuRoot>
  );
}
