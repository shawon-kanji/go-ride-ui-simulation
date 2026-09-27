import type { NavRoute } from '../tab/types';
import type { Point } from './geometry';
import { decodePolyline } from './polyline';
import { buildProfile, remainingFrom, type RoutePosition, type RouteProfile } from './profile';
import { snapToRoute, type Snap } from './snap';

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

const boundsCache = new WeakMap<RouteProfile, [Point, Point]>();

/** South-west and north-east corners of the route. */
export function routeBounds(profile: RouteProfile): [Point, Point] {
  const hit = boundsCache.get(profile);
  if (hit) return hit;
  const lats = profile.points.map((p) => p.lat);
  const lngs = profile.points.map((p) => p.lng);
  const bounds: [Point, Point] = [
    { lat: Math.min(...lats), lng: Math.min(...lngs) },
    { lat: Math.max(...lats), lng: Math.max(...lngs) },
  ];
  boundsCache.set(profile, bounds);
  return bounds;
}

export interface RouteProgress {
  profile: RouteProfile;
  /** The reported position placed on the route. */
  snap: Snap;
  travelled: Point[];
  remaining: Point[];
  remainingMetres: number;
  /** Wall-clock seconds left at the playback speed. */
  remainingSeconds: number;
}

/**
 * Where a reported car position is along a shared route. The route's own timing says
 * roughly how far along the car should be, which picks the right pass when the route
 * uses the same street twice.
 */
export function routeProgress(route: NavRoute, position: Point, now: number): RouteProgress {
  const profile = profileFor(route);
  const expected = profile.positionAt(profileTimeAt(route, now)).metres;
  const snap = snapToRoute(profile, position, expected);
  const { travelled, remaining } = splitRoute(profile, snap.metres);
  const left = remainingFrom(profile, snap.metres);
  return {
    profile,
    snap,
    travelled,
    remaining,
    remainingMetres: left.metres,
    remainingSeconds: left.seconds / route.speedFactor,
  };
}
