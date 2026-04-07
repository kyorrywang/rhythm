import type { BackendWorkspaceDirEntry, BackendWorkspaceTextFile } from '../../../src/shared/types/api';

export interface FolderListInput {
  path?: string;
}

export interface FolderReadInput {
  path: string;
}

export interface FilePreviewPayload extends BackendWorkspaceTextFile {}

export interface FolderTreeFileActions {
  openFile: (entry: BackendWorkspaceDirEntry) => void;
  copyPath: (path: string) => Promise<void>;
}
