import axios from 'axios';

const API_BASE = 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const fetchSessions = async (workspacePath: string) => {
  const res = await apiClient.get(`/sessions?workspace_path=${encodeURIComponent(workspacePath)}`);
  return res.data.sessions as string[];
};

export const fetchSessionHistory = async (workspacePath: string, sessionId: string) => {
  const res = await apiClient.get(`/sessions/${sessionId}/history?workspace_path=${encodeURIComponent(workspacePath)}`);
  return res.data.history as any[];
};

export const fetchWorkspaceTree = async (workspacePath: string) => {
  const res = await apiClient.get(`/workspace/tree?path=${encodeURIComponent(workspacePath)}`);
  return res.data.tree as any[];
};

export const fetchWorkflows = async (workspacePath: string) => {
  const res = await apiClient.get(`/workflows/templates?workspace_path=${encodeURIComponent(workspacePath)}`);
  return res.data.templates as any[];
};

export const fetchWorkflowInstances = async (workspacePath: string) => {
  const res = await apiClient.get(`/workflows/instances?workspace_path=${encodeURIComponent(workspacePath)}`);
  return res.data.instances as any[];
};
