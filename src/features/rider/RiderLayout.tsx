import { Outlet } from 'react-router';

import { useRiderRuntime } from './runtime';

/** Signed-in rider routes: runs the rider runtime (trip feed, sync, simulator status)
 *  once for every screen under it. */
export function RiderLayout() {
  useRiderRuntime();
  return <Outlet />;
}
