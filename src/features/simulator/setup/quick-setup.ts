import { accountsFor } from '../../../shared/api/dev-client';
import type { TestAccount, TestAccounts } from '../../../shared/api/types';
import type { Role } from '../../../shared/tab/types';

// Which test accounts quick setup can still open: ready (seeded) accounts of the role that
// aren't signed in to an open tab or already on their way (opened, not yet announced).

/** Tabs opened in one click. Each is a whole app with its own map load, websocket and pings. */
export const MAX_TABS_PER_CLICK = 10;

export const loginPath = (role: Role, email: string) =>
  `${role === 'rider' ? '/user' : '/driver'}/login?as=${encodeURIComponent(email)}`;

export interface AccountAvailability {
  total: number;
  ready: number;
  free: TestAccount[];
}

export function availability(accounts: TestAccounts, role: Role, busyEmails: ReadonlySet<string>): AccountAvailability {
  const all = accountsFor(accounts, role);
  const ready = all.filter((a) => a.ready);
  return { total: all.length, ready: ready.length, free: ready.filter((a) => !busyEmails.has(a.email)) };
}

/** The first `count` free accounts, or why that many can't be opened. */
export function pickAccounts(available: AccountAvailability, role: Role, count: number): { emails: string[] } | { error: string } {
  const noun = role === 'rider' ? 'rider' : 'driver';
  if (!Number.isInteger(count) || count < 1) return { error: 'Open at least 1 tab.' };
  if (count > MAX_TABS_PER_CLICK) return { error: `At most ${MAX_TABS_PER_CLICK} tabs per click — each tab is a whole app.` };
  if (count > available.free.length) {
    const inUse = available.ready - available.free.length;
    const notSeeded = available.total - available.ready;
    const parts = [`Only ${available.free.length} free ${noun}${available.free.length === 1 ? '' : 's'}`];
    if (inUse > 0) parts.push(`${inUse} already open`);
    if (notSeeded > 0) parts.push(`${notSeeded} not seeded — run make seed`);
    return {
      error: `${parts.join(', ')}. Add accounts to go-ride-backend/config/test-accounts.yaml and run make seed for more.`,
    };
  }
  return { emails: available.free.slice(0, count).map((a) => a.email) };
}
