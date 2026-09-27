import type { Point } from './geometry';

// Test helpers: build paths in metres east/north of a point in KL.

export const ORIGIN: Point = { lat: 3.139, lng: 101.6869 };
const M_PER_DEG_LAT = 111_195;

export function offset(from: Point, eastM: number, northM: number): Point {
  return {
    lat: from.lat + northM / M_PER_DEG_LAT,
    lng: from.lng + eastM / (M_PER_DEG_LAT * Math.cos((from.lat * Math.PI) / 180)),
  };
}

/** A path from ORIGIN through each [east, north] offset (metres). */
export function pathOf(...offsets: [number, number][]): Point[] {
  return offsets.map(([east, north]) => offset(ORIGIN, east, north));
}

export const kmh = (v: number) => v / 3.6;
