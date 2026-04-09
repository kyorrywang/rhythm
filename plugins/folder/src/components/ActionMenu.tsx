import { Clipboard, FilePlus2, FolderOpen, FolderPlus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { BackendWorkspaceDirEntry } from '../../../../src/shared/types/api';
import { IconButton, MenuContent, MenuDivider, MenuItem, MenuPortal, MenuRoot, MenuTrigger } from '../../../../src/shared/ui';

export function ActionMenu({
  entry,
  onCopyPath,
  onCopyRelativePath,
  onCreateFile,
  onCreateDir,
  onRename,
  onDelete,
  onReveal,
}: {
  entry: BackendWorkspaceDirEntry;
  onCopyPath: (path: string) => void;
  onCopyRelativePath: (path: string) => void;
  onCreateFile?: (basePath?: string) => void;
  onCreateDir?: (basePath?: string) => void;
  onRename?: () => void;
  onDelete?: () => void;
  onReveal?: () => void;
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
              New File...
            </MenuItem>
          )}
          {entry.kind === 'directory' && onCreateDir && (
            <MenuItem icon={<FolderPlus size={13} />} onSelect={() => onCreateDir(entry.path)}>
              New Folder...
            </MenuItem>
          )}
          {onReveal && (
            <MenuItem icon={<FolderOpen size={13} />} onSelect={() => onReveal()}>
              Reveal in File Explorer
            </MenuItem>
          )}
          <MenuDivider />
          <MenuItem icon={<Clipboard size={13} />} onSelect={() => onCopyPath(entry.path)}>
            Copy Path
          </MenuItem>
          <MenuItem icon={<Clipboard size={13} />} onSelect={() => onCopyRelativePath(entry.path)}>
            Copy Relative Path
          </MenuItem>
          <MenuDivider />
          {onRename && (
            <MenuItem icon={<Pencil size={13} />} onSelect={() => onRename()}>
              Rename...
            </MenuItem>
          )}
          {onDelete && (
            <MenuItem icon={<Trash2 size={13} />} onSelect={() => onDelete()} danger>
              Delete
            </MenuItem>
          )}
        </MenuContent>
      </MenuPortal>
    </MenuRoot>
  );
}
