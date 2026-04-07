export interface ChatStreamRequest {
  sessionId: string;
  prompt: string;
  cwd?: string;
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

export interface BackendSessionInfo {
  session_id: string;
  status: string;
  created_at: string;
}

export interface BackendPluginSummary {
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  skills_count: number;
  path: string;
}

export interface BackendProviderModel {
  id: string;
  name: string;
  isDefault?: boolean;
  enabled: boolean;
  note?: string;
}

export interface BackendProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  isDefault?: boolean;
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

export interface BackendSettings {
  theme?: "light" | "dark" | "system";
  autoSaveSessions?: boolean;
  providers?: BackendProviderConfig[];
  systemPrompt: string;
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
  autoCompactEnabled: boolean;
  autoCompactThresholdRatio: number;
  autoCompactMaxMicroCompacts: number;
  enabledPlugins: string[];
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
  get_sessions: {
    request: void;
    response: BackendSessionInfo[];
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
  cron_list: {
    request: void;
    response: BackendCronJobConfig[];
  };
}

export type TauriCommandName = keyof TauriCommands;
