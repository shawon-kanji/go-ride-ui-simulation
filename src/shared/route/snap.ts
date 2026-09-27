import { interpolate, projectOntoSegment, type Point } from './geometry';
import type { RouteProfile } from './profile';

// Places a reported position on the route: how far along it the car is, and how far off
// it the report was. Routes can pass the same street twice (a loop around a one-way
// block, or out and back), which gives one good match per pass. Only those matches count
// — where the distance to the route bottoms out — so a hint never drags the car along
// the road to a worse fit. With a hint (roughly how far along the car should be), the
// pass nearest the hint wins among matches about as good as the best.

export interface Snap extends Point {
  /** Distance along the route. */
  metres: number;
  /** Distance from the reported position to the route. */
  offM: number;
}

/** A pass this much further off the road than the nearest still counts as a fit. */
const PASS_TOLERANCE_M = 20;

export function snapToRoute(profile: Pick<RouteProfile, 'points' | 'cumMetres'>, point: Point, hintMetres?: number): Snap {
  const { points, cumMetres } = profile;
  if (points.length < 2) return { ...(points[0] ?? point), metres: 0, offM: Infinity };

  const candidates: Snap[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const { fraction, offM } = projectOntoSegment(point, points[i], points[i + 1]);
    const metres = cumMetres[i] + (cumMetres[i + 1] - cumMetres[i]) * fraction;
    candidates.push({ ...interpolate(points[i], points[i + 1], fraction), metres, offM });
  }

  const passes = candidates.filter(
    (c, i) => (i === 0 || c.offM <= candidates[i - 1].offM) && (i === candidates.length - 1 || c.offM <= candidates[i + 1].offM),
  );
  const nearest = passes.reduce((best, c) => (c.offM < best.offM ? c : best));
  if (hintMetres === undefined) return nearest;
  return passes
    .filter((c) => c.offM <= nearest.offM + PASS_TOLERANCE_M)
    .reduce((best, c) => (Math.abs(c.metres - hintMetres) < Math.abs(best.metres - hintMetres) ? c : best));
}
