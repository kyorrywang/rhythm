import { invoke } from '@tauri-apps/api/core';

export const initWorkspace = async (workspacePath: string) => {
  return await invoke('init_workspace', { workspacePath });
};

export const fetchSessions = async (workspacePath: string) => {
  return await invoke<string[]>('list_sessions', { workspacePath });
};

export const fetchSessionHistory = async (workspacePath: string, sessionId: string) => {
  return await invoke<any[]>('get_session_history', { workspacePath, sessionId });
};

export const fetchWorkspaceTree = async (workspacePath: string) => {
  return await invoke<any[]>('list_workspace_tree', { path: workspacePath });
};

export const fetchWorkflows = async (workspacePath: string) => {
  return await invoke<any[]>('list_workflow_templates', { workspacePath });
};

export const fetchWorkflowInstances = async (workspacePath: string) => {
  return await invoke<any[]>('list_workflow_instances', { workspacePath });
};

// Config APIs
export const fetchGlobalConfig = async () => {
  return await invoke<any>('get_global_config');
};

export const saveGlobalConfig = async (config: any) => {
  return await invoke('save_global_config', { config });
};
