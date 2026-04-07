import type { BackendWorkspaceDirEntry, BackendWorkspaceTextFile } from '../../../src/shared/types/api';

export interface FolderListInput {
  path?: string;
}

export interface FolderReadInput {
  path: string;
}

export interface FolderOpenFileInput {
  path: string;
  line?: number;
  column?: number;
}

export interface FilePreviewPayload extends BackendWorkspaceTextFile {
  line?: number;
  column?: number;
}

export interface FolderTreeFileActions {
  openFile: (entry: BackendWorkspaceDirEntry) => void;
  copyPath: (path: string) => Promise<void>;
  gitStatusForPath: (path: string) => string | undefined;
}

export interface FolderGitStatusEntry {
  path: string;
  status: string;
}
