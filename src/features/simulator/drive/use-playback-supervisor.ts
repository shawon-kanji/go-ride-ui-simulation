import { useEffect } from 'react';

import { subscribeBus } from '../../../shared/tab/bus';
import { STALE_AFTER_MS, useTabRegistry } from '../tab-registry';
import { usePlaybackStore } from './playback-store';

// Mounted on the simulator page. A playback holds while its driver tab is gone or silent
// (a reload says bye, then announces again) and carries on when the tab is back. A tab's
// first announcement — new, reloaded, or seen for the first time after the simulator
// reloaded — gets every shared route again.

const CHECK_MS = 1_000;

function holdOrRelease(): void {
  const { playbacks, hold, release } = usePlaybackStore.getState();
  const { tabs } = useTabRegistry.getState();
  const now = Date.now();
  for (const playback of Object.values(playbacks)) {
    const tab = tabs[playback.tabId];
    if (tab && now - tab.lastSeen <= STALE_AFTER_MS) release(playback.tabId);
    else hold(playback.tabId);
  }
}

export function usePlaybackSupervisor(): void {
  useEffect(() => {
    const seen = new Set<string>();
    const unsubscribe = subscribeBus((message) => {
      if (message.type === 'presence' && !seen.has(message.presence.tabId)) {
        seen.add(message.presence.tabId);
        // The registry has this presence too once every bus handler has run.
        queueMicrotask(() => {
          usePlaybackStore.getState().republish();
          holdOrRelease();
        });
      } else if (message.type === 'bye') {
        seen.delete(message.tabId);
        usePlaybackStore.getState().hold(message.tabId);
      }
    });
    const interval = setInterval(holdOrRelease, CHECK_MS);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);
}
