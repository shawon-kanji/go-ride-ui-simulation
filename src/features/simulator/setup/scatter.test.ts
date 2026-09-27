import { distanceM } from '../../../shared/route/geometry';
import { scatterPoints } from './scatter';

const KL = { lat: 3.139, lng: 101.6869 };

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('scatterPoints', () => {
  it('places every point inside the radius', () => {
    const points = scatterPoints(KL, 30, 1500, 150, seeded(7));
    expect(points).toHaveLength(30);
    for (const p of points) expect(distanceM(KL, p)).toBeLessThanOrEqual(1500.5);
  });

  it('keeps points apart when there is room', () => {
    const points = scatterPoints(KL, 8, 1500, 150, seeded(42));
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) expect(distanceM(points[i], points[j])).toBeGreaterThanOrEqual(150);
    }
  });

  it('still returns every point when the gap can’t be kept', () => {
    expect(scatterPoints(KL, 20, 50, 150, seeded(3))).toHaveLength(20);
  });
});
