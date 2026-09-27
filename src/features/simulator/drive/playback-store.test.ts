import { profileFor } from '../../../shared/route/nav-route';
import { snapToRoute } from '../../../shared/route/snap';
import { encodePolyline } from '../../../shared/route/polyline';
import { pathOf } from '../../../shared/route/test-paths';
import type { BusMessage } from '../../../shared/tab/types';
import { createPlaybackStore, type LegToDrive } from './playback-store';

const LEG: LegToDrive = {
  requestId: 'req-1',
  driverId: 'drv-a',
  leg: 'pickup',
  path: encodePolyline(pathOf([0, 0], [600, 0], [600, 400])),
  steps: [{ metres: 1000, seconds: 120 }],
};
const PROFILE = profileFor(LEG);

function setup() {
  let clock = 1_000_000;
  const posts: BusMessage[] = [];
  let ticking = 0;
  const store = createPlaybackStore({
    now: () => clock,
    post: (m) => posts.push(m),
    createTicker: () => {
      ticking++;
      return { stop: () => ticking-- };
    },
  });
  const advance = (seconds: number) => {
    clock += seconds * 1000;
    store.getState().tick();
  };
  const fixes = () => posts.filter((m) => m.type === 'set-location');
  const lastFix = () => {
    const fix = fixes().at(-1);
    if (fix?.type !== 'set-location') throw new Error('no fix yet');
    return fix;
  };
  const metresDone = () => snapToRoute(PROFILE, lastFix()).metres;
  return { store, posts, advance, fixes, lastFix, metresDone, isTicking: () => ticking > 0 };
}

describe('playback store', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('shares the route on start and drives along it from the wall clock', () => {
    const { store, posts, advance, lastFix, metresDone, isTicking } = setup();
    store.getState().start('tab-1', LEG);
    expect(posts[0]).toMatchObject({ type: 'nav-route', route: { leg: 'pickup', speedFactor: 1, paused: false } });
    expect(isTicking()).toBe(true);

    advance(30);
    expect(lastFix()).toMatchObject({ tabId: 'tab-1', playback: true });
    expect(snapToRoute(PROFILE, lastFix()).offM).toBeLessThan(1);
    const at30 = metresDone();
    expect(at30).toBeCloseTo(PROFILE.positionAt(30).metres, 0);

    // A tick that arrives late (background throttling) lands further along the road, not off it.
    advance(47);
    expect(metresDone()).toBeCloseTo(PROFILE.positionAt(77).metres, 0);
    expect(snapToRoute(PROFILE, lastFix()).offM).toBeLessThan(1);
  });

  it('holds the position while paused and carries on from there', () => {
    const { store, advance, metresDone, fixes, isTicking } = setup();
    store.getState().start('tab-1', LEG);
    advance(20);
    const before = metresDone();
    store.getState().pause('tab-1');
    expect(isTicking()).toBe(false);
    const sent = fixes().length;
    advance(60);
    expect(fixes()).toHaveLength(sent); // nothing sent while paused

    store.getState().resume('tab-1');
    advance(0.25);
    expect(metresDone()).toBeGreaterThanOrEqual(before);
    expect(metresDone()).toBeLessThan(before + 5);
  });

  it('×10 arrives in a tenth of the time', () => {
    const { store, advance, lastFix } = setup();
    store.getState().start('tab-1', LEG, 10);
    advance(PROFILE.totalSeconds / 10 - 1);
    expect(store.getState().playbacks['tab-1'].status).toBe('driving');
    advance(1.5);
    expect(store.getState().playbacks['tab-1'].status).toBe('arrived');
    const end = PROFILE.points.at(-1)!;
    expect(lastFix()).toMatchObject({ lat: end.lat, lng: end.lng });
  });

  it('changing speed mid-drive continues from where the car is', () => {
    const { store, advance, metresDone } = setup();
    store.getState().start('tab-1', LEG);
    advance(20);
    const at20 = metresDone();
    store.getState().setSpeed('tab-1', 5);
    advance(0.01);
    expect(metresDone()).toBeCloseTo(at20, 0);
    expect(store.getState().playbacks['tab-1'].route.speedFactor).toBe(5);
  });

  it('stops ticking and keeps the route shared on arrival', () => {
    const { store, advance, isTicking, posts } = setup();
    store.getState().start('tab-1', LEG);
    advance(PROFILE.totalSeconds + 5);
    expect(store.getState().playbacks['tab-1'].status).toBe('arrived');
    expect(isTicking()).toBe(false);
    expect(posts.some((m) => m.type === 'nav-route-clear')).toBe(false);
  });

  it('stop un-shares the route', () => {
    const { store, advance, posts, isTicking } = setup();
    store.getState().start('tab-1', LEG);
    advance(10);
    store.getState().stop('tab-1');
    expect(store.getState().playbacks['tab-1']).toBeUndefined();
    expect(posts.at(-1)).toEqual({ type: 'nav-route-clear', requestId: 'req-1', driverId: 'drv-a', leg: 'pickup' });
    expect(isTicking()).toBe(false);
  });

  it('starting the next leg clears the previous one and keeps the speed', () => {
    const { store, posts } = setup();
    store.getState().start('tab-1', LEG, 5);
    store.getState().start('tab-1', { ...LEG, leg: 'dropoff' });
    expect(posts.some((m) => m.type === 'nav-route-clear' && m.leg === 'pickup')).toBe(true);
    expect(store.getState().playbacks['tab-1'].route).toMatchObject({ leg: 'dropoff', speedFactor: 5 });
  });

  it('holds while the tab is gone and resumes when it is back; a hand-paused drive stays paused', () => {
    const { store, advance, metresDone } = setup();
    store.getState().start('tab-1', LEG);
    advance(15);
    const before = metresDone();
    store.getState().hold('tab-1');
    expect(store.getState().playbacks['tab-1'].status).toBe('held');
    advance(30);
    store.getState().release('tab-1');
    advance(0.25);
    expect(metresDone()).toBeLessThan(before + 5);

    store.getState().pause('tab-1');
    store.getState().release('tab-1');
    expect(store.getState().playbacks['tab-1'].status).toBe('paused');
  });

  it('survives a simulator reload', () => {
    const first = setup();
    first.store.getState().start('tab-1', LEG, 2);
    const reloaded = setup();
    expect(reloaded.store.getState().playbacks['tab-1'].route.speedFactor).toBe(2);
    expect(reloaded.isTicking()).toBe(true);
    reloaded.store.getState().republish();
    expect(reloaded.posts).toHaveLength(1);
    expect(reloaded.posts[0].type).toBe('nav-route');
  });
});
