import { Shuffle } from 'lucide-react';
import { useState } from 'react';

import { moveTab } from '../commands';
import { readMapView } from '../map-view';
import { liveDrivers, useTabRegistry } from '../tab-registry';
import { scatterPoints } from './scatter';
import { useOnlineRequests } from './use-online-requests';

// Sidebar: every signed-in driver tab at once — scatter them around the map centre, and take
// them online or offline (each tab does it itself; see use-simulator-online.ts). Drivers on a
// trip are never moved.

const RADII = [500, 1500, 3000] as const;
const MIN_GAP_M = 150;

export function DriverFleet() {
  const driverCount = useTabRegistry((s) => Object.values(s.tabs).filter((t) => t.role === 'driver' && t.email).length);
  const [radius, setRadius] = useState<(typeof RADII)[number]>(1500);
  const onlineRequests = useOnlineRequests();
  const [note, setNote] = useState<string | null>(null);

  const scatter = () => {
    const drivers = liveDrivers().filter((t) => t.locationSource === 'simulated' && !t.driverTrip);
    const skipped = liveDrivers().length - drivers.length;
    const points = scatterPoints(readMapView().center, drivers.length, radius, MIN_GAP_M);
    onlineRequests.clear();
    drivers.forEach((tab, i) => moveTab(tab.tabId, points[i]));
    setNote(
      `Scattered ${drivers.length} driver${drivers.length === 1 ? '' : 's'} within ${radius >= 1000 ? `${radius / 1000} km` : `${radius} m`} of the map centre` +
        (skipped > 0 ? ` (${skipped} on a trip or on browser GPS left alone).` : '.'),
    );
  };

  const setOnline = (online: boolean) => {
    setNote(null);
    onlineRequests.request(liveDrivers(), online);
  };

  const disabled = driverCount === 0;
  const summary = onlineRequests.summary ?? note;

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
