import type { GeoPoint } from '../../../shared/location/location-store';
import { distanceM } from '../../../shared/route/geometry';

// Random spots for drivers around a point: uniform over the disc, kept a minimum distance
// apart so markers don't sit on top of each other (a few tries each, then accepted anyway).

const METRES_PER_DEG_LAT = 111_195;
const TRIES_PER_POINT = 40;

export function scatterPoints(
  center: GeoPoint,
  count: number,
  radiusM: number,
  minGapM: number,
  random: () => number = Math.random,
): GeoPoint[] {
  const metresPerDegLng = METRES_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
  const randomPoint = (): GeoPoint => {
    const r = radiusM * Math.sqrt(random());
    const angle = 2 * Math.PI * random();
    return {
      lat: center.lat + (r * Math.sin(angle)) / METRES_PER_DEG_LAT,
      lng: center.lng + (r * Math.cos(angle)) / metresPerDegLng,
    };
  };

  const points: GeoPoint[] = [];
  for (let i = 0; i < count; i++) {
    let point = randomPoint();
    for (let tries = 1; tries < TRIES_PER_POINT && points.some((p) => distanceM(p, point) < minGapM); tries++) {
      point = randomPoint();
    }
    points.push(point);
  }
  return points;
}
