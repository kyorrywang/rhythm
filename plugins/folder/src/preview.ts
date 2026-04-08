import { readWorkspaceTextFile } from '../../../src/shared/api/commands';
import { useWorkspaceStore } from '../../../src/shared/state/useWorkspaceStore';
import type { FilePreviewPayload } from './types';

function getActiveWorkspacePath() {
  const state = useWorkspaceStore.getState();
  return (
    state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)?.path ||
    state.workspaces[0]?.path ||
    ''
  );
}

export async function readPreviewFile(path: string): Promise<FilePreviewPayload> {
  const cwd = getActiveWorkspacePath();
  if (!cwd) {
    throw new Error('Missing active workspace path.');
  }
  return readWorkspaceTextFile(cwd, path);
}
