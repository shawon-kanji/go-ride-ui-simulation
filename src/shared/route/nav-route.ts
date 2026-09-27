import type { NavRoute } from '../tab/types';
import type { Point } from './geometry';
import { decodePolyline } from './polyline';
import { buildProfile, type RoutePosition, type RouteProfile } from './profile';

// Reading a shared route: its movement profile (built once per path + steps), and where
// the car is on it at a given wall-clock time.

const CACHE_SIZE = 8;
const cache = new Map<string, RouteProfile>();

export function profileFor(route: Pick<NavRoute, 'path' | 'steps'>): RouteProfile {
  const key = `${route.path}|${route.steps.map((s) => `${s.metres}/${s.seconds}`).join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const profile = buildProfile(decodePolyline(route.path), route.steps);
  cache.set(key, profile);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return profile;
}

/** Profile time (s) at wall-clock time `now`. */
export function profileTimeAt(route: Pick<NavRoute, 'anchor' | 'speedFactor' | 'paused'>, now: number): number {
  if (route.paused) return route.anchor.profileT;
  return route.anchor.profileT + ((now - route.anchor.atMs) / 1000) * route.speedFactor;
}

export function positionOnRoute(route: NavRoute, now: number): RoutePosition {
  return profileFor(route).positionAt(profileTimeAt(route, now));
}

/** The route cut at `metres`: the part driven and the part left, both including the cut point. */
export function splitRoute(profile: RouteProfile, metres: number): { travelled: Point[]; remaining: Point[] } {
  const { points, cumMetres } = profile;
  if (points.length < 2) return { travelled: points, remaining: points };
  const at = profile.pointAtMetres(metres);
  const cut = { lat: at.lat, lng: at.lng };
  let i = 0;
  while (i < points.length && cumMetres[i] <= metres) i++;
  return { travelled: [...points.slice(0, i), cut], remaining: [cut, ...points.slice(i)] };
}
