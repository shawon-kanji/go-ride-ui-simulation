import type { GeoPoint, LocationSource } from '../../../shared/location/location-store';
import type { UpdateLocationPayload } from '../api/types';
import {
  buildPayload,
  createLocationBroadcaster,
  HEARTBEAT_MAX_INTERVAL_MS,
  MOVEMENT_MIN_INTERVAL_MS,
  shouldSend,
  TICK_MS,
  useBroadcastStatus,
} from './location-broadcaster';

const START: GeoPoint = { lat: 3.139, lng: 101.6869 };
// ~11m and ~111m north of START.
const NUDGE: GeoPoint = { lat: 3.1391, lng: 101.6869 };
const FAR: GeoPoint = { lat: 3.14, lng: 101.6869 };

function setup(initial: GeoPoint | null = START, driverId: string | null = 'driver-1') {
  let point = initial;
  const source: LocationSource = 'simulated';
  const listeners = new Set<() => void>();
  const sent: UpdateLocationPayload[] = [];
  const broadcaster = createLocationBroadcaster({
    send: (payload) => {
      sent.push(payload);
      return Promise.resolve();
    },
    getDriverId: () => driverId,
    getFix: () => ({ point, source }),
    subscribeFix: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  const moveTo = (next: GeoPoint) => {
    point = next;
    listeners.forEach((listener) => listener());
  };
  return { broadcaster, sent, moveTo };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-25T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('shouldSend', () => {
  it('sends the first fix immediately', () => {
    expect(shouldSend({ now: 0, lastSentAt: -Infinity, lastSentPoint: null, point: START })).toBe(true);
  });

  it('ignores jitter under 25m until the heartbeat is due', () => {
    expect(shouldSend({ now: 30_000, lastSentAt: 0, lastSentPoint: START, point: NUDGE })).toBe(false);
    expect(shouldSend({ now: HEARTBEAT_MAX_INTERVAL_MS, lastSentAt: 0, lastSentPoint: START, point: NUDGE })).toBe(true);
  });

  it('throttles real movement to one ping per 10s', () => {
    expect(shouldSend({ now: 9_999, lastSentAt: 0, lastSentPoint: START, point: FAR })).toBe(false);
    expect(shouldSend({ now: MOVEMENT_MIN_INTERVAL_MS, lastSentAt: 0, lastSentPoint: START, point: FAR })).toBe(true);
  });
});

describe('buildPayload', () => {
  it('omits accuracy when there is none (strict server decoder)', () => {
    const payload = buildPayload('driver-1', START, 'simulated', Date.parse('2026-09-25T10:00:00Z'));
    expect(payload).toEqual({
      driver_id: 'driver-1',
      latitude: START.lat,
      longitude: START.lng,
      event_time: '2026-09-25T10:00:00.000Z',
      source: 'web_simulated',
    });
    expect('accuracy_m' in payload).toBe(false);
  });

  it('includes accuracy for browser fixes', () => {
    expect(buildPayload('d', { ...START, accuracyM: 12 }, 'browser', 0)).toMatchObject({
      accuracy_m: 12,
      source: 'web_browser',
    });
  });
});

describe('createLocationBroadcaster', () => {
  it('sends on start, then heartbeats while parked', () => {
    const { broadcaster, sent } = setup();
    broadcaster.start();
    expect(sent).toHaveLength(1);

    vi.advanceTimersByTime(HEARTBEAT_MAX_INTERVAL_MS - TICK_MS);
    expect(sent).toHaveLength(1);

    vi.advanceTimersByTime(TICK_MS);
    expect(sent).toHaveLength(2);
    broadcaster.stop();
  });

  it('sends a throttled move on the next tick once 10s have passed', () => {
    const { broadcaster, sent, moveTo } = setup();
    broadcaster.start();

    vi.advanceTimersByTime(3_000);
    moveTo(FAR);
    expect(sent).toHaveLength(1);

    vi.advanceTimersByTime(TICK_MS * 2);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ latitude: FAR.lat });
    broadcaster.stop();
  });

  it('sends a move immediately when the throttle already allows it', () => {
    const { broadcaster, sent, moveTo } = setup();
    broadcaster.start();
    vi.advanceTimersByTime(11_000);
    const before = sent.length;

    moveTo(FAR);
    expect(sent).toHaveLength(before + 1);
    broadcaster.stop();
  });

  it('waits for a first fix before sending', () => {
    const { broadcaster, sent, moveTo } = setup(null);
    broadcaster.start();
    vi.advanceTimersByTime(TICK_MS);
    expect(sent).toHaveLength(0);

    moveTo(START);
    expect(sent).toHaveLength(1);
    broadcaster.stop();
  });

  it('never sends without a driver id', () => {
    const { broadcaster, sent } = setup(START, null);
    broadcaster.start();
    vi.advanceTimersByTime(HEARTBEAT_MAX_INTERVAL_MS * 2);
    expect(sent).toHaveLength(0);
    broadcaster.stop();
  });

  it('stops sending after stop()', () => {
    const { broadcaster, sent, moveTo } = setup();
    broadcaster.start();
    broadcaster.stop();
    moveTo(FAR);
    vi.advanceTimersByTime(HEARTBEAT_MAX_INTERVAL_MS * 2);
    expect(sent).toHaveLength(1);
    expect(useBroadcastStatus.getState().broadcasting).toBe(false);
  });
});
