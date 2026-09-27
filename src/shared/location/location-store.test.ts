import { renderHook } from '@testing-library/react';

import type { BusMessage } from '../tab/types';
import { createLocationStore, formatPoint } from './location-store';

const KLCC = { lat: 3.1579, lng: 101.7116 };

describe('location store', () => {
  it('defaults to the simulated source with no position', () => {
    const store = createLocationStore();
    expect(store.getState().source).toBe('simulated');
    expect(store.getState().position).toBeNull();
  });

  it('applies simulated fixes and restores them after a reload', () => {
    const store = createLocationStore();
    store.getState().applySimulated(KLCC);
    expect(store.getState().position).toEqual(KLCC);

    const reloaded = createLocationStore();
    expect(reloaded.getState().position).toEqual(KLCC);
  });

  it('remembers simulated fixes while on browser GPS without applying them', () => {
    const store = createLocationStore();
    store.getState().setSource('browser');
    store.getState().applySimulated(KLCC);
    expect(store.getState().position).toBeNull();

    store.getState().setSource('simulated');
    expect(store.getState().position).toEqual(KLCC);
  });

  it('ignores browser fixes while simulated', () => {
    const store = createLocationStore();
    store.getState().applyBrowserFix({ lat: 1, lng: 2, accuracyM: 5 });
    expect(store.getState().position).toBeNull();
  });

  it('logs route playback fixes only every few seconds, but applies every one', async () => {
    vi.useFakeTimers();
    try {
      const { useDevLogStore } = await import('../devlog/devlog-store');
      useDevLogStore.getState().clear();
      const store = createLocationStore();
      for (let i = 0; i < 40; i++) {
        store.getState().applySimulated({ lat: KLCC.lat + i * 1e-5, lng: KLCC.lng, heading: 90 }, { playback: true });
        vi.advanceTimersByTime(250); // 4 Hz for 10 s
      }
      expect(store.getState().position).toMatchObject({ lat: KLCC.lat + 39e-5, heading: 90 });
      const logged = useDevLogStore.getState().entries.filter((e) => e.kind === 'location');
      expect(logged).toHaveLength(2);

      store.getState().applySimulated(KLCC);
      expect(useDevLogStore.getState().entries.filter((e) => e.kind === 'location')).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('formats points to 5 decimals', () => {
    expect(formatPoint({ lat: 3.1390001, lng: 101.68694 })).toBe('3.13900, 101.68694');
  });
});

describe('useLocationProvider', () => {
  it('moves this tab when the simulator sends set-location for its tabId', async () => {
    vi.resetModules();
    window.sessionStorage.setItem('goride:tab-id', 'tab-under-test');
    const { useLocationProvider } = await import('./use-location-provider');
    const { useLocationStore } = await import('./location-store');
    renderHook(() => useLocationProvider());

    const simulator = new BroadcastChannel('goride-sim');
    simulator.postMessage({ type: 'set-location', tabId: 'someone-else', lat: 1, lng: 1 } satisfies BusMessage);
    simulator.postMessage({ type: 'set-location', tabId: 'tab-under-test', ...KLCC } satisfies BusMessage);

    await vi.waitFor(() => expect(useLocationStore.getState().position).toEqual(KLCC));
    simulator.close();
  });
});
