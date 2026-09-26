import { LogOut, MapPin } from 'lucide-react';

import { logout } from '../../auth/api';
import { SessionExpiryBanner } from '../../auth/SessionExpiryBanner';
import { formatPoint, useLocationStore } from '../../../shared/location/location-store';
import { useRiderSession } from '../../../shared/session/session-store';
import { Button } from '../../../shared/ui/Button';
import { ModalSheet } from '../../../shared/ui/ModalSheet';

// Who is signed in to this tab, where the tab is, and Log out. Stands in for R07
// (Rider profile), which comes in Phase 6.

export function AccountSheet({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  const user = useRiderSession((s) => s.user);
  const position = useLocationStore((s) => s.position);
  const source = useLocationStore((s) => s.source);
  const initials = user ? `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase() : '';

  return (
    <ModalSheet open={open} onDismiss={onDismiss} labelledBy="account-title">
      <div className="flex items-center gap-3">
        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-pill bg-primary-50 text-[18px] font-extrabold text-primary-700">
          {initials}
        </div>
        <div className="min-w-0">
          <p id="account-title" className="truncate text-[19px] font-extrabold text-r-ink">
            {user?.first_name} {user?.last_name}
          </p>
          <p className="truncate text-[13px] text-r-ink-2">{user?.email}</p>
        </div>
      </div>

      <div className="mt-4">
        <SessionExpiryBanner role="rider" />
      </div>

      <div className="mt-4 rounded-card bg-r-bg px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-r-ink-3">This tab’s location</p>
        <p className="mt-1 flex items-center gap-2 text-[14px] text-r-ink">
          <MapPin size={16} className="shrink-0 text-primary-600" />
          <span data-testid="current-location" className="font-mono">
            {position ? formatPoint(position) : 'Not placed yet'}
          </span>
        </p>
        <p className="mt-0.5 text-[12px] text-r-ink-3">
          {source === 'simulated' ? 'Set from the simulator' : 'From this browser’s GPS'}
        </p>
      </div>

      <div className="mt-5">
        <Button label="Log out" variant="destructive-outline" shape="pill" size="large" onClick={() => logout('rider')} />
      </div>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-r-ink-3">
        <LogOut size={12} /> Signs out this tab only
      </p>
    </ModalSheet>
  );
}
