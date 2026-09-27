import { distanceM, type Point } from '../../../shared/route/geometry';
import { decodePolyline, encodePolyline } from '../../../shared/route/polyline';
import type { RouteStep } from '../../../shared/route/profile';

// Where a leg's route comes from. The simulator is the car's sat-nav:
//   - to the pickup: a real driving route from the Routes API (browser key), per-step speeds
//   - to the drop-off: the route the rider booked (trip_fares.route_polyline), at its
//     booked average speed — unless the driver starts the trip away from its start, or
//     there's no booked route; then a fresh Routes API route from where the driver is.
// A failed lookup is an error for the simulator to show, never a straight line.

export interface LegRoute {
  /** Encoded polyline. */
  path: string;
  steps: RouteStep[];
  source: 'routes-api' | 'booked';
}

/** How far from the booked route's start the driver can be for it to still be used. */
export const BOOKED_START_TOLERANCE_M = 100;

export async function computeDrivingRoute(from: Point, to: Point): Promise<LegRoute> {
  const { Route } = (await google.maps.importLibrary('routes')) as google.maps.RoutesLibrary;
  const { routes } = await Route.computeRoutes({
    origin: from,
    destination: to,
    travelMode: 'DRIVING',
    routingPreference: 'TRAFFIC_UNAWARE',
    fields: ['path', 'legs', 'distanceMeters', 'staticDurationMillis'],
  });
  const route = routes?.[0];
  if (!route?.path?.length) throw new Error('No driving route found');
  const steps = (route.legs ?? []).flatMap((leg) =>
    leg.steps.map((step) => ({ metres: step.distanceMeters ?? 0, seconds: (step.staticDurationMillis ?? 0) / 1000 })),
  );
  return {
    path: encodePolyline(route.path.map((p) => ({ lat: p.lat, lng: p.lng }))),
    steps,
    source: 'routes-api',
  };
}

/** The booked route as a leg, if the driver is at its start. */
export function bookedLeg(polyline: string | undefined, durationMinutes: number | undefined, driverAt: Point): LegRoute | null {
  if (!polyline || !durationMinutes) return null;
  const points = decodePolyline(polyline);
  if (points.length < 2 || distanceM(driverAt, points[0]) > BOOKED_START_TOLERANCE_M) return null;
  let metres = 0;
  for (let i = 1; i < points.length; i++) metres += distanceM(points[i - 1], points[i]);
  return { path: polyline, steps: [{ metres, seconds: durationMinutes * 60 }], source: 'booked' };
}
