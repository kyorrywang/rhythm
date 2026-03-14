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
  // Listen for stream events from Rust
  const unlistenChunk = await listen<string>('chat-chunk', (event) => {
    onChunk(event.payload);
  });

  const unlistenMetadata = await listen<any>('chat-metadata', (event) => {
    onMetadata(event.payload);
  });

  const unlistenDone = await listen<void>('chat-done', (event) => {
    unlistenChunk();
    unlistenMetadata();
    unlistenDone();
    onDone();
  });

  const unlistenError = await listen<string>('chat-error', (event) => {
    unlistenChunk();
    unlistenMetadata();
    unlistenDone();
    unlistenError();
    onError(event.payload);
  });

  try {
    // Invoke the rust command to start the chat process
    await invoke('start_chat', { 
      sessionId: payload.sessionId,
      message: payload.message,
      workspacePath: payload.workspacePath
    });
  } catch (error) {
    onError(error);
  }

  // Return a cleanup function (equivalent to abort)
  return () => {
    unlistenChunk();
    unlistenMetadata();
    unlistenDone();
    unlistenError();
  };
};
