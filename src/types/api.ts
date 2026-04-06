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
}

export type TauriCommandName = keyof TauriCommands;
