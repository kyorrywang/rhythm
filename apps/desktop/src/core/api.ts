import { fetch } from '@tauri-apps/plugin-http';

const API_BASE = 'http://127.0.0.1:8000';

export const fetchSessions = async (workspacePath: string) => {
  const res = await fetch(`${API_BASE}/sessions?workspace_path=${encodeURIComponent(workspacePath)}`);
  const data: any = await res.json();
  return data.sessions as string[];
};

export const fetchSessionHistory = async (workspacePath: string, sessionId: string) => {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/history?workspace_path=${encodeURIComponent(workspacePath)}`);
  const data: any = await res.json();
  return data.history as any[];
};

export const fetchWorkspaceTree = async (workspacePath: string) => {
  const res = await fetch(`${API_BASE}/workspace/tree?path=${encodeURIComponent(workspacePath)}`);
  const data: any = await res.json();
  return data.tree as any[];
};

export const fetchWorkflows = async (workspacePath: string) => {
  const res = await fetch(`${API_BASE}/workflows/templates?workspace_path=${encodeURIComponent(workspacePath)}`);
  const data: any = await res.json();
  return data.templates as any[];
};

export const fetchWorkflowInstances = async (workspacePath: string) => {
  const res = await fetch(`${API_BASE}/workflows/instances?workspace_path=${encodeURIComponent(workspacePath)}`);
  const data: any = await res.json();
  return data.instances as any[];
};
