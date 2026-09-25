import { haversineMeters } from './geo';

describe('haversineMeters', () => {
  it('returns exactly 0 for identical coordinates', () => {
    const p = { latitude: 3.139, longitude: 101.6869 };
    expect(haversineMeters(p, p)).toBe(0);
  });

  it('returns ~111195 m for a 1-degree-of-latitude separation', () => {
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 1, longitude: 0 };
    expect(haversineMeters(a, b)).toBeGreaterThan(111195 - 200);
    expect(haversineMeters(a, b)).toBeLessThan(111195 + 200);
  });

  it('scales longitude distance by cosine of latitude for a short east-west hop', () => {
    const a = { latitude: 3.139, longitude: 101.6869 };
    const b = { latitude: 3.139, longitude: 101.6871 };
    const d = haversineMeters(a, b);
    expect(d).toBeGreaterThan(15);
    expect(d).toBeLessThan(30);
  });

  it('is symmetric', () => {
    const a = { latitude: 3.139, longitude: 101.6869 };
    const b = { latitude: -33.8688, longitude: 151.2093 };
    expect(Math.abs(haversineMeters(a, b) - haversineMeters(b, a))).toBeLessThan(1e-6);
  });

  it('returns a positive finite number for southern-hemisphere coordinates', () => {
    const a = { latitude: -33.8688, longitude: 151.2093 };
    const b = { latitude: -33.87, longitude: 151.2093 };
    const d = haversineMeters(a, b);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(0);
  });
});
