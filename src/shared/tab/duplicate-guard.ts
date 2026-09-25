import { postBus, subscribeBus } from './bus';
import { getTabId, regenerateTabId } from './tab-identity';

// Chrome's "Duplicate tab" copies sessionStorage, so the copy boots with the same tabId
// and the same signed-in session as the original. Two tabs sharing a device_id would
// make the websocket gateway treat them as one device, so the newer tab must become a
// fresh, signed-out device.
//
// Protocol: a booting tab posts `tab-claim` and waits briefly. Any live tab holding the
// same tabId answers `tab-conflict` for that boot. A reload doesn't trigger this — the
// old page is gone before the new one boots.

const CLAIM_WAIT_MS = 200;
const TAB_STATE_PREFIX = 'goride:';

function clearTabState(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith(TAB_STATE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Storage unavailable — nothing was copied, so nothing to clear.
  }
}

/** Resolves once this tab owns a unique tabId. Returns true if it had to reset. */
export async function claimTabIdentity(waitMs = CLAIM_WAIT_MS): Promise<boolean> {
  const bootId = crypto.randomUUID();
  const claimedId = getTabId();

  const wasDuplicate = await new Promise<boolean>((resolve) => {
    const unsubscribe = subscribeBus((message) => {
      if (message.type === 'tab-conflict' && message.bootId === bootId) {
        unsubscribe();
        clearTimeout(timer);
        resolve(true);
      }
    });
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, waitMs);
    postBus({ type: 'tab-claim', tabId: claimedId, bootId });
  });

  if (wasDuplicate) {
    clearTabState();
    regenerateTabId();
  }

  // From now on, defend this tab's id against later duplicates.
  subscribeBus((message) => {
    if (message.type === 'tab-claim' && message.tabId === getTabId()) {
      postBus({ type: 'tab-conflict', tabId: message.tabId, bootId: message.bootId });
    }
  });

  return wasDuplicate;
}
