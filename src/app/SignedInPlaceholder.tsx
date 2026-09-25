import { LogOut } from 'lucide-react';

import { logout } from '../features/auth/api';
import { SessionExpiryBanner } from '../features/auth/SessionExpiryBanner';
import { sessionStores } from '../shared/session/session-store';
import type { Role } from '../shared/tab/types';
import { Button } from '../shared/ui/Button';
import { Card } from '../shared/ui/Card';

// Temporary home for Phase 0 — proves the per-tab session and websocket. Replaced by
// D06 (driver home) in Phase 2 and R01 (Where to) in Phase 3.

const NEXT_UP: Record<Role, string> = {
  driver: 'Driver home (D06 Go online) arrives in Phase 2.',
  rider: 'Booking (R01 Where to) arrives in Phase 3.',
};

export function SignedInPlaceholder({ role }: { role: Role }) {
  const user = sessionStores[role]((s) => s.user);
  const initials = user ? `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase() : '';

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-neutral-50">
      <div className="bg-primary-500 px-5 pt-[26px] pb-5 text-white">
        <div className="flex items-center gap-[10px]">
          <div className="flex h-[52px] w-[52px] items-center justify-center rounded-pill bg-white/20 text-[18px] font-extrabold">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[19px] font-extrabold">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="mt-0.5 truncate text-[13px] text-white/[0.82]">{user?.email}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pt-4 pb-6">
        <SessionExpiryBanner role={role} />
        <Card>
          <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-500">Signed in</p>
          <p className="mt-2 text-[15px] text-neutral-700">{NEXT_UP[role]}</p>
        </Card>
        <div className="mt-auto">
          <Button
            label="Log out"
            variant="destructive-outline"
            size="large"
            onClick={() => logout(role)}
          />
        </div>
        <p className="flex items-center justify-center gap-1.5 text-[12px] text-neutral-400">
          <LogOut size={12} /> Signs out this tab only
        </p>
      </div>
    </div>
  );
}
