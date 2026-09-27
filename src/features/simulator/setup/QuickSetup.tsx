import { useQuery } from '@tanstack/react-query';
import { Car, RefreshCw, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { devClient, testAccountsErrorMessage } from '../../../shared/api/dev-client';
import type { Role } from '../../../shared/tab/types';
import { useTabRegistry } from '../tab-registry';
import { availability, loginPath, MAX_TABS_PER_CLICK, pickAccounts } from './quick-setup';

// Sidebar: open N rider or driver tabs that sign themselves in as free test accounts
// (go-ride-backend's config/test-accounts.yaml). Opened accounts count as busy until their
// tab announces itself; any still missing after a few seconds were stopped by the browser's
// pop-up blocker (Chrome allows one tab per click unless pop-ups are allowed).

const ARRIVAL_TIMEOUT_MS = 10_000;

const ROLES: { role: Role; label: string; Icon: typeof Car; color: string }[] = [
  { role: 'driver', label: 'Drivers', Icon: Truck, color: 'bg-primary-500 hover:bg-primary-600' },
  { role: 'rider', label: 'Riders', Icon: Car, color: 'bg-[#00a04a] hover:bg-[#008a3f]' },
];

interface Opening {
  emails: string[];
  at: number;
}

export function QuickSetup() {
  const accounts = useQuery({ queryKey: ['dev', 'test-accounts'], queryFn: devClient.testAccounts, staleTime: 30_000, retry: false });
  const tabs = useTabRegistry((s) => s.tabs);
  const [opening, setOpening] = useState<Opening[]>([]);
  const [counts, setCounts] = useState<Record<Role, number>>({ driver: 1, rider: 1 });
  const [message, setMessage] = useState<string | null>(null);

  const signedIn = useMemo(() => new Set(Object.values(tabs).flatMap((t) => (t.email ? [t.email] : []))), [tabs]);
  const busy = useMemo(() => new Set([...signedIn, ...opening.flatMap((o) => o.emails)]), [signedIn, opening]);

  // Opened accounts stay busy until the timeout; by then each should have announced itself
  // (and counts as signed in). Checked on an interval, not on registry changes, which arrive
  // several times a second while a car drives.
  useEffect(() => {
    if (opening.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const expired = opening.filter((o) => now - o.at >= ARRIVAL_TIMEOUT_MS);
      if (expired.length === 0) return;
      const current = new Set(Object.values(useTabRegistry.getState().tabs).flatMap((t) => (t.email ? [t.email] : [])));
      const missing = expired.flatMap((o) => o.emails.filter((e) => !current.has(e)));
      if (missing.length > 0) {
        setMessage(
          `${missing.length} tab${missing.length === 1 ? '' : 's'} didn’t open. Allow pop-ups for ${window.location.host} in the browser (address bar icon), then open again.`,
        );
      }
      setOpening((list) => list.filter((o) => !expired.includes(o)));
    }, 1_000);
    return () => clearInterval(interval);
  }, [opening]);

  const open = (role: Role) => {
    if (!accounts.data) return;
    const picked = pickAccounts(availability(accounts.data, role, busy), role, counts[role]);
    if ('error' in picked) {
      setMessage(picked.error);
      return;
    }
    setMessage(null);
    for (const email of picked.emails) window.open(loginPath(role, email), '_blank', 'noopener');
    setOpening((list) => [...list, { emails: picked.emails, at: Date.now() }]);
  };

  return (
    <section data-testid="quick-setup" className="mt-3 rounded-control bg-white px-3 py-2.5 text-[13px] ring-1 ring-neutral-200">
      <div className="flex items-center justify-between">
        <p className="font-bold text-neutral-900">Quick setup</p>
        <button
          type="button"
          aria-label="Reload test accounts"
          onClick={() => void accounts.refetch()}
          className="rounded p-1 text-neutral-400 hover:text-neutral-800"
        >
          <RefreshCw size={14} className={accounts.isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {accounts.isError && <p className="mt-1.5 text-danger-600">{testAccountsErrorMessage(accounts.error)}</p>}
      {accounts.isPending && <p className="mt-1.5 text-neutral-500">Loading test accounts…</p>}

      {accounts.data &&
        ROLES.map(({ role, label, Icon, color }) => {
          const a = availability(accounts.data, role, busy);
          const max = Math.min(MAX_TABS_PER_CLICK, Math.max(1, a.free.length));
          return (
            <div key={role} className="mt-2 flex items-center gap-2">
              <Icon size={16} className="shrink-0 text-neutral-500" />
              <p className="min-w-0 flex-1 truncate">
                <span className="font-semibold text-neutral-900">{label}</span>{' '}
                <span data-testid={`free-${role}s`} className="text-neutral-500">
                  {a.free.length} of {a.total} free
                </span>
              </p>
              <input
                type="number"
                aria-label={`How many ${label.toLowerCase()} to open`}
                min={1}
                max={max}
                value={counts[role]}
                onChange={(e) => setCounts((c) => ({ ...c, [role]: Number(e.target.value) }))}
                className="w-12 rounded-md border border-neutral-300 px-1.5 py-1 text-center"
              />
              <button
                type="button"
                data-testid={`open-${role}s`}
                onClick={() => open(role)}
                className={`rounded-md px-3 py-1 font-bold text-white ${color}`}
              >
                Open
              </button>
            </div>
          );
        })}

      {message && (
        <p data-testid="quick-setup-message" className="mt-2 text-[12px] font-semibold text-danger-600">
          {message}
        </p>
      )}
      <p className="mt-2 text-[12px] text-neutral-500">
        Opens tabs signed in as free test accounts. Or open a signed-out{' '}
        <button type="button" className="font-semibold underline" onClick={() => window.open('/user', '_blank', 'noopener')}>
          rider
        </button>{' '}
        /{' '}
        <button type="button" className="font-semibold underline" onClick={() => window.open('/driver', '_blank', 'noopener')}>
          driver
        </button>{' '}
        tab.
      </p>
    </section>
  );
}
