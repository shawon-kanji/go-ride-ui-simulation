import type { Point } from './geometry';

// Google's encoded polyline format (precision 5), as the Directions/Routes APIs return it and
// as trip_fares.route_polyline stores it. Hand-rolled: ~40 lines and fully covered by tests.
// https://developers.google.com/maps/documentation/utilities/polylinealgorithm

const FACTOR = 1e5;

export function decodePolyline(encoded: string): Point[] {
  const points: Point[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const next = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) throw new Error('Malformed polyline');
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push({ lat: lat / FACTOR, lng: lng / FACTOR });
  }
  return points;
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let out = '';
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return out + String.fromCharCode(v + 63);
}

export function encodePolyline(points: Point[]): string {
  let out = '';
  let prevLat = 0;
  let prevLng = 0;
  for (const point of points) {
    const lat = Math.round(point.lat * FACTOR);
    const lng = Math.round(point.lng * FACTOR);
    out += encodeValue(lat - prevLat) + encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}
