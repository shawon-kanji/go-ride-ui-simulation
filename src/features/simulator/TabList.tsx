import { Car, Crosshair, Navigation, User } from 'lucide-react';

import { formatPoint } from '../../shared/location/location-store';
import type { WsState } from '../../shared/tab/types';
import type { RegisteredTab } from './tab-registry';

// Sidebar list of every open tab, grouped by role. Selecting a tab arms the map:
// the next map click moves that tab.

const WS_DOT: Record<WsState, string> = {
  idle: 'bg-neutral-300',
  connecting: 'bg-warning-500',
  reconnecting: 'bg-warning-500',
  open: 'bg-success-500',
  closed: 'bg-danger-500',
};

interface TabListProps {
  tabs: RegisteredTab[];
  selectedId: string | null;
  isStale: (tab: RegisteredTab) => boolean;
  onSelect: (tabId: string | null) => void;
  onLocate: (tab: RegisteredTab) => void;
}

export function TabList({ tabs, selectedId, isStale, onSelect, onLocate }: TabListProps) {
  const groups = [
    { title: 'Drivers', role: 'driver' as const, Icon: Car },
    { title: 'Riders', role: 'rider' as const, Icon: User },
  ];

  if (tabs.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-[14px] text-neutral-500">
        No rider or driver tabs open yet. Open one with the buttons above — each tab is its own device.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-3 pb-6">
      {groups.map(({ title, role, Icon }) => {
        const members = tabs.filter((tab) => tab.role === role);
        if (members.length === 0) return null;
        return (
          <section key={role}>
            <h2 className="px-2 pb-2 text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-500">
              {title} · {members.length}
            </h2>
            <ul className="flex flex-col gap-1.5">
              {members.map((tab) => {
                const selected = tab.tabId === selectedId;
                const stale = isStale(tab);
                return (
                  <li key={tab.tabId}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected}
                      data-testid={`tab-row-${tab.tabId}`}
                      onClick={() => onSelect(selected ? null : tab.tabId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') onSelect(selected ? null : tab.tabId);
                      }}
                      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${selected ? 'border-neutral-900 bg-white shadow-sm' : 'border-transparent bg-white/60 hover:bg-white'} ${stale ? 'opacity-50' : ''}`}
                    >
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${role === 'driver' ? 'bg-[#4f46e5]' : 'bg-[#00a04a]'}`}
                      >
                        <Icon size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-bold">
                          {tab.name ?? <span className="font-semibold text-neutral-400">Signed out</span>}
                        </p>
                        <p className="truncate text-[12px] text-neutral-500">
                          {tab.email ?? 'no session'} · <span className="font-mono">{tab.tabId.slice(0, 4)}</span>
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[12px] text-neutral-600">
                          <span className={`h-1.5 w-1.5 rounded-full ${WS_DOT[tab.wsState]}`} />
                          {stale ? 'stale' : `ws ${tab.wsState}`}
                          <span className="text-neutral-300">·</span>
                          {tab.locationSource === 'browser' && (
                            <span className="inline-flex items-center gap-0.5 font-semibold text-sky-700">
                              <Navigation size={10} /> GPS
                            </span>
                          )}
                          {tab.location ? (
                            <span className="truncate font-mono text-[11px]">{formatPoint(tab.location)}</span>
                          ) : (
                            <span className="font-semibold text-warning-600">not placed</span>
                          )}
                        </p>
                      </div>
                      {tab.location && (
                        <button
                          type="button"
                          aria-label="Show on map"
                          onClick={(e) => {
                            e.stopPropagation();
                            onLocate(tab);
                          }}
                          className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                        >
                          <Crosshair size={16} />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
