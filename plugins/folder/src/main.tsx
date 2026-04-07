import { definePlugin } from '../../../src/plugin-host';
import { FOLDER_COMMANDS, FOLDER_VIEWS } from './constants';
import { FolderTree } from './components/FolderTree';
import { FilePreview } from './components/FilePreview';
import type { FilePreviewPayload, FolderOpenFileInput } from './types';

export default definePlugin({
  activate(ctx) {
    ctx.commands.register(
      FOLDER_COMMANDS.openFile,
      async ({ path, line, column }: FolderOpenFileInput) => {
        const result = await ctx.commands.execute<{ path: string }, string | { output?: string }>(
          FOLDER_COMMANDS.read,
          { path },
        );
        const content = typeof result === 'string' ? result : result.output || '';
        const payload: FilePreviewPayload = {
          path,
          content,
          size: content.length,
          truncated: false,
          is_binary: false,
          encoding_error: null,
          limit_bytes: content.length,
          line,
          column,
        };
        ctx.ui.workbench.open({
          viewId: FOLDER_VIEWS.filePreview,
          title: path,
          description: line ? `Line ${line}${column ? `:${column}` : ''}` : undefined,
          payload,
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
