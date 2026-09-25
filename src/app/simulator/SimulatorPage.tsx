import { Car, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { STALE_AFTER_MS, useTabRegistry, useTabRegistryFeed } from '../../features/simulator/tab-registry';
import type { WsState } from '../../shared/tab/types';

// Phase 0: a live list of open tabs, to prove the bus. The map, location control and
// event timeline arrive in Phases 1 and 5.

const WS_DOT: Record<WsState, string> = {
  idle: 'bg-neutral-300',
  connecting: 'bg-warning-500',
  reconnecting: 'bg-warning-500',
  open: 'bg-success-500',
  closed: 'bg-danger-500',
};

export function SimulatorPage() {
  useTabRegistryFeed();
  const tabs = Object.values(useTabRegistry((s) => s.tabs));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    document.title = 'Go Ride · Simulator';
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const sorted = [...tabs].sort((a, b) => (a.role ?? '').localeCompare(b.role ?? '') || a.tabId.localeCompare(b.tabId));

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link to="/" className="text-[13px] font-semibold text-neutral-500 hover:text-neutral-800">
        ← Go Ride simulator
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em]">Simulator</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.open('/user', '_blank')}
            className="flex items-center gap-2 rounded-control bg-[#00a04a] px-3 py-2 text-[13px] font-bold text-white"
          >
            <Car size={16} /> Open rider tab
          </button>
          <button
            type="button"
            onClick={() => window.open('/driver', '_blank')}
            className="flex items-center gap-2 rounded-control bg-primary-500 px-3 py-2 text-[13px] font-bold text-white"
          >
            <Truck size={16} /> Open driver tab
          </button>
        </div>
      </div>

      <section className="mt-6 overflow-hidden rounded-card bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-4 py-3 text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-500">
          Open tabs · {tabs.length}
        </div>
        {sorted.length === 0 ? (
          <p className="px-4 py-10 text-center text-[14px] text-neutral-500">
            No rider or driver tabs open yet. Open one with the buttons above.
          </p>
        ) : (
          <table className="w-full text-left text-[14px]">
            <thead className="text-[12px] text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Tab</th>
                <th className="px-4 py-2 font-semibold">Role</th>
                <th className="px-4 py-2 font-semibold">User</th>
                <th className="px-4 py-2 font-semibold">Screen</th>
                <th className="px-4 py-2 font-semibold">Websocket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {sorted.map((tab) => {
                const stale = now - tab.lastSeen > STALE_AFTER_MS;
                return (
                  <tr key={tab.tabId} className={stale ? 'opacity-40' : ''}>
                    <td className="px-4 py-2 font-mono text-[12px]">{tab.tabId.slice(0, 4)}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-pill px-2 py-0.5 text-[12px] font-bold ${tab.role === 'rider' ? 'bg-[#e8f6ee] text-[#04562a]' : 'bg-primary-50 text-primary-700'}`}
                      >
                        {tab.role}
                      </span>
                    </td>
                    <td className="px-4 py-2">{tab.email ?? <span className="text-neutral-400">signed out</span>}</td>
                    <td className="px-4 py-2 font-mono text-[12px] text-neutral-500">{tab.path}</td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${WS_DOT[tab.wsState]}`} />
                        {stale ? 'stale' : tab.wsState}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
