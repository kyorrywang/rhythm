export type ToolDisplayType = 'timeline' | 'ui-only' | 'interactive';

export const TOOL_DISPLAY: Record<string, ToolDisplayType> = {
  shell: 'timeline',
  read: 'timeline',
  write: 'timeline',
  edit: 'timeline',
  delete: 'timeline',
  spawn_subagent: 'timeline',
  plan: 'ui-only',
  ask: 'ui-only',
  ask_user: 'ui-only',
};

export const getToolDisplayType = (toolName: string): ToolDisplayType => {
  return TOOL_DISPLAY[toolName] || 'timeline';
};

export const isTimelineTool = (toolName: string): boolean =>
  getToolDisplayType(toolName) === 'timeline';

export const isUiOnlyTool = (toolName: string): boolean =>
  getToolDisplayType(toolName) === 'ui-only';

export const isInteractiveTool = (toolName: string): boolean =>
  getToolDisplayType(toolName) === 'interactive';
