import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';

import { setLogRole } from '../shared/devlog/devlog-store';
import { DevPanel } from '../shared/devlog/DevPanel';
import { useRealtimeConnection } from '../shared/realtime/use-realtime';
import { SESSION_ENDED_MESSAGE, sessionStores } from '../shared/session/session-store';
import { useTabPresence } from '../shared/tab/presence';
import { ROLE_BASE } from '../shared/tab/routes';
import type { Role } from '../shared/tab/types';
import { PhoneFrame } from '../shared/ui/PhoneFrame';

// Layout for /user/* and /driver/*: the phone frame, the dev panel, and everything a
// simulated device needs while it is open — websocket, presence on the simulator bus,
// and signing out when the 60-minute token runs out.

function useExpireSessionAtTokenExpiry(role: Role): void {
  const expiresAt = sessionStores[role]((s) => s.tokenExpiresAt);

  useEffect(() => {
    if (!expiresAt) return;
    const clear = () => sessionStores[role].getState().clearSession(SESSION_ENDED_MESSAGE);
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      clear();
      return;
    }
    const timer = setTimeout(clear, remaining);
    return () => clearTimeout(timer);
  }, [role, expiresAt]);
}

export function RoleShell({ role }: { role: Role }) {
  useEffect(() => {
    setLogRole(role);
    document.title = role === 'rider' ? 'Go Ride · Rider' : 'Go Ride · Driver';
    return () => setLogRole(null);
  }, [role]);

  useRealtimeConnection(role);
  useTabPresence(role);
  useExpireSessionAtTokenExpiry(role);

  return (
    <PhoneFrame role={role} aside={<DevPanel role={role} />}>
      <Outlet />
    </PhoneFrame>
  );
}

/** Screens that need a signed-in user; otherwise go to this role's login. */
export function RequireSession({ role }: { role: Role }) {
  const token = sessionStores[role]((s) => s.token);
  const location = useLocation();
  if (!token) return <Navigate to={`${ROLE_BASE[role]}/login`} replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Login/signup screens; a signed-in tab skips straight to the role's home. */
export function RedirectIfSession({ role }: { role: Role }) {
  const token = sessionStores[role]((s) => s.token);
  const location = useLocation();
  if (token) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? ROLE_BASE[role]} replace />;
  }
  return <Outlet />;
}
