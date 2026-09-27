import { bearingDeg, densify, distanceM, projectOntoSegment, turnAngleDeg } from './geometry';
import { ORIGIN, offset, pathOf } from './test-paths';

describe('geometry', () => {
  it('gives compass bearings', () => {
    expect(bearingDeg(ORIGIN, offset(ORIGIN, 0, 100))).toBeCloseTo(0, 1);
    expect(bearingDeg(ORIGIN, offset(ORIGIN, 100, 0))).toBeCloseTo(90, 1);
    expect(bearingDeg(ORIGIN, offset(ORIGIN, 0, -100))).toBeCloseTo(180, 1);
    expect(bearingDeg(ORIGIN, offset(ORIGIN, -100, 0))).toBeCloseTo(270, 1);
  });

  it('measures turn angles across north', () => {
    expect(turnAngleDeg(350, 10)).toBe(20);
    expect(turnAngleDeg(10, 350)).toBe(20);
    expect(turnAngleDeg(90, 270)).toBe(180);
    expect(turnAngleDeg(45, 45)).toBe(0);
  });

  it('densifies to short segments, keeping the ends and dropping repeats', () => {
    const path = pathOf([0, 0], [0, 0], [95, 0], [95, 42]);
    const dense = densify(path, 10);
    expect(dense[0]).toEqual(path[0]);
    expect(dense[dense.length - 1]).toEqual(path[3]);
    for (let i = 1; i < dense.length; i++) {
      const d = distanceM(dense[i - 1], dense[i]);
      expect(d).toBeGreaterThan(0.01);
      expect(d).toBeLessThanOrEqual(10.01);
    }
    expect(dense).toHaveLength(1 + 10 + 5);
  });

  it('projects onto a segment', () => {
    const [a, b] = pathOf([0, 0], [100, 0]);
    const mid = projectOntoSegment(offset(ORIGIN, 30, 8), a, b);
    expect(mid.fraction).toBeCloseTo(0.3, 3);
    expect(mid.offM).toBeCloseTo(8, 1);
    expect(projectOntoSegment(offset(ORIGIN, -20, 0), a, b).fraction).toBe(0);
    expect(projectOntoSegment(offset(ORIGIN, 150, 0), a, b).fraction).toBe(1);
  });
});
