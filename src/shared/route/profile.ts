import { bearingDeg, densify, distanceM, interpolate, turnAngleDeg, type Point } from './geometry';

// How a car drives a route: a speed at every point, then where it is at any time. The
// simulator plays it back as the fake GPS; the driver and rider apps build the identical
// profile from the same path + steps to draw progress and ETAs.
//
//   - The path is split into ≤10 m segments. Each segment's cruise speed comes from the
//     route step it falls in (step metres ÷ step seconds, e.g. Google's staticDuration).
//   - Corners slow the car: a heading change over ±15 m of >60° caps it at 15 km/h, >30°
//     at 25 km/h.
//   - Acceleration ≤1.5 m/s², braking ≤2.5 m/s²; it starts and ends at rest.
//   - Cruise speeds are then scaled together so the whole drive takes about as long as
//     the steps say, which keeps our ETA close to Google's.
// Between two points the acceleration is constant, so speed² changes linearly with distance.

export interface RouteStep {
  metres: number;
  seconds: number;
}

export interface RoutePosition extends Point {
  /** Compass heading of the car, 0–360°. */
  heading: number;
  /** Distance driven along the route. */
  metres: number;
  /** m/s */
  speed: number;
  /** Profile time (s), clamped to [0, totalSeconds]. */
  t: number;
  done: boolean;
}

export interface RouteProfile {
  points: Point[];
  /** Metres from the start to each point. */
  cumMetres: number[];
  /** Seconds from the start to each point. */
  cumSeconds: number[];
  /** Speed at each point, m/s. */
  speeds: number[];
  totalMetres: number;
  totalSeconds: number;
  positionAt: (t: number) => RoutePosition;
  /** Profile time at which the car has driven `metres`. */
  timeAtMetres: (metres: number) => number;
  pointAtMetres: (metres: number) => Point & { heading: number };
}

export const MAX_SEGMENT_M = 10;
export const ACCEL_MPS2 = 1.5;
export const BRAKE_MPS2 = 2.5;
export const MIN_CRUISE_MPS = 3;
export const MAX_CRUISE_MPS = 33; // ~120 km/h
export const FALLBACK_CRUISE_MPS = 30 / 3.6;
const CORNER_WINDOW_M = 15;
const CORNER_CAPS = [
  { minAngle: 60, speed: 15 / 3.6 },
  { minAngle: 30, speed: 25 / 3.6 },
];
const CALIBRATION_ROUNDS = 8;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Largest i with sorted[i] ≤ value (0 when value is below the first). */
function floorIndex(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sorted[mid] <= value) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Heading change around each point, measured from CORNER_WINDOW_M behind to as far ahead. */
function cornerCaps(points: Point[], cum: number[]): number[] {
  const caps = points.map(() => Infinity);
  let back = 0;
  let ahead = 0;
  for (let i = 1; i < points.length - 1; i++) {
    while (back < i - 1 && cum[i] - cum[back + 1] >= CORNER_WINDOW_M) back++;
    if (ahead < i + 1) ahead = i + 1;
    while (ahead < points.length - 1 && cum[ahead] - cum[i] < CORNER_WINDOW_M) ahead++;
    const angle = turnAngleDeg(bearingDeg(points[back], points[i]), bearingDeg(points[i], points[ahead]));
    const cap = CORNER_CAPS.find((c) => angle > c.minAngle);
    if (cap) caps[i] = cap.speed;
  }
  return caps;
}

function segmentTime(d: number, v0: number, v1: number): number {
  if (v0 + v1 > 1e-6) return (2 * d) / (v0 + v1);
  // A route shorter than one segment: speed up to the middle and brake to the end.
  return 2 * Math.sqrt(d / Math.min(ACCEL_MPS2, BRAKE_MPS2));
}

/** Metres covered τ seconds into a segment, and the speed there. */
function segmentMotion(d: number, v0: number, v1: number, dt: number, tau: number): { s: number; v: number } {
  if (v0 + v1 > 1e-6) {
    const a = (v1 * v1 - v0 * v0) / (2 * d);
    return { s: Math.min(d, v0 * tau + 0.5 * a * tau * tau), v: v0 + a * tau };
  }
  const a = (4 * d) / (dt * dt);
  const half = dt / 2;
  if (tau <= half) return { s: 0.5 * a * tau * tau, v: a * tau };
  const rest = dt - tau;
  return { s: d - 0.5 * a * rest * rest, v: a * rest };
}

/** Inverse of segmentMotion: seconds into a segment at which s metres are covered. */
function segmentTau(d: number, v0: number, v1: number, dt: number, s: number): number {
  if (v0 + v1 > 1e-6) {
    const a = (v1 * v1 - v0 * v0) / (2 * d);
    if (Math.abs(a) < 1e-9) return s / v0;
    return (-v0 + Math.sqrt(Math.max(0, v0 * v0 + 2 * a * s))) / a;
  }
  const a = (4 * d) / (dt * dt);
  return s <= d / 2 ? Math.sqrt((2 * s) / a) : dt - Math.sqrt((2 * (d - s)) / a);
}

export function buildProfile(path: Point[], steps: RouteStep[] = []): RouteProfile {
  const points = densify(path, MAX_SEGMENT_M);
  const n = points.length;
  const cumMetres = [0];
  for (let i = 1; i < n; i++) cumMetres.push(cumMetres[i - 1] + distanceM(points[i - 1], points[i]));
  const totalMetres = cumMetres[n - 1] ?? 0;

  // Step speeds per segment. Step lengths are scaled onto the path, as they never add up exactly.
  const usable = steps.filter((s) => s.metres > 0 && s.seconds > 0);
  const legSteps = usable.length > 0 ? usable : [{ metres: totalMetres, seconds: totalMetres / FALLBACK_CRUISE_MPS }];
  const stepTotal = legSteps.reduce((sum, s) => sum + s.metres, 0);
  const stepEnds: number[] = [];
  let acc = 0;
  for (const step of legSteps) {
    acc += step.metres;
    stepEnds.push((acc / stepTotal) * totalMetres);
  }
  const stepCruise: number[] = [];
  for (let i = 0, step = 0; i < n - 1; i++) {
    const mid = (cumMetres[i] + cumMetres[i + 1]) / 2;
    while (step < legSteps.length - 1 && mid > stepEnds[step]) step++;
    stepCruise.push(legSteps[step].metres / legSteps[step].seconds);
  }
  const targetSeconds = legSteps.reduce((sum, s) => sum + s.seconds, 0);
  const caps = cornerCaps(points, cumMetres);

  const speedsFor = (scale: number): number[] => {
    const cruise = stepCruise.map((v) => clamp(v * scale, MIN_CRUISE_MPS, MAX_CRUISE_MPS));
    const v = points.map((_, i) => (i === 0 || i === n - 1 ? 0 : Math.min(cruise[i - 1], cruise[i], caps[i])));
    for (let i = 1; i < n; i++) {
      const d = cumMetres[i] - cumMetres[i - 1];
      v[i] = Math.min(v[i], Math.sqrt(v[i - 1] * v[i - 1] + 2 * ACCEL_MPS2 * d));
    }
    for (let i = n - 2; i >= 0; i--) {
      const d = cumMetres[i + 1] - cumMetres[i];
      v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * BRAKE_MPS2 * d));
    }
    return v;
  };
  const timesFor = (v: number[]): number[] => {
    const cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + segmentTime(cumMetres[i] - cumMetres[i - 1], v[i - 1], v[i]));
    return cum;
  };

  let scale = 1;
  let speeds = speedsFor(scale);
  let cumSeconds = timesFor(speeds);
  for (let round = 0; round < CALIBRATION_ROUNDS && n > 1 && targetSeconds > 0; round++) {
    const total = cumSeconds[n - 1];
    if (Math.abs(total / targetSeconds - 1) < 0.01) break;
    scale = clamp(scale * (total / targetSeconds), 0.2, 5);
    speeds = speedsFor(scale);
    cumSeconds = timesFor(speeds);
  }
  const totalSeconds = cumSeconds[n - 1] ?? 0;

  const headingOf = (i: number) => (n > 1 ? bearingDeg(points[Math.min(i, n - 2)], points[Math.min(i, n - 2) + 1]) : 0);

  const positionAt = (time: number): RoutePosition => {
    const t = clamp(time, 0, totalSeconds);
    if (n < 2) return { ...(points[0] ?? { lat: 0, lng: 0 }), heading: 0, metres: 0, speed: 0, t, done: true };
    if (t >= totalSeconds) {
      return { ...points[n - 1], heading: headingOf(n - 2), metres: totalMetres, speed: 0, t, done: true };
    }
    const i = Math.min(floorIndex(cumSeconds, t), n - 2);
    const d = cumMetres[i + 1] - cumMetres[i];
    const dt = cumSeconds[i + 1] - cumSeconds[i];
    const { s, v } = segmentMotion(d, speeds[i], speeds[i + 1], dt, t - cumSeconds[i]);
    const at = interpolate(points[i], points[i + 1], d > 0 ? s / d : 0);
    return { ...at, heading: headingOf(i), metres: cumMetres[i] + s, speed: Math.max(0, v), t, done: false };
  };

  const timeAtMetres = (metres: number): number => {
    if (n < 2) return 0;
    const m = clamp(metres, 0, totalMetres);
    if (m >= totalMetres) return totalSeconds;
    const i = Math.min(floorIndex(cumMetres, m), n - 2);
    const d = cumMetres[i + 1] - cumMetres[i];
    const dt = cumSeconds[i + 1] - cumSeconds[i];
    return cumSeconds[i] + segmentTau(d, speeds[i], speeds[i + 1], dt, m - cumMetres[i]);
  };

  const pointAtMetres = (metres: number): Point & { heading: number } => {
    if (n < 2) return { ...(points[0] ?? { lat: 0, lng: 0 }), heading: 0 };
    const m = clamp(metres, 0, totalMetres);
    const i = Math.min(floorIndex(cumMetres, m), n - 2);
    const d = cumMetres[i + 1] - cumMetres[i];
    return { ...interpolate(points[i], points[i + 1], d > 0 ? (m - cumMetres[i]) / d : 0), heading: headingOf(i) };
  };

  return { points, cumMetres, cumSeconds, speeds, totalMetres, totalSeconds, positionAt, timeAtMetres, pointAtMetres };
}

/** What's left from a point `metres` along the route. */
export function remainingFrom(profile: RouteProfile, metres: number): { metres: number; seconds: number } {
  return {
    metres: Math.max(0, profile.totalMetres - metres),
    seconds: Math.max(0, profile.totalSeconds - profile.timeAtMetres(metres)),
  };
}
