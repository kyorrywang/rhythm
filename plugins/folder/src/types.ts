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
  createFile: (basePath?: string) => Promise<void>;
  createDir: (basePath?: string) => Promise<void>;
  renamePath: (entry: BackendWorkspaceDirEntry) => Promise<void>;
  deletePath: (entry: BackendWorkspaceDirEntry) => Promise<void>;
  revealPath: (path: string) => Promise<void>;
  refreshPath: (path?: string) => Promise<void>;
  gitStatusForPath: (path: string) => string | undefined;
}

export interface FolderGitStatusEntry {
  path: string;
  status: string;
}
