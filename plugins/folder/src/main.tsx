import { definePlugin } from '../../../src/plugin-host';
import { FOLDER_COMMANDS, FOLDER_VIEWS } from './constants';
import { FolderTree } from './components/FolderTree';
import { FilePreview } from './components/FilePreview';
import type { FilePreviewPayload, FolderListInput, FolderReadInput } from './types';

export default definePlugin({
  activate(ctx) {
    ctx.commands.register(
      FOLDER_COMMANDS.list,
      ({ path = '.' }: FolderListInput) => ctx.workspace.listDir(path),
      { title: 'List folder', description: 'List one workspace directory.' },
    );
    ctx.commands.register(
      FOLDER_COMMANDS.read,
      ({ path }: FolderReadInput) => ctx.workspace.readTextFile(path),
      { title: 'Read file', description: 'Read a workspace text file preview.' },
    );

    ctx.ui.activityBar.register({
      id: 'folder.activity',
      title: 'Files',
      icon: 'folder',
      opens: FOLDER_VIEWS.tree,
    });
    ctx.ui.leftPanel.register({
      id: FOLDER_VIEWS.tree,
      title: 'Files',
      icon: 'folder',
      component: FolderTree,
    });
    ctx.ui.workbench.register<FilePreviewPayload>({
      id: FOLDER_VIEWS.filePreview,
      title: 'File Preview',
      component: FilePreview,
    });
  },
});
