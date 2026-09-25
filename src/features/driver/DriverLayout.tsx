import { Outlet } from 'react-router';

import { useDriverRuntime } from './runtime';

/** Signed-in driver routes: runs the driver runtime (location pings, offer feed)
 *  once for every screen under it. */
export function DriverLayout() {
  useDriverRuntime();
  return <Outlet />;
}
