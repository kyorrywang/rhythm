import { invoke, Channel } from '@tauri-apps/api/core';
import type { TauriCommands, TauriCommandName } from '@/shared/types/api';
import type { ServerEventChunk } from '@/shared/types/schema';

export async function tauriInvoke<T extends TauriCommandName>(
  command: T,
  args: TauriCommands[T]['request'],
): Promise<TauriCommands[T]['response']> {
  return invoke<TauriCommands[T]['response']>(command, args as unknown as Record<string, unknown>);
}

export function createEventChannel(
  onMessage: (chunk: ServerEventChunk) => void,
  onError?: (error: unknown) => void,
): Channel<ServerEventChunk> {
  const channel = new Channel<ServerEventChunk>();

  channel.onmessage = (chunk) => {
    try {
      onMessage(chunk);
    } catch (err) {
      console.error('[EventChannel] Error processing event:', err);
      onError?.(err);
    }
  };

  return channel;
}

export class TauriClient {
  async invoke<T extends TauriCommandName>(
    command: T,
    args: TauriCommands[T]['request'],
  ): Promise<TauriCommands[T]['response']> {
    return tauriInvoke(command, args);
  }

  createChannel(
    onMessage: (chunk: ServerEventChunk) => void,
    onError?: (error: unknown) => void,
  ): Channel<ServerEventChunk> {
    return createEventChannel(onMessage, onError);
  }
}

export const client = new TauriClient();
