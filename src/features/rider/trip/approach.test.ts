import { profileFor } from '../../../shared/route/nav-route';
import { encodePolyline } from '../../../shared/route/polyline';
import { ORIGIN, offset, pathOf } from '../../../shared/route/test-paths';
import type { NavRoute } from '../../../shared/tab/types';
import { approachView } from './approach';

const T0 = 1_000_000;
const ROUTE: NavRoute = {
  requestId: 'req-1',
  driverId: 'drv-1',
  leg: 'pickup',
  path: encodePolyline(pathOf([0, 0], [1000, 0])),
  steps: [{ metres: 1000, seconds: 120 }],
  anchor: { atMs: T0, profileT: 0 },
  speedFactor: 1,
  paused: false,
};
const fixAt = (east: number, at: number) => ({ ...offset(ORIGIN, east, 2), at });
const metresOf = (view: ReturnType<typeof approachView>) => profileFor(ROUTE).totalMetres - view.remainingMetres;

describe('approachView', () => {
  it('puts the car at the first report', () => {
    const view = approachView(ROUTE, fixAt(200, T0 + 30_000), undefined, T0 + 31_000);
    expect(metresOf(view)).toBeCloseTo(200, 0);
    expect(view.car.heading).toBeCloseTo(90, 0);
  });

  it('glides from the previous report to the latest over the gap between them', () => {
    const prev = fixAt(200, T0 + 30_000);
    const fix = fixAt(300, T0 + 40_000);
    expect(metresOf(approachView(ROUTE, fix, prev, T0 + 40_000))).toBeCloseTo(200, 0);
    expect(metresOf(approachView(ROUTE, fix, prev, T0 + 45_000))).toBeCloseTo(250, 0);
    expect(metresOf(approachView(ROUTE, fix, prev, T0 + 50_000))).toBeCloseTo(300, 0);
    expect(metresOf(approachView(ROUTE, fix, prev, T0 + 90_000))).toBeCloseTo(300, 0);
  });

  it('never moves the car backwards on a noisy report', () => {
    const view = approachView(ROUTE, fixAt(190, T0 + 40_000), fixAt(200, T0 + 30_000), T0 + 45_000);
    expect(metresOf(view)).toBeCloseTo(190, 0);
  });

  it('counts down the time left at the playback speed', () => {
    const fix = fixAt(500, T0 + 60_000);
    const x1 = approachView(ROUTE, fix, undefined, T0 + 60_000);
    const x5 = approachView({ ...ROUTE, speedFactor: 5 }, fix, undefined, T0 + 60_000);
    expect(x5.remainingSeconds).toBeCloseTo(x1.remainingSeconds / 5, 3);
    expect(x1.remaining[0]).toMatchObject({ lat: expect.any(Number) });
  });
});
