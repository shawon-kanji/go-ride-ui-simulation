import { haversineMeters } from '../lib/geo';

// Small geometry helpers for routes. Segments are short (≤10 m after densifying), so
// interpolating linearly in lat/lng and projecting onto a local flat plane are accurate
// to well under a metre.

export interface Point {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function distanceM(a: Point, b: Point): number {
  return haversineMeters({ latitude: a.lat, longitude: a.lng }, { latitude: b.lat, longitude: b.lng });
}

/** Initial compass bearing from a to b, 0–360° (0 = north, 90 = east). */
export function bearingDeg(a: Point, b: Point): number {
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dLambda = toRad(b.lng - a.lng);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** How sharply the heading changes between two bearings: 0 (straight on) to 180 (U-turn). */
export function turnAngleDeg(fromBearing: number, toBearing: number): number {
  const diff = Math.abs(toBearing - fromBearing) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function interpolate(a: Point, b: Point, fraction: number): Point {
  return { lat: a.lat + (b.lat - a.lat) * fraction, lng: a.lng + (b.lng - a.lng) * fraction };
}

/** Splits every segment longer than maxM into equal pieces and drops repeated points. */
export function densify(path: Point[], maxM: number): Point[] {
  const out: Point[] = [];
  for (const point of path) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push(point);
      continue;
    }
    const d = distanceM(prev, point);
    if (d < 0.01) continue;
    const pieces = Math.ceil(d / maxM);
    for (let i = 1; i < pieces; i++) out.push(interpolate(prev, point, i / pieces));
    out.push(point);
  }
  return out;
}

/** Nearest point on segment a→b to p: the fraction along it and the distance off it, in metres. */
export function projectOntoSegment(p: Point, a: Point, b: Point): { fraction: number; offM: number } {
  const metresPerDegLat = (Math.PI / 180) * EARTH_RADIUS_M;
  const metresPerDegLng = metresPerDegLat * Math.cos(toRad(a.lat));
  const bx = (b.lng - a.lng) * metresPerDegLng;
  const by = (b.lat - a.lat) * metresPerDegLat;
  const px = (p.lng - a.lng) * metresPerDegLng;
  const py = (p.lat - a.lat) * metresPerDegLat;
  const lengthSq = bx * bx + by * by;
  const fraction = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, (px * bx + py * by) / lengthSq));
  const dx = px - bx * fraction;
  const dy = py - by * fraction;
  return { fraction, offM: Math.sqrt(dx * dx + dy * dy) };
}
