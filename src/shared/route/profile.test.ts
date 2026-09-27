import { ACCEL_MPS2, BRAKE_MPS2, buildProfile, remainingFrom, type RouteProfile } from './profile';
import { snapToRoute } from './snap';
import { kmh, pathOf } from './test-paths';

function sample(profile: RouteProfile, dt = 0.1) {
  const out = [];
  for (let t = 0; t <= profile.totalSeconds + dt; t += dt) out.push(profile.positionAt(t));
  return out;
}

// A small grid drive: several 90° corners, one 45° kink, varied step speeds.
const GRID = pathOf([0, 0], [400, 0], [400, 250], [700, 550], [700, 900], [200, 900], [200, 1200]);
const GRID_STEPS = [
  { metres: 400, seconds: 400 / kmh(35) },
  { metres: 250 + 424, seconds: (250 + 424) / kmh(50) },
  { metres: 350, seconds: 350 / kmh(25) },
  { metres: 500 + 300, seconds: 800 / kmh(40) },
];

describe('buildProfile', () => {
  describe('a straight 1 km at 30 km/h', () => {
    const profile = buildProfile(pathOf([0, 0], [1000, 0]), [{ metres: 1000, seconds: 120 }]);

    it('starts and ends at rest, exactly at the ends', () => {
      const start = profile.positionAt(0);
      const end = profile.positionAt(profile.totalSeconds);
      expect(start).toMatchObject({ lat: profile.points[0].lat, lng: profile.points[0].lng, speed: 0, metres: 0 });
      expect(end).toMatchObject({ speed: 0, done: true });
      expect(end.lat).toBe(profile.points[profile.points.length - 1].lat);
      expect(end.metres).toBeCloseTo(profile.totalMetres, 6);
      expect(profile.positionAt(profile.totalSeconds + 60).done).toBe(true);
      expect(profile.positionAt(-5).metres).toBe(0);
    });

    it('takes about as long as the step says (±5%)', () => {
      expect(profile.totalSeconds).toBeGreaterThan(120 * 0.95);
      expect(profile.totalSeconds).toBeLessThan(120 * 1.05);
    });

    it('heads east', () => {
      expect(profile.positionAt(30).heading).toBeCloseTo(90, 0);
    });
  });

  describe('the grid drive', () => {
    const profile = buildProfile(GRID, GRID_STEPS);
    const samples = sample(profile);

    it('stays on the path at every moment', () => {
      for (const p of samples) expect(snapToRoute(profile, p).offM).toBeLessThan(0.5);
    });

    it('only ever moves forward', () => {
      for (let i = 1; i < samples.length; i++) expect(samples[i].metres).toBeGreaterThanOrEqual(samples[i - 1].metres);
    });

    it('keeps within the acceleration and braking limits', () => {
      for (let i = 1; i < samples.length; i++) {
        const dt = samples[i].t - samples[i - 1].t;
        if (dt <= 0) continue;
        const a = (samples[i].speed - samples[i - 1].speed) / dt;
        expect(a).toBeLessThanOrEqual(ACCEL_MPS2 + 0.05);
        expect(a).toBeGreaterThanOrEqual(-BRAKE_MPS2 - 0.05);
      }
    });

    it('slows to 15 km/h for a 90° corner and 25 km/h for a 45° kink', () => {
      const speedAt = (metres: number) => profile.positionAt(profile.timeAtMetres(metres)).speed;
      expect(speedAt(400)).toBeLessThanOrEqual(kmh(15) + 0.01); // 90° left
      expect(speedAt(650)).toBeLessThanOrEqual(kmh(25) + 0.01); // 45° right
      expect(speedAt(650)).toBeGreaterThan(kmh(15));
      expect(speedAt(200)).toBeGreaterThan(kmh(25)); // mid-street
    });

    it('drives the steps’ total time within ±15%', () => {
      const target = GRID_STEPS.reduce((sum, s) => sum + s.seconds, 0);
      expect(profile.totalSeconds).toBeGreaterThan(target * 0.85);
      expect(profile.totalSeconds).toBeLessThan(target * 1.15);
    });

    it('maps metres back to the same time', () => {
      for (const t of [0, 1, 17.3, 60, profile.totalSeconds / 2, profile.totalSeconds - 1]) {
        expect(profile.timeAtMetres(profile.positionAt(t).metres)).toBeCloseTo(t, 2);
      }
    });

    it('reports what is left', () => {
      const half = profile.positionAt(profile.totalSeconds / 2);
      const left = remainingFrom(profile, half.metres);
      expect(left.seconds).toBeCloseTo(profile.totalSeconds / 2, 2);
      expect(left.metres).toBeCloseTo(profile.totalMetres - half.metres, 6);
      expect(remainingFrom(profile, profile.totalMetres)).toEqual({ metres: 0, seconds: 0 });
    });
  });

  it('drives a slow step slower than a fast one', () => {
    const profile = buildProfile(pathOf([0, 0], [2000, 0]), [
      { metres: 1000, seconds: 1000 / kmh(20) },
      { metres: 1000, seconds: 1000 / kmh(60) },
    ]);
    const slow = profile.positionAt(profile.timeAtMetres(500)).speed;
    const fast = profile.positionAt(profile.timeAtMetres(1500)).speed;
    expect(fast / slow).toBeGreaterThan(2.5);
  });

  it('falls back to 30 km/h without steps', () => {
    const profile = buildProfile(pathOf([0, 0], [1000, 0]));
    expect(profile.totalSeconds).toBeGreaterThan(120 * 0.95);
    expect(profile.totalSeconds).toBeLessThan(120 * 1.05);
  });

  it('handles a route shorter than one segment', () => {
    const profile = buildProfile(pathOf([0, 0], [5, 0]), [{ metres: 5, seconds: 2 }]);
    expect(profile.totalSeconds).toBeGreaterThan(0);
    expect(Number.isFinite(profile.totalSeconds)).toBe(true);
    const mid = profile.positionAt(profile.totalSeconds / 2);
    expect(mid.metres).toBeCloseTo(2.5, 1);
    expect(profile.positionAt(profile.totalSeconds).metres).toBeCloseTo(5, 1);
  });

  it('handles a single point', () => {
    const profile = buildProfile(pathOf([0, 0]));
    expect(profile.totalSeconds).toBe(0);
    expect(profile.positionAt(10)).toMatchObject({ metres: 0, speed: 0, done: true });
  });
});
