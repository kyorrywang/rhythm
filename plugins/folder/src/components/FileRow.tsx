import { FileText } from 'lucide-react';
import { Button } from '../../../../src/shared/ui/Button';
import type { BackendWorkspaceDirEntry } from '../../../../src/shared/types/api';
import { ActionMenu } from './ActionMenu';

export function FileRow({
  entry,
  active,
  depth,
  onOpen,
  onCreateFile,
  onCreateDir,
  onRename,
  onDelete,
  onReveal,
  onRefresh,
  onCopyPath,
  gitStatus,
}: {
  entry: BackendWorkspaceDirEntry;
  active: boolean;
  depth: number;
  onOpen: () => void;
  onCreateFile?: (basePath?: string) => void;
  onCreateDir?: (basePath?: string) => void;
  onRename?: () => void;
  onDelete?: () => void;
  onReveal?: () => void;
  onRefresh?: () => void;
  onCopyPath: (path: string) => void;
  gitStatus?: string;
}) {
  return (
    <div
      className={`group flex w-full items-center justify-between rounded-2xl py-2 pr-2 text-sm transition-colors ${
        active ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-700 hover:bg-white'
      }`}
      style={{ paddingLeft: 14 + depth * 14 }}
    >
      <Button
        variant="unstyled"
        size="none"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          <FileText size={14} className="shrink-0" />
          <span className="truncate">{entry.name}</span>
          {gitStatus && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{gitStatus}</span>}
        </span>
      </Button>
      <ActionMenu
        entry={entry}
        onCopyPath={onCopyPath}
        onCreateFile={onCreateFile}
        onCreateDir={onCreateDir}
        onRename={onRename}
        onDelete={onDelete}
        onReveal={onReveal}
        onRefresh={onRefresh}
      />
    </div>
  );
}
