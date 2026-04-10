import { FileCode2, FileImage, FileJson, FileText, FileVideo, Music } from 'lucide-react';
import { Badge, Button } from '../../../../src/shared/ui';
import { themeRecipes } from '../../../../src/shared/theme/recipes';
import type { BackendWorkspaceDirEntry } from '../../../../src/shared/types/api';
import { ActionMenu } from './ActionMenu';

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'py':
    case 'go':
    case 'rs':
    case 'c':
    case 'cpp':
    case 'h':
    case 'java':
    case 'php':
    case 'rb':
    case 'sh':
    case 'sql':
      return <FileCode2 size={14} className="shrink-0 text-[var(--theme-accent)]" />;
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
    case 'xml':
      return <FileJson size={14} className="shrink-0 text-[var(--theme-warning)]" />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      return <FileImage size={14} className="shrink-0 text-[var(--theme-success)]" />;
    case 'mp4':
    case 'mov':
    case 'webm':
      return <FileVideo size={14} className="shrink-0 text-[var(--theme-info)]" />;
    case 'mp3':
    case 'wav':
    case 'ogg':
      return <Music size={14} className="shrink-0 text-[var(--theme-info)]" />;
    case 'md':
    case 'txt':
    case 'log':
      return <FileText size={14} className="shrink-0 text-[var(--theme-text-secondary)]" />;
    default:
      return <FileText size={14} className="shrink-0 text-[var(--theme-text-muted)]" />;
  }
}

export function FileRow({
  entry,
  active,
  depth,
  meta,
  variant = 'recent',
  onOpen,
  onCreateFile,
  onCreateDir,
  onRename,
  onDelete,
  onReveal,
  onCopyPath,
  onCopyRelativePath,
  gitStatus,
}: {
  entry: BackendWorkspaceDirEntry;
  active: boolean;
  depth: number;
  meta?: string;
  variant?: 'recent' | 'tree';
  onOpen: () => void;
  onCreateFile?: (basePath?: string) => void;
  onCreateDir?: (basePath?: string) => void;
  onRename?: () => void;
  onDelete?: () => void;
  onReveal?: () => void;
  onCopyPath: (path: string) => void;
  onCopyRelativePath: (path: string) => void;
  gitStatus?: string;
}) {
  const isTree = variant === 'tree';

  if (isTree) {
    return (
      <div
        className={`group relative flex items-center justify-between gap-0.5 rounded-[calc(var(--theme-radius-control)*0.7)] py-[calc(var(--theme-row-padding-y)*0.28)] pr-[calc(var(--theme-toolbar-gap)*0.45)] transition-colors ${
          active ? 'bg-[var(--theme-surface-subtle)]' : 'hover:bg-[var(--theme-surface-subtle)]'
        }`}
        style={{ paddingLeft: 12 + depth * 16 }}
      >
        <Button
          variant="unstyled"
          size="none"
          onClick={onOpen}
          className="min-w-0 flex-1 justify-start text-left focus:ring-0"
        >
          <span className="flex min-w-0 items-center gap-1.25 truncate">
            <span className="w-4 shrink-0" /> {/* Placeholder for alignment matching FolderTree icons */}
            {getFileIcon(entry.name)}
            <span className={`truncate text-[12px] leading-4 ${active ? 'font-semibold text-[var(--theme-text-primary)]' : 'text-[var(--theme-text-secondary)] group-hover:text-[var(--theme-text-primary)]'}`}>
              {entry.name}
            </span>
            {gitStatus && <Badge tone="warning" className="px-1 py-0 text-[9px]">{gitStatus}</Badge>}
          </span>
        </Button>
        <ActionMenu
          entry={entry}
          onCopyPath={onCopyPath}
          onCopyRelativePath={onCopyRelativePath}
          onCreateFile={onCreateFile}
          onCreateDir={onCreateDir}
          onRename={onRename}
          onDelete={onDelete}
          onReveal={onReveal}
        />
      </div>
    );
  }

  return (
    <div
      className={`group ${themeRecipes.listRow(active)}`}
      style={{ paddingLeft: 14 + depth * 14 }}
    >
      <Button
        variant="unstyled"
        size="none"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          <FileText size={14} className="shrink-0 text-[var(--theme-text-muted)]" />
          <span className="min-w-0 flex-1">
            <span className={`block truncate ${themeRecipes.listRowTitle(active)}`}>{entry.name}</span>
            {meta ? (
              <span className={`mt-0.5 block truncate text-[length:var(--theme-meta-size)] ${themeRecipes.listRowMeta(active)}`}>
                {meta}
              </span>
            ) : null}
          </span>
          {gitStatus && <Badge tone="warning" className="px-1.5 py-0.5 text-[10px]">{gitStatus}</Badge>}
        </span>
      </Button>
      <ActionMenu
        entry={entry}
        onCopyPath={onCopyPath}
        onCopyRelativePath={onCopyRelativePath}
        onCreateFile={onCreateFile}
        onCreateDir={onCreateDir}
        onRename={onRename}
        onDelete={onDelete}
        onReveal={onReveal}
      />
    </div>
  );
}
