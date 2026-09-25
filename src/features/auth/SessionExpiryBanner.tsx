import { useEffect, useState } from 'react';

import { sessionStores } from '../../shared/session/session-store';
import type { Role } from '../../shared/tab/types';
import { Banner } from '../../shared/ui/Banner';

// Same rules as the apps' SessionExpiryBanner: warn in the last 5 minutes of the
// 60-minute token, dismissible, re-armed on a new token.

const WARNING_WINDOW_MS = 5 * 60 * 1000;
const TICK_MS = 30 * 1000;

export function SessionExpiryBanner({ role }: { role: Role }) {
  const tokenExpiresAt = sessionStores[role]((s) => s.tokenExpiresAt);
  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [trackedExpiresAt, setTrackedExpiresAt] = useState(tokenExpiresAt);
  if (tokenExpiresAt !== trackedExpiresAt) {
    setTrackedExpiresAt(tokenExpiresAt);
    setDismissed(false);
  }

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  if (!tokenExpiresAt || dismissed) return null;

  const msRemaining = tokenExpiresAt - now;
  if (msRemaining <= 0 || msRemaining > WARNING_WINDOW_MS) return null;

  const minutesRemaining = Math.max(1, Math.ceil(msRemaining / 60000));

  return (
    <Banner
      message={`Session ending in ${minutesRemaining} min — you'll need to log in again soon.`}
      variant="warning"
      onDismiss={() => setDismissed(true)}
    />
  );
}
