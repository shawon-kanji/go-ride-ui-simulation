import { Car, Truck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { moveTab } from '../../features/simulator/commands';
import { useAutoDrive, useDriveAutomation } from '../../features/simulator/drive/use-drive-automation';
import { usePlaybackSupervisor } from '../../features/simulator/drive/use-playback-supervisor';
import { SimulatorMap } from '../../features/simulator/SimulatorMap';
import { TabList } from '../../features/simulator/TabList';
import {
  useTabRegistry,
  useTabRegistryFeed,
  staleKeyOf,
  type RegisteredTab,
} from '../../features/simulator/tab-registry';
import type { GeoPoint } from '../../shared/location/location-store';
import { ErrorBoundary } from '../../shared/ui/ErrorBoundary';

// Full-screen simulator: open tabs on the left, the map on the right. Select a tab and
// click the map (or drag its marker) to move that tab's simulated GPS. A driver on a trip
// can be driven along real roads (its playback card, or auto-drive).
// Phone tabs open with `noopener`: a tab opened with an opener shares the simulator's
// process and main thread, so its rendering would stall the simulator's map.

const HAS_MAPS_KEY = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);

export function SimulatorPage() {
  useTabRegistryFeed();
  usePlaybackSupervisor();
  useDriveAutomation();
  const autoDrive = useAutoDrive((s) => s.on);
  const setAutoDrive = useAutoDrive((s) => s.setOn);
  const tabsById = useTabRegistry((s) => s.tabs);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<GeoPoint | null>(null);
  const [staleKey, setStaleKey] = useState('');

  useEffect(() => {
    document.title = 'Go Ride · Simulator';
    // Checked every second, but the page only re-renders when the set of stale tabs changes.
    const interval = setInterval(() => setStaleKey(staleKeyOf(Object.values(useTabRegistry.getState().tabs), Date.now())), 1000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const tabs = useMemo(
    () =>
      Object.values(tabsById).sort(
        (a, b) => (a.name ?? '~').localeCompare(b.name ?? '~') || a.tabId.localeCompare(b.tabId),
      ),
    [tabsById],
  );
  const selected = selectedId ? (tabsById[selectedId] ?? null) : null;
  const isStale = useCallback((tab: RegisteredTab) => staleKey.split(',').includes(tab.tabId), [staleKey]);
  const onLocate = useCallback((tab: RegisteredTab) => {
    setSelectedId(tab.tabId);
    if (tab.location) setFocus({ ...tab.location });
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="flex w-[360px] shrink-0 flex-col border-r border-neutral-200 bg-neutral-50">
        <div className="px-5 pt-5 pb-4">
          <Link to="/" className="text-[13px] font-semibold text-neutral-500 hover:text-neutral-800">
            ← Go Ride
          </Link>
          <h1 className="mt-1 text-[24px] font-extrabold tracking-[-0.02em]">Simulator</h1>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => window.open('/user', '_blank', 'noopener')}
              className="flex flex-1 items-center justify-center gap-2 rounded-control bg-[#00a04a] px-3 py-2 text-[13px] font-bold text-white hover:bg-[#008a3f]"
            >
              <Car size={16} /> Open rider tab
            </button>
            <button
              type="button"
              onClick={() => window.open('/driver', '_blank', 'noopener')}
              className="flex flex-1 items-center justify-center gap-2 rounded-control bg-primary-500 px-3 py-2 text-[13px] font-bold text-white hover:bg-primary-600"
            >
              <Truck size={16} /> Open driver tab
            </button>
          </div>
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-control bg-white px-3 py-2 text-[13px] ring-1 ring-neutral-200">
            <input
              type="checkbox"
              data-testid="auto-drive"
              checked={autoDrive}
              onChange={(e) => setAutoDrive(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#4f46e5]"
            />
            <span>
              <span className="font-bold text-neutral-900">Auto-drive</span>
              <span className="block text-neutral-500">
                Drivers drive to the pickup when they accept, and to the drop-off once the trip starts.
              </span>
            </span>
          </label>
        </div>
        <div className="flex-1 overflow-y-auto">
          <TabList
            tabs={tabs}
            selectedId={selectedId}
            isStale={isStale}
            onSelect={setSelectedId}
            onLocate={onLocate}
          />
        </div>
      </aside>

      <main className="relative flex-1">
        {HAS_MAPS_KEY ? (
          <ErrorBoundary
            fallback={(error) => (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-neutral-600">
                <p className="font-bold text-neutral-900">The map failed to load.</p>
                <p className="max-w-md text-[14px]">
                  {error.message}. Check the browser console for a Google Maps error — a rejected key shows up as
                  RefererNotAllowedMapError or InvalidKeyMapError.
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-control bg-neutral-900 px-4 py-2 text-[13px] font-bold text-white"
                >
                  Reload
                </button>
              </div>
            )}
          >
            <SimulatorMap
              tabs={tabs}
              selected={selected}
              focus={focus}
              isStale={isStale}
              onSelect={setSelectedId}
              onMove={moveTab}
            />
          </ErrorBoundary>
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-neutral-600">
            <p>
              Set <code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code> in <code>.env</code> and restart{' '}
              <code>npm run dev</code> to load the map.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
