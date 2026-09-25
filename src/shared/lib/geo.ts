export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_M = 6_371_008.8; // IUGG mean Earth radius

/** Great-circle distance in metres between two WGS-84 coordinates.
 *  Hand-rolled on purpose (RESEARCH.md "Don't Hand-Roll" table): ~10 lines, no
 *  edge cases beyond float precision, and pulling a geo library in for this
 *  would be over-engineering. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(a.latitude);
  const phi2 = toRad(b.latitude);
  const deltaPhi = toRad(b.latitude - a.latitude);
  const deltaLambda = toRad(b.longitude - a.longitude);

  const h =
    Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
