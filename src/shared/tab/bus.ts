import type { BusMessage } from './types';

// One BroadcastChannel per page, shared by every module. BroadcastChannel never
// delivers a message back to the instance that posted it, so a tab doesn't hear itself.

const CHANNEL_NAME = 'goride-sim';

type Handler = (message: BusMessage) => void;

let channel: BroadcastChannel | null = null;
const handlers = new Set<Handler>();

function getChannel(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof BroadcastChannel === 'undefined') return null;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<BusMessage>) => {
    for (const handler of handlers) handler(event.data);
  };
  return channel;
}

export function postBus(message: BusMessage): void {
  getChannel()?.postMessage(message);
}

export function subscribeBus(handler: Handler): () => void {
  getChannel();
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}
