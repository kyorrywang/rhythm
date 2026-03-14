import { fetchEventSource } from '@microsoft/fetch-event-source';

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
  const ctrl = new AbortController();
  try {
    await fetchEventSource('http://localhost:8000/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: payload.sessionId,
        message: payload.message,
        workspace_path: payload.workspacePath
      }),
      signal: ctrl.signal,
      onmessage(msg) {
        if (msg.data === '[DONE]') {
          onDone();
          return;
        }
        try {
          const parsed = JSON.parse(msg.data);
          if (parsed.type === 'chunk') {
            onChunk(parsed.content);
          } else if (parsed.type === 'metadata') {
            onMetadata(parsed);
          }
        } catch (e) {
          console.error("Parse error", e);
        }
      },
      onerror(err) {
        onError(err);
        throw err; // Prevent auto-retry
      }
    });
  } catch (error) {
    onError(error);
  }
  return ctrl;
};
