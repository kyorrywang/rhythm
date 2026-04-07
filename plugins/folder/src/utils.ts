import type { BackendWorkspaceDirEntry } from '../../../src/shared/types/api';
import type { FilePreviewPayload } from './types';

export function sortEntries(entries: BackendWorkspaceDirEntry[]) {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export function matchesEntry(entry: BackendWorkspaceDirEntry, query: string) {
  if (!query) return true;
  const normalized = query.toLowerCase();
  return entry.name.toLowerCase().includes(normalized) || entry.path.toLowerCase().includes(normalized);
}

export function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

export function fileStatusDescription(
  file: Pick<FilePreviewPayload, 'size' | 'truncated' | 'is_binary' | 'encoding_error' | 'limit_bytes'>,
) {
  if (file.is_binary) return `二进制文件，大小 ${formatBytes(file.size)}`;
  if (file.encoding_error) return `编码错误，大小 ${formatBytes(file.size)}`;
  if (file.truncated) return `已截断预览前 ${formatBytes(file.limit_bytes)}，文件总大小 ${formatBytes(file.size)}`;
  return `文本文件，大小 ${formatBytes(file.size)}`;
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
