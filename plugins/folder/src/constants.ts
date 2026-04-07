export const FOLDER_COMMANDS = {
  list: 'folder.list',
  read: 'folder.read',
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
