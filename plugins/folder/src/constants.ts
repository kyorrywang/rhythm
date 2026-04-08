export const FOLDER_COMMANDS = {
  list: 'tool.list_dir',
  read: 'tool.read_file',
  write: 'tool.write_file',
  deleteFile: 'tool.delete_file',
  createDir: 'folder.createDir',
  rename: 'folder.rename',
  deletePath: 'folder.delete',
  reveal: 'folder.reveal',
  openFile: 'folder.openFile',
} as const;

export const FOLDER_VIEWS = {
  tree: 'folder.tree',
  filePreview: 'folder.file.preview',
} as const;

export const FOLDER_STORAGE_KEYS = {
  openHistory: 'folder.openHistory',
  expandedPaths: 'folder.expandedPaths',
} as const;

export const MAX_OPEN_HISTORY = 12;
