import type { Point } from '../../../shared/route/geometry';
import { profileFor, profileTimeAt, splitRoute } from '../../../shared/route/nav-route';
import { remainingFrom, type RouteProfile } from '../../../shared/route/profile';
import { snapToRoute } from '../../../shared/route/snap';
import type { NavRoute } from '../../../shared/tab/types';
import type { DriverFix } from './trip-model';

// R05 with a shared route: where to draw the driver's car. The backend reports the car
// about every 10s (driver_location); instead of hopping, the car glides along the route
// from the previous report to the latest over the time between them. It trails the real
// car by at most one report, and never moves backwards.

const MIN_GAP_MS = 1_000;
const MAX_GAP_MS = 15_000;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface ApproachView {
  car: Point & { heading: number };
  /** The route still to drive, from the car. */
  remaining: Point[];
  remainingMetres: number;
  /** Wall-clock seconds to the pickup at the playback speed. */
  remainingSeconds: number;
}

/** A report placed on the route, using the route's timing at the report to pick the right pass. */
function snapFix(route: NavRoute, profile: RouteProfile, fix: DriverFix): number {
  const expected = profile.positionAt(profileTimeAt(route, fix.at)).metres;
  return snapToRoute(profile, fix, expected).metres;
}

export function approachView(route: NavRoute, fix: DriverFix, prev: DriverFix | undefined, now: number): ApproachView {
  const profile = profileFor(route);
  const to = snapFix(route, profile, fix);
  const from = prev ? Math.min(to, snapFix(route, profile, prev)) : to;
  const gap = prev ? clamp(fix.at - prev.at, MIN_GAP_MS, MAX_GAP_MS) : 1;
  const fraction = prev ? clamp((now - fix.at) / gap, 0, 1) : 1;
  const metres = from + (to - from) * fraction;
  const left = remainingFrom(profile, metres);
  return {
    car: profile.pointAtMetres(metres),
    remaining: splitRoute(profile, metres).remaining,
    remainingMetres: left.metres,
    remainingSeconds: left.seconds / route.speedFactor,
  };
}
