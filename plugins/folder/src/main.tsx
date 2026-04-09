import { definePlugin } from '../../../src/plugin/sdk';
import { FOLDER_COMMANDS, FOLDER_VIEWS } from './constants';
import { FolderTree } from './components/FolderTree';
import { FilePreview } from './components/FilePreview';
import { readPreviewFile } from './preview';
import type { FilePreviewPayload, FolderOpenFileInput } from './types';
import { formatBytes } from './utils';

export default definePlugin({
  activate(ctx) {
    ctx.commands.register(
      FOLDER_COMMANDS.openFile,
      async ({ path, line, column }: FolderOpenFileInput) => {
        const file = await readPreviewFile(path);
        const payload: FilePreviewPayload = {
          ...file,
          line,
          column,
        };
        ctx.ui.workbench.open({
          viewId: FOLDER_VIEWS.filePreview,
          title: path,
          description: `大小 ${formatBytes(file.size)}`,
          payload,
          layoutMode: 'replace',
        });
        return payload;
      },
      {
        title: 'Open File',
        description: 'Open a workspace file in the Folder preview view.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            line: { type: 'number' },
            column: { type: 'number' },
          },
          required: ['path'],
        },
      },
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
