import { Car, Truck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { moveTab } from '../../features/simulator/commands';
import { SimulatorMap } from '../../features/simulator/SimulatorMap';
import { TabList } from '../../features/simulator/TabList';
import {
  STALE_AFTER_MS,
  useTabRegistry,
  useTabRegistryFeed,
  type RegisteredTab,
} from '../../features/simulator/tab-registry';
import type { GeoPoint } from '../../shared/location/location-store';
import { ErrorBoundary } from '../../shared/ui/ErrorBoundary';

// Full-screen simulator: open tabs on the left, the map on the right. Select a tab and
// click the map (or drag its marker) to move that tab's simulated GPS.

const HAS_MAPS_KEY = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);

export function SimulatorPage() {
  useTabRegistryFeed();
  const tabsById = useTabRegistry((s) => s.tabs);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<GeoPoint | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    document.title = 'Go Ride · Simulator';
    const interval = setInterval(() => setNow(Date.now()), 1000);
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
  const isStale = useCallback((tab: RegisteredTab) => now - tab.lastSeen > STALE_AFTER_MS, [now]);

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
              onClick={() => window.open('/user', '_blank')}
              className="flex flex-1 items-center justify-center gap-2 rounded-control bg-[#00a04a] px-3 py-2 text-[13px] font-bold text-white hover:bg-[#008a3f]"
            >
              <Car size={16} /> Open rider tab
            </button>
            <button
              type="button"
              onClick={() => window.open('/driver', '_blank')}
              className="flex flex-1 items-center justify-center gap-2 rounded-control bg-primary-500 px-3 py-2 text-[13px] font-bold text-white hover:bg-primary-600"
            >
              <Truck size={16} /> Open driver tab
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <TabList
            tabs={tabs}
            selectedId={selectedId}
            isStale={isStale}
            onSelect={setSelectedId}
            onLocate={(tab) => {
              setSelectedId(tab.tabId);
              if (tab.location) setFocus({ ...tab.location });
            }}
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
