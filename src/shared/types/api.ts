import type { Attachment, Session } from './schema';

export interface ChatStreamRequest {
  sessionId: string;
  prompt: string;
  attachments?: Attachment[];
  cwd?: string;
  profileId?: string;
  permissionMode?: "default" | "plan" | "full_auto";
  allowedTools?: string[];
  disallowedTools?: string[];
  providerId?: string;
  model?: string;
  reasoning?: "low" | "medium" | "high";
}

export interface BackendRuntimeProfilePermissions {
  locked: boolean;
  defaultMode?: "default" | "plan" | "full_auto";
  allowedTools: string[];
  disallowedTools: string[];
}

export interface BackendRuntimeProfile {
  id: string;
  label: string;
  mode: "Chat" | "Coordinate";
  description: string;
  promptRefs?: string[];
  model?: {
    providerId?: string;
    modelId?: string;
    reasoning?: "low" | "medium" | "high" | string;
  };
  permissions: BackendRuntimeProfilePermissions;
  execution?: {
    agentTurnLimit?: number;
    delegationPolicyRef?: string;
    reviewPolicyRef?: string;
    completionPolicyRef?: string;
    observabilityPolicyRef?: string;
    limitPolicyRef?: string;
  };
}

export interface ChatStreamResponse {
  sessionId: string;
}

export interface SubmitAnswerRequest {
  toolId: string;
  answer: string;
}

export interface ApprovePermissionRequest {
  toolId: string;
  approved: boolean;
}

export interface InterruptSessionRequest {
  sessionId: string;
}

export interface AttachSessionStreamRequest {
  sessionId: string;
  afterEventId?: number;
}

export interface LlmCompleteMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompleteRequest {
  messages: LlmCompleteMessage[];
  providerId?: string;
  model?: string;
  timeoutSecs?: number;
}

export interface BackendSessionInfo {
  session_id: string;
  agent_id: string;
  status: string;
  created_at: string;
}

export interface BackendPluginSummary {
  name: string;
  version: string;
  description: string;
  source: "global" | "project" | "workspace_dev";
  installed: boolean;
  is_active: boolean;
  shadowed_by?: string | null;
  enabled: boolean;
  configured_enabled: boolean;
  status: "enabled" | "disabled" | "blocked" | "error";
  blocked_reason?: string | null;
  skills_count: number;
  hooks_count: number;
  mcp_servers_count: number;
  path: string;
  main?: string | null;
  dev_main?: string | null;
  entry?: string | null;
  permissions: string[];
  granted_permissions: string[];
  requires: {
    plugins: Record<string, string>;
    capabilities: string[];
    commands: string[];
    tools: string[];
  };
  provides: {
    capabilities: string[];
  };
  contributes: {
    activity_bar: BackendPluginContribution[];
    views: BackendPluginContribution[];
    menus: BackendPluginContribution[];
    left_panel_views: BackendPluginContribution[];
    workbench_views: BackendPluginContribution[];
    commands: BackendPluginContribution[];
    agent_tools: BackendPluginContribution[];
    skills: BackendPluginContribution[];
    settings_sections: BackendPluginContribution[];
    message_actions: BackendPluginContribution[];
    tool_result_actions: BackendPluginContribution[];
    tree_item_actions: BackendPluginContribution[];
    workflow_nodes: BackendPluginContribution[];
  };
}

export interface BackendPluginRuntimeInfo {
  plugin_name: string;
  status: BackendPluginSummary['status'];
  enabled: boolean;
  storage_path: string;
  capabilities: string[];
  commands: BackendPluginContribution[];
}

export interface BackendPluginInstallPreview {
  name: string;
  version: string;
  description: string;
  source_path: string;
  destination_path: string;
  will_overwrite: boolean;
  main?: string | null;
  dev_main?: string | null;
  permissions: string[];
  requires: BackendPluginSummary['requires'];
  contributes: BackendPluginSummary['contributes'];
  warnings: string[];
}

export type PluginUninstallStoragePolicy = 'keep' | 'delete';

export interface PluginInstallRequest {
  source_path: string;
}

export interface PluginCommandRequest {
  cwd: string;
  plugin_name: string;
  command_id: string;
  input?: unknown;
}

export interface PluginCommandResponse {
  plugin_name: string;
  command_id: string;
  handled: boolean;
  result: unknown;
}

export interface PluginCommandStartResponse {
  plugin_name: string;
  command_id: string;
  run_id: string;
}

export interface PluginCommandCancelRequest {
  run_id: string;
}

export type PluginCommandEvent =
  | { type: 'started'; runId: string; pluginName: string; commandId: string }
  | { type: 'stdout'; runId: string; chunk: string }
  | { type: 'stderr'; runId: string; chunk: string }
  | { type: 'completed'; runId: string; result: unknown }
  | { type: 'error'; runId: string; message: string }
  | { type: 'cancelled'; runId: string };

export interface PluginStorageGetRequest {
  cwd: string;
  plugin_name: string;
  key: string;
}

export interface PluginStorageSetRequest extends PluginStorageGetRequest {
  value: unknown;
}

export interface PluginStorageFileRequest {
  cwd: string;
  plugin_name: string;
  path: string;
}

export interface PluginStorageTextFileSetRequest extends PluginStorageFileRequest {
  content: string;
}

export interface BackendPluginContribution {
  id?: string;
  title?: string;
  icon?: string;
  opens?: string;
  renderer?: string;
  description?: string;
  [key: string]: unknown;
}

export interface BackendProviderModel {
  id: string;
  name: string;
  enabled: boolean;
  note?: string;
}

export interface BackendProviderConfig {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  models: BackendProviderModel[];
}

export interface BackendHookConfig {
  id: string;
  stage: "pre_tool_use" | "post_tool_use" | "session_start" | "session_end";
  type: "command" | "http";
  matcher: string;
  timeout: number;
  blockOnFailure: boolean;
}

export interface BackendMcpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "http";
  endpoint: string;
  enabled: boolean;
}

export interface BackendCronJobConfig {
  id: string;
  name: string;
  schedule: string;
  command?: string | null;
  prompt?: string | null;
  cwd: string;
  enabled: boolean;
  created_at: number;
  last_run?: number | null;
  next_run?: number | null;
  last_status?: unknown;
}

export interface BackendWorkspaceInfo {
  name: string;
  path: string;
  is_git_repo: boolean;
}

export interface BackendWorkspaceDirEntry {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  size?: number | null;
}

export interface BackendWorkspaceDirList {
  path: string;
  entries: BackendWorkspaceDirEntry[];
}

export interface BackendWorkspaceTextFile {
  path: string;
  content?: string | null;
  size: number;
  truncated: boolean;
  is_binary: boolean;
  encoding_error?: string | null;
  limit_bytes: number;
}

export interface BackendWorkspaceWriteResult {
  path: string;
  bytes_written: number;
}

export interface BackendWorkspaceShellResult {
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  success: boolean;
  timed_out: boolean;
  truncated: boolean;
  duration_ms: number;
}

export interface WorkspaceShellRunRequest {
  cwd: string;
  command: string;
  timeout_ms?: number;
  max_output_bytes?: number;
}

export interface BackendSettings {
  theme?: "light" | "dark" | "system";
  themePreset?: string;
  autoSaveSessions?: boolean;
  providers?: BackendProviderConfig[];
  systemPrompt: string;
  defaultProfileId: string;
  defaultReasoning: "low" | "medium" | "high";
  permissionMode: "default" | "plan" | "full_auto";
  allowedTools: string[];
  deniedTools: string[];
  pathRules: string[];
  deniedCommands: string[];
  memoryEnabled: boolean;
  memoryMaxFiles: number;
  memoryMaxEntrypointLines: number;
  hooks: BackendHookConfig[];
  mcpServers: BackendMcpServerConfig[];
  enabledPlugins: string[];
  runtimeProfiles: BackendRuntimeProfile[];
}

export interface TauriCommands {
  chat_stream: {
    request: ChatStreamRequest;
    response: void;
  };
  submit_user_answer: {
    request: SubmitAnswerRequest;
    response: void;
  };
  approve_permission: {
    request: ApprovePermissionRequest;
    response: void;
  };
  interrupt_session: {
    request: InterruptSessionRequest;
    response: void;
  };
  attach_session_stream: {
    request: AttachSessionStreamRequest;
    response: boolean;
  };
  llm_complete: {
    request: LlmCompleteRequest;
    response: string;
  };
  get_sessions: {
    request: void;
    response: BackendSessionInfo[];
  };
  list_workspace_sessions: {
    request: { cwd: string };
    response: Session[];
  };
  get_workspace_session: {
    request: { cwd: string; sessionId: string };
    response: Session | null;
  };
  save_workspace_session: {
    request: { cwd: string; session: Session };
    response: Session;
  };
  delete_workspace_session: {
    request: { cwd: string; sessionId: string };
    response: boolean;
  };
  get_settings: {
    request: void;
    response: BackendSettings;
  };
  save_settings: {
    request: { settings: BackendSettings };
    response: void;
  };
  list_plugins: {
    request: { cwd: string };
    response: BackendPluginSummary[];
  };
  enable_plugin: {
    request: { name: string };
    response: void;
  };
  disable_plugin: {
    request: { name: string };
    response: void;
  };
    install_plugin_cmd: {
      request: { sourcePath: string };
      response: BackendPluginSummary;
    };
    preview_install_plugin_cmd: {
      request: { sourcePath: string };
      response: BackendPluginInstallPreview;
    };
    uninstall_plugin_cmd: {
      request: { name: string; storagePolicy?: PluginUninstallStoragePolicy };
      response: boolean;
    };
  grant_plugin_permission: {
    request: { name: string; permission: string; cwd?: string };
    response: void;
  };
  revoke_plugin_permission: {
    request: { name: string; permission: string; cwd?: string };
    response: void;
  };
  plugin_runtime_info: {
    request: { cwd: string; pluginName: string };
    response: BackendPluginRuntimeInfo;
  };
  plugin_invoke_command: {
    request: { request: PluginCommandRequest };
    response: PluginCommandResponse;
  };
  plugin_start_command: {
    request: { request: PluginCommandRequest; onEvent: unknown };
    response: PluginCommandStartResponse;
  };
  plugin_cancel_command: {
    request: { request: PluginCommandCancelRequest };
    response: boolean;
  };
  plugin_storage_get: {
    request: { request: PluginStorageGetRequest };
    response: unknown | null;
  };
  plugin_storage_set: {
    request: { request: PluginStorageSetRequest };
    response: void;
  };
  plugin_storage_delete: {
    request: { request: PluginStorageGetRequest };
    response: void;
  };
  cron_list: {
    request: void;
    response: BackendCronJobConfig[];
  };
  workspace_info: {
    request: { path: string };
    response: BackendWorkspaceInfo;
  };
  workspace_list_dir: {
    request: { cwd: string; path: string };
    response: BackendWorkspaceDirList;
  };
  workspace_read_text_file: {
    request: { cwd: string; path: string };
    response: BackendWorkspaceTextFile;
  };
  workspace_write_text_file: {
    request: { cwd: string; path: string; content: string };
    response: BackendWorkspaceWriteResult;
  };
  workspace_shell_run: {
    request: { request: WorkspaceShellRunRequest };
    response: BackendWorkspaceShellResult;
  };
  plugin_storage_read_text_file: {
    request: { request: PluginStorageFileRequest };
    response: string | null;
  };
  plugin_storage_write_text_file: {
    request: { request: PluginStorageTextFileSetRequest };
    response: void;
  };
  plugin_storage_delete_file: {
    request: { request: PluginStorageFileRequest };
    response: void;
  };
  plugin_storage_list_files: {
    request: { request: PluginStorageFileRequest };
    response: string[];
  };
}

export type TauriCommandName = keyof TauriCommands;
