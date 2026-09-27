import { buildProfile } from './profile';
import { snapToRoute } from './snap';
import { ORIGIN, offset, pathOf } from './test-paths';

describe('snapToRoute', () => {
  const straight = buildProfile(pathOf([0, 0], [1000, 0]));

  it('finds how far along and how far off the route a point is', () => {
    const snap = snapToRoute(straight, offset(ORIGIN, 500, 8));
    expect(snap.metres).toBeGreaterThan(499);
    expect(snap.metres).toBeLessThan(501);
    expect(snap.offM).toBeCloseTo(8, 0);
  });

  it('clamps to the ends', () => {
    expect(snapToRoute(straight, offset(ORIGIN, -50, 0)).metres).toBe(0);
    expect(snapToRoute(straight, offset(ORIGIN, 1100, 0)).metres).toBeCloseTo(straight.totalMetres, 3);
  });

  describe('a route that drives down a street and back up it', () => {
    const outAndBack = buildProfile(pathOf([0, 0], [300, 0], [0, 0]));
    const point = offset(ORIGIN, 100, 2);

    it('without a hint, takes the nearest (first) pass', () => {
      expect(snapToRoute(outAndBack, point).metres).toBeCloseTo(100, 0);
    });

    it('with a hint on the way back, stays on the way back', () => {
      expect(snapToRoute(outAndBack, point, 450).metres).toBeCloseTo(500, 0);
    });

    it('with a hint on the way out, stays on the way out', () => {
      expect(snapToRoute(outAndBack, point, 60).metres).toBeCloseTo(100, 0);
    });
  });

  it('a hint ahead of or behind the car on the same street doesn’t drag it along the road', () => {
    const point = offset(ORIGIN, 200, 2);
    expect(snapToRoute(straight, point, 234).metres).toBeCloseTo(200, 1);
    expect(snapToRoute(straight, point, 160).metres).toBeCloseTo(200, 1);
  });

  it('prefers the nearest match when the ahead match is far off the road', () => {
    const lShape = buildProfile(pathOf([0, 0], [300, 0], [300, 300]));
    // A point on the first street, with a hint already past the corner: the car can't be
    // 200 m away on the second street, so the nearest match wins.
    const snap = snapToRoute(lShape, offset(ORIGIN, 100, 0), 400);
    expect(snap.metres).toBeCloseTo(100, 0);
  });
});
