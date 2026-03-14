import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface ChatMessagePayload {
  sessionId: string;
  message: string;
  workspacePath: string;
}

export const streamChat = async (
  payload: ChatMessagePayload,
  onChunk: (text: string) => void,
  onMetadata: (data: any) => void,
  onDone: () => void,
  onError: (err: any) => void
) => {
  let unlistenEvent: (() => void) | null = null;
  let unlistenFinished: (() => void) | null = null;

  const cleanup = () => {
    if (unlistenEvent) unlistenEvent();
    if (unlistenFinished) unlistenFinished();
  };

  try {
    unlistenEvent = await listen<string>('chat-event', (event) => {
      try {
        const parsed = JSON.parse(event.payload);
        if (parsed.type === 'chunk') {
          onChunk(parsed.content);
        } else if (parsed.type === 'metadata') {
          onMetadata(parsed);
        }
      } catch (e) {
        console.error("Parse error in Rust bridge", e);
      }
    });

    unlistenFinished = await listen('chat-finished', () => {
      cleanup();
      onDone();
    });

    await invoke('stream_chat', { 
      payload: {
        session_id: payload.sessionId,
        message: payload.message,
        workspace_path: payload.workspacePath
      }
    });
  } catch (error) {
    cleanup();
    onError(error);
  }
  
  return cleanup;
};
