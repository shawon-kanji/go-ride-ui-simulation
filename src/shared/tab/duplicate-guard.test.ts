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
    newcomer.postMessage({ type: 'tab-claim', tabId: 'tab-b', bootId: 'boot-2', bootedAt: Date.now() } satisfies BusMessage);
    await vi.waitFor(() => expect(bus.messages).toContainEqual({ type: 'tab-conflict', tabId: 'tab-b', bootId: 'boot-2' }));

    newcomer.close();
    bus.close();
  });

  it('defends its id while still booting, so a tab booting right after it resets', async () => {
    window.sessionStorage.setItem('goride:tab-id', 'tab-c');
    const tab = await loadTab();
    const bus = listen();
    const claiming = tab.claimTabIdentity(300);

    // A duplicate boots 50ms into the original's own claim window.
    const newcomer = new BroadcastChannel('goride-sim');
    await new Promise((resolve) => setTimeout(resolve, 50));
    newcomer.postMessage({ type: 'tab-claim', tabId: 'tab-c', bootId: 'late-boot', bootedAt: Date.now() + 1 } satisfies BusMessage);

    await vi.waitFor(() => expect(bus.messages).toContainEqual({ type: 'tab-conflict', tabId: 'tab-c', bootId: 'late-boot' }));
    expect(await claiming).toBe(false);
    expect(tab.getTabId()).toBe('tab-c');
    newcomer.close();
    bus.close();
  });

  it('resets itself when an earlier-booted tab with the same id claims during its window', async () => {
    window.sessionStorage.setItem('goride:tab-id', 'tab-d');
    window.sessionStorage.setItem('goride:session:driver', '{"token":"t"}');
    const tab = await loadTab();
    const claiming = tab.claimTabIdentity(300);

    const earlier = new BroadcastChannel('goride-sim');
    earlier.postMessage({ type: 'tab-claim', tabId: 'tab-d', bootId: 'early-boot', bootedAt: Date.now() - 1_000 } satisfies BusMessage);

    expect(await claiming).toBe(true);
    expect(tab.getTabId()).not.toBe('tab-d');
    expect(window.sessionStorage.getItem('goride:session:driver')).toBeNull();
    earlier.close();
  });
});
