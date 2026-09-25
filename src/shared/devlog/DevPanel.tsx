import { ChevronDown, ChevronRight, PanelRightClose, PanelRightOpen, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useRealtimeStore } from '../realtime/use-realtime';
import { sessionStores } from '../session/session-store';
import { getTabId, shortTabId } from '../tab/tab-identity';
import type { DevLogEntry, DevLogKind, Role, WsState } from '../tab/types';
import { useDevLogStore } from './devlog-store';

// Developer panel beside the phone (never inside it, so the phone UI stays faithful to
// the design). Shows who this tab is, the token's remaining life, the websocket state
// and this tab's event log.

const COLLAPSED_KEY = 'goride:devpanel-collapsed';

type Filter = 'all' | 'http' | 'ws' | 'errors';

const FILTERS: { id: Filter; label: string; kinds: DevLogKind[] | null }[] = [
  { id: 'all', label: 'All', kinds: null },
  { id: 'http', label: 'HTTP', kinds: ['http'] },
  { id: 'ws', label: 'WS', kinds: ['ws-in', 'ws-out', 'ws-state'] },
  { id: 'errors', label: 'Errors', kinds: ['error'] },
];

const KIND_STYLES: Record<DevLogKind, string> = {
  http: 'bg-sky-100 text-sky-800',
  'ws-in': 'bg-violet-100 text-violet-800',
  'ws-out': 'bg-fuchsia-100 text-fuchsia-800',
  'ws-state': 'bg-neutral-100 text-neutral-700',
  location: 'bg-emerald-100 text-emerald-800',
  state: 'bg-amber-100 text-amber-800',
  error: 'bg-danger-50 text-danger-700',
};

const WS_DOT: Record<WsState, string> = {
  idle: 'bg-neutral-300',
  connecting: 'bg-warning-500',
  reconnecting: 'bg-warning-500',
  open: 'bg-success-500',
  closed: 'bg-danger-500',
};

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
  } catch {
    // Preference just won't persist.
  }
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'expired';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function DevPanel({ role }: { role: Role }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [filter, setFilter] = useState<Filter>('all');
  const [now, setNow] = useState(() => Date.now());
  const user = sessionStores[role]((s) => s.user);
  const expiresAt = sessionStores[role]((s) => s.tokenExpiresAt);
  const wsState = useRealtimeStore((s) => s.wsState);
  const entries = useDevLogStore((s) => s.entries);
  const clear = useDevLogStore((s) => s.clear);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const toggle = () => {
    setCollapsed((value) => {
      writeCollapsed(!value);
      return !value;
    });
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label="Show dev panel"
        className="self-start rounded-xl bg-white p-2 text-neutral-600 shadow-sm max-[900px]:hidden"
      >
        <PanelRightOpen size={20} />
      </button>
    );
  }

  const kinds = FILTERS.find((f) => f.id === filter)?.kinds;
  const visible = kinds ? entries.filter((entry) => kinds.includes(entry.kind)) : entries;

  return (
    <aside className="flex h-[min(908px,calc(100dvh-48px))] w-[380px] shrink-0 flex-col overflow-hidden rounded-2xl bg-white text-[13px] shadow-sm max-[900px]:hidden">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-500">Dev panel</p>
        <button type="button" onClick={toggle} aria-label="Hide dev panel" className="text-neutral-500">
          <PanelRightClose size={18} />
        </button>
      </div>

      <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 border-b border-neutral-200 px-4 py-3">
        <dt className="text-neutral-500">Tab</dt>
        <dd className="truncate font-mono text-[12px]" title={getTabId()}>
          {shortTabId()} · {role}
        </dd>
        <dt className="text-neutral-500">User</dt>
        <dd className="truncate font-semibold">{user ? `${user.first_name} ${user.last_name} · ${user.email}` : 'signed out'}</dd>
        <dt className="text-neutral-500">Token</dt>
        <dd>{expiresAt ? `expires in ${formatRemaining(expiresAt - now)}` : '—'}</dd>
        <dt className="text-neutral-500">Websocket</dt>
        <dd className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${WS_DOT[wsState]}`} />
          {wsState}
        </dd>
        <dt className="text-neutral-500">Location</dt>
        <dd className="text-neutral-400">set by the simulator (Phase 1)</dd>
      </dl>

      <div className="flex items-center gap-1.5 border-b border-neutral-200 px-4 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-pill px-2.5 py-1 text-[12px] font-semibold ${filter === f.id ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}
          >
            {f.label}
          </button>
        ))}
        <button type="button" onClick={clear} aria-label="Clear log" className="ml-auto p-1 text-neutral-400 hover:text-neutral-700">
          <Trash2 size={16} />
        </button>
      </div>

      <ol className="flex-1 overflow-y-auto">
        {visible.length === 0 && <li className="px-4 py-6 text-center text-neutral-400">No events yet</li>}
        {visible.map((entry) => (
          <LogRow key={entry.id} entry={entry} />
        ))}
      </ol>
    </aside>
  );
}

function LogRow({ entry }: { entry: DevLogEntry }) {
  const [open, setOpen] = useState(false);
  const hasData = entry.data !== undefined;
  const time = new Date(entry.at).toLocaleTimeString([], { hour12: false });

  return (
    <li className="border-b border-neutral-100">
      <button
        type="button"
        onClick={() => hasData && setOpen((v) => !v)}
        className={`flex w-full items-start gap-2 px-4 py-2 text-left ${hasData ? 'hover:bg-neutral-50' : 'cursor-default'}`}
      >
        <span className="mt-0.5 w-3 shrink-0 text-neutral-400">
          {hasData ? open ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : null}
        </span>
        <span className="shrink-0 font-mono text-[11px] leading-5 text-neutral-400">{time}</span>
        <span className={`shrink-0 rounded px-1.5 text-[11px] font-bold leading-5 ${KIND_STYLES[entry.kind]}`}>{entry.kind}</span>
        <span className="min-w-0 flex-1 break-words font-mono text-[12px] leading-5">{entry.summary}</span>
      </button>
      {open && (
        <pre className="mx-4 mb-2 max-h-72 overflow-auto rounded-lg bg-neutral-900 p-3 text-[11px] leading-4 text-neutral-100">
          {JSON.stringify(entry.data, null, 2)}
        </pre>
      )}
    </li>
  );
}
