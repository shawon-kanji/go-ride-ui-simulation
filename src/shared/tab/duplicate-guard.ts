import { postBus, subscribeBus } from './bus';
import { getTabId, regenerateTabId } from './tab-identity';

// Chrome's and Firefox's "Duplicate tab" copy sessionStorage, so the copy boots with
// the same tabId and the same signed-in session as the original. Two tabs sharing a
// device_id would make the websocket gateway treat them as one device, so the newer
// tab must become a fresh, signed-out device.
//
// Protocol: a booting tab posts `tab-claim` (with its boot time) and waits briefly.
//   - A tab holding the same tabId that booted earlier answers `tab-conflict`.
//   - Every tab defends its id from the moment it starts booting, so two tabs that
//     boot at nearly the same time still resolve: the later boot resets.
// A reload doesn't trigger this — the old page is gone before the new one boots.

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
  const bootedAt = Date.now();
  let settled = false;
  let conflicted = false;
  let resolveWait: () => void = () => undefined;

  subscribeBus((message) => {
    if (message.type === 'tab-conflict' && message.bootId === bootId && !settled) {
      conflicted = true;
      resolveWait();
      return;
    }
    if (message.type !== 'tab-claim' || message.bootId === bootId || message.tabId !== getTabId()) return;

    const theyAreNewer =
      message.bootedAt > bootedAt || (message.bootedAt === bootedAt && message.bootId > bootId);
    if (settled || theyAreNewer) {
      postBus({ type: 'tab-conflict', tabId: message.tabId, bootId: message.bootId });
    } else {
      // Both booting with the same id and this tab is the newer one.
      conflicted = true;
      resolveWait();
    }
  });

  await new Promise<void>((resolve) => {
    resolveWait = resolve;
    setTimeout(resolve, waitMs);
    postBus({ type: 'tab-claim', tabId: getTabId(), bootId, bootedAt });
  });

  if (conflicted) {
    clearTabState();
    regenerateTabId();
  }
  settled = true;
  return conflicted;
}
