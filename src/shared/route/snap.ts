import { interpolate, projectOntoSegment, type Point } from './geometry';
import type { RouteProfile } from './profile';

// Places a reported position on the route: how far along it the car is, and how far off
// it the report was. Routes can pass the same street twice (a loop around a one-way
// block), so with a hint (the previous snap) a match at or ahead of the hint wins over a
// slightly nearer one behind it — a car doesn't drive backwards between two pings.

export interface Snap extends Point {
  /** Distance along the route. */
  metres: number;
  /** Distance from the reported position to the route. */
  offM: number;
}

/** Candidates behind the hint by up to this much still count as "ahead" (GPS jitter). */
const BEHIND_SLACK_M = 20;
/** An ahead match may be up to this much further off the road than the nearest match. */
const AHEAD_PREFERENCE_M = 20;

export function snapToRoute(profile: Pick<RouteProfile, 'points' | 'cumMetres'>, point: Point, hintMetres?: number): Snap {
  const { points, cumMetres } = profile;
  if (points.length < 2) return { ...(points[0] ?? point), metres: 0, offM: Infinity };

  let best: Snap | null = null;
  let bestAhead: Snap | null = null;
  for (let i = 0; i < points.length - 1; i++) {
    const { fraction, offM } = projectOntoSegment(point, points[i], points[i + 1]);
    const metres = cumMetres[i] + (cumMetres[i + 1] - cumMetres[i]) * fraction;
    const candidate = { ...interpolate(points[i], points[i + 1], fraction), metres, offM };
    if (!best || offM < best.offM) best = candidate;
    if (hintMetres !== undefined && metres >= hintMetres - BEHIND_SLACK_M && (!bestAhead || offM < bestAhead.offM)) {
      bestAhead = candidate;
    }
  }
  if (bestAhead && bestAhead.offM <= best!.offM + AHEAD_PREFERENCE_M) return bestAhead;
  return best!;
}
