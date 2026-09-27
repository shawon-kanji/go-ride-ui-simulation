import { create } from 'zustand';

import { logEvent } from '../devlog/devlog-store';
import { tabStorage } from '../lib/storage';

// The tab's "GPS". Screens read the position from here and never call geolocation
// directly, so the simulator can move a tab around. Two sources:
//   - simulated (default): positions arrive from the simulator over the bus
//   - browser: navigator.geolocation.watchPosition
// Source and last simulated fix are kept in sessionStorage so a reload stays put.

export type LocationSource = 'simulated' | 'browser';

export interface GeoPoint {
  lat: number;
  lng: number;
  /** Metres; browser fixes only. */
  accuracyM?: number;
  /** Compass degrees; simulated route playback only. */
  heading?: number;
}

interface StoredLocation {
  source: LocationSource;
  simulated: GeoPoint | null;
}

interface LocationState {
  source: LocationSource;
  position: GeoPoint | null;
  updatedAt: number | null;
  /** Last simulated fix, restored when switching back from the browser source. */
  simulated: GeoPoint | null;
  browserError: string | null;
  setSource: (source: LocationSource) => void;
  /** `playback`: a route playback fix — these arrive several times a second, so only some are logged. */
  applySimulated: (point: GeoPoint, options?: { playback?: boolean }) => void;
  applyBrowserFix: (point: GeoPoint) => void;
  setBrowserError: (message: string | null) => void;
}

const STORAGE_KEY = 'goride:location';
/** Every log entry is also posted on the bus; playback fixes are logged at most this often. */
export const PLAYBACK_LOG_EVERY_MS = 5_000;

function persist(state: Pick<LocationState, 'source' | 'simulated'>): void {
  tabStorage.setJson(STORAGE_KEY, { source: state.source, simulated: state.simulated } satisfies StoredLocation);
}

export function formatPoint(point: GeoPoint): string {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

export function createLocationStore() {
  const stored = tabStorage.getJson<StoredLocation>(STORAGE_KEY);
  const source = stored?.source ?? 'simulated';
  const simulated = stored?.simulated ?? null;

  let lastPlaybackLogAt = 0;

  return create<LocationState>((set, get) => ({
    source,
    simulated,
    position: source === 'simulated' ? simulated : null,
    updatedAt: source === 'simulated' && simulated ? Date.now() : null,
    browserError: null,

    setSource: (next) => {
      if (next === get().source) return;
      const { simulated: lastSimulated } = get();
      set({
        source: next,
        position: next === 'simulated' ? lastSimulated : null,
        updatedAt: next === 'simulated' && lastSimulated ? Date.now() : null,
        browserError: null,
      });
      persist(get());
      logEvent('location', `source → ${next}`);
    },

    applySimulated: (point, options) => {
      set({ simulated: point });
      if (get().source === 'simulated') {
        const now = Date.now();
        set({ position: point, updatedAt: now });
        if (!options?.playback) {
          logEvent('location', `simulated ${formatPoint(point)}`, point);
        } else if (now - lastPlaybackLogAt >= PLAYBACK_LOG_EVERY_MS) {
          lastPlaybackLogAt = now;
          logEvent('location', `driving ${formatPoint(point)}`, point);
        }
      }
      persist(get());
    },

    applyBrowserFix: (point) => {
      if (get().source !== 'browser') return;
      set({ position: point, updatedAt: Date.now(), browserError: null });
      logEvent('location', `browser ${formatPoint(point)} ±${Math.round(point.accuracyM ?? 0)}m`, point);
    },

    setBrowserError: (message) => set({ browserError: message }),
  }));
}

export const useLocationStore = createLocationStore();
