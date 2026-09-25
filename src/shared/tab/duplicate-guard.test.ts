import type { BusMessage } from './types';

// Each test gets fresh module instances (and so a fresh BroadcastChannel) per "tab".
async function loadTab() {
  vi.resetModules();
  const guard = await import('./duplicate-guard');
  const identity = await import('./tab-identity');
  return { ...guard, ...identity };
}

function listen(): { messages: BusMessage[]; close: () => void } {
  const channel = new BroadcastChannel('goride-sim');
  const messages: BusMessage[] = [];
  channel.onmessage = (event: MessageEvent<BusMessage>) => messages.push(event.data);
  return { messages, close: () => channel.close() };
}

describe('claimTabIdentity', () => {
  it('keeps the stored tabId when no other tab claims it', async () => {
    window.sessionStorage.setItem('goride:tab-id', 'tab-a');
    window.sessionStorage.setItem('goride:session:rider', '{"token":"t"}');
    const tab = await loadTab();

    const wasDuplicate = await tab.claimTabIdentity(30);

    expect(wasDuplicate).toBe(false);
    expect(tab.getTabId()).toBe('tab-a');
    expect(window.sessionStorage.getItem('goride:session:rider')).not.toBeNull();
  });

  it('resets identity and clears copied session state when a live tab owns the id', async () => {
    window.sessionStorage.setItem('goride:tab-id', 'tab-a');
    window.sessionStorage.setItem('goride:session:rider', '{"token":"t"}');

    // Stand-in for the original tab: answers any claim for tab-a with a conflict.
    const original = new BroadcastChannel('goride-sim');
    original.onmessage = (event: MessageEvent<BusMessage>) => {
      const message = event.data;
      if (message.type === 'tab-claim' && message.tabId === 'tab-a') {
        original.postMessage({ type: 'tab-conflict', tabId: 'tab-a', bootId: message.bootId } satisfies BusMessage);
      }
    };

    const tab = await loadTab();
    const wasDuplicate = await tab.claimTabIdentity(200);
    original.close();

    expect(wasDuplicate).toBe(true);
    expect(tab.getTabId()).not.toBe('tab-a');
    expect(window.sessionStorage.getItem('goride:session:rider')).toBeNull();
    expect(window.sessionStorage.getItem('goride:tab-id')).toBe(tab.getTabId());
  });

  it('answers later claims for its own id with a conflict', async () => {
    window.sessionStorage.setItem('goride:tab-id', 'tab-b');
    const tab = await loadTab();
    await tab.claimTabIdentity(20);
    const bus = listen();

    const newcomer = new BroadcastChannel('goride-sim');
    newcomer.postMessage({ type: 'tab-claim', tabId: 'tab-b', bootId: 'boot-2' } satisfies BusMessage);
    await vi.waitFor(() => expect(bus.messages).toContainEqual({ type: 'tab-conflict', tabId: 'tab-b', bootId: 'boot-2' }));

    newcomer.close();
    bus.close();
  });
});
