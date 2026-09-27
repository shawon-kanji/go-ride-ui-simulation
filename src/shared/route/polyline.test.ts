import { decodePolyline, encodePolyline } from './polyline';

// Google's worked example from the polyline algorithm page.
const SAMPLE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const SAMPLE_POINTS = [
  { lat: 38.5, lng: -120.2 },
  { lat: 40.7, lng: -120.95 },
  { lat: 43.252, lng: -126.453 },
];

describe('polyline', () => {
  it('decodes Google’s sample', () => {
    const points = decodePolyline(SAMPLE);
    expect(points).toHaveLength(3);
    points.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(SAMPLE_POINTS[i].lat, 5);
      expect(p.lng).toBeCloseTo(SAMPLE_POINTS[i].lng, 5);
    });
  });

  it('encodes Google’s sample', () => {
    expect(encodePolyline(SAMPLE_POINTS)).toBe(SAMPLE);
  });

  it('round-trips KL and southern/western coordinates at 1e-5', () => {
    const points = [
      { lat: 3.13901, lng: 101.68693 },
      { lat: 3.14512, lng: 101.69911 },
      { lat: -33.86882, lng: 151.20929 },
      { lat: 0, lng: -0.00001 },
    ];
    const decoded = decodePolyline(encodePolyline(points));
    decoded.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(points[i].lat, 5);
      expect(p.lng).toBeCloseTo(points[i].lng, 5);
    });
  });

  it('handles the empty string', () => {
    expect(decodePolyline('')).toEqual([]);
    expect(encodePolyline([])).toBe('');
  });

  it('rejects a truncated string', () => {
    expect(() => decodePolyline('_p~iF~ps|U_')).toThrow('Malformed polyline');
  });
});
