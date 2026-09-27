import { Shuffle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { postBus, subscribeBus } from '../../../shared/tab/bus';
import { moveTab } from '../commands';
import { readMapView } from '../map-view';
import { STALE_AFTER_MS, actorLabel, useTabRegistry, type RegisteredTab } from '../tab-registry';
import { scatterPoints } from './scatter';

// Sidebar: every signed-in driver tab at once — scatter them around the map centre, and take
// them online or offline (each tab does it itself; see use-simulator-online.ts). Drivers on a
// trip are never moved.

const RADII = [500, 1500, 3000] as const;
const MIN_GAP_M = 150;
const ANSWER_TIMEOUT_MS = 8_000;

interface Batch {
  online: boolean;
  waiting: Set<string>;
  failures: { name: string; reason: string }[];
  succeeded: number;
}

function liveDrivers(): RegisteredTab[] {
  const now = Date.now();
  return Object.values(useTabRegistry.getState().tabs).filter(
    (t) => t.role === 'driver' && t.email && now - t.lastSeen <= STALE_AFTER_MS,
  );
}

export function DriverFleet() {
  const driverCount = useTabRegistry((s) => Object.values(s.tabs).filter((t) => t.role === 'driver' && t.email).length);
  const [radius, setRadius] = useState<(typeof RADII)[number]>(1500);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const names = useRef(new Map<string, string>());

  useEffect(
    () =>
      subscribeBus((message) => {
        if (message.type !== 'set-online-result') return;
        setBatch((current) => {
          if (!current || current.online !== message.online || !current.waiting.has(message.tabId)) return current;
          const waiting = new Set(current.waiting);
          waiting.delete(message.tabId);
          return message.ok
            ? { ...current, waiting, succeeded: current.succeeded + 1 }
            : {
                ...current,
                waiting,
                failures: [...current.failures, { name: names.current.get(message.tabId) ?? 'driver', reason: message.reason ?? 'failed' }],
              };
        });
      }),
    [],
  );

  // Tabs that never answer (closed, or an old build without the handler).
  useEffect(() => {
    if (!batch || batch.waiting.size === 0) return;
    const timer = setTimeout(() => {
      setBatch((current) =>
        current && current.waiting.size > 0
          ? {
              ...current,
              waiting: new Set(),
              failures: [...current.failures, ...[...current.waiting].map((id) => ({ name: names.current.get(id) ?? 'driver', reason: 'no answer' }))],
            }
          : current,
      );
    }, ANSWER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [batch]);

  const scatter = () => {
    const drivers = liveDrivers().filter((t) => t.locationSource === 'simulated' && !t.driverTrip);
    const skipped = liveDrivers().length - drivers.length;
    const points = scatterPoints(readMapView().center, drivers.length, radius, MIN_GAP_M);
    drivers.forEach((tab, i) => moveTab(tab.tabId, points[i]));
    setNote(
      `Scattered ${drivers.length} driver${drivers.length === 1 ? '' : 's'} within ${radius >= 1000 ? `${radius / 1000} km` : `${radius} m`} of the map centre` +
        (skipped > 0 ? ` (${skipped} on a trip or on browser GPS left alone).` : '.'),
    );
  };

  const setOnline = (online: boolean) => {
    const drivers = liveDrivers();
    for (const tab of drivers) names.current.set(tab.tabId, actorLabel(tab));
    setNote(null);
    setBatch({ online, waiting: new Set(drivers.map((t) => t.tabId)), failures: [], succeeded: 0 });
    for (const tab of drivers) postBus({ type: 'set-online', tabId: tab.tabId, online });
  };

  const disabled = driverCount === 0;
  let summary: string | null = note;
  if (batch) {
    const verb = batch.online ? 'online' : 'offline';
    summary =
      batch.waiting.size > 0
        ? `Asking ${batch.waiting.size} driver${batch.waiting.size === 1 ? '' : 's'} to go ${verb}…`
        : `${batch.succeeded} went ${verb}` +
          (batch.failures.length > 0 ? ` · ${batch.failures.map((f) => `${f.name}: ${f.reason}`).join(' · ')}` : '.');
  }

  return (
    <section data-testid="driver-fleet" className="mt-3 rounded-control bg-white px-3 py-2.5 text-[13px] ring-1 ring-neutral-200">
      <p className="font-bold text-neutral-900">
        Drivers on the map <span className="font-normal text-neutral-500">· {driverCount} signed in</span>
      </p>
      <div className="mt-2 flex items-center gap-1">
        <select
          aria-label="Scatter radius"
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value) as (typeof RADII)[number])}
          className="rounded-md border border-neutral-300 px-1.5 py-1"
        >
          {RADII.map((r) => (
            <option key={r} value={r}>
              {r >= 1000 ? `${r / 1000} km` : `${r} m`}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="scatter-drivers"
          disabled={disabled}
          onClick={scatter}
          className="flex items-center gap-1 rounded-md bg-neutral-900 px-2 py-1 font-bold text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          <Shuffle size={13} /> Scatter
        </button>
        <span className="flex-1" />
        <button
          type="button"
          data-testid="drivers-online"
          disabled={disabled}
          onClick={() => setOnline(true)}
          className="rounded-md bg-success-600 px-2 py-1 font-bold text-white hover:bg-success-700 disabled:opacity-40"
        >
          Online
        </button>
        <button
          type="button"
          data-testid="drivers-offline"
          disabled={disabled}
          onClick={() => setOnline(false)}
          className="rounded-md border border-neutral-300 px-2 py-1 font-bold text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
        >
          Offline
        </button>
      </div>
      {summary && (
        <p data-testid="driver-fleet-summary" className="mt-2 text-[12px] text-neutral-600">
          {summary}
        </p>
      )}
    </section>
  );
}
