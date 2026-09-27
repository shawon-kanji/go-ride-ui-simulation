import type { RegisteredTab } from '../tab-registry';
import { captureLayout, parseLayouts, planLoad, readLayouts, upsertLayout, writeLayouts, type Layout } from './layouts';

const VIEW = { center: { lat: 3.14, lng: 101.69 }, zoom: 14 };

function tab(patch: Partial<RegisteredTab>): RegisteredTab {
  return {
    tabId: 'tab',
    role: 'driver',
    path: '/driver',
    userId: 'u',
    name: 'Dev Kumar',
    email: 'sim.driver1@goride.test',
    wsState: 'open',
    location: { lat: 3.1, lng: 101.6 },
    locationSource: 'simulated',
    activity: 'online',
    trip: null,
    driverTrip: null,
    sentAt: 0,
    lastSeen: 0,
    ...patch,
  };
}

describe('layouts', () => {
  beforeEach(() => window.localStorage.clear());

  it('captures signed-in, placed tabs by account, with each driver’s online state', () => {
    const layout = captureLayout(
      'Rush hour',
      [
        tab({ tabId: 'a' }),
        tab({ tabId: 'b', email: 'sim.driver2@goride.test', activity: 'offline' }),
        tab({ tabId: 'c', role: 'rider', email: 'sim.rider1@goride.test', activity: 'searching' }),
        tab({ tabId: 'd', email: null }),
        tab({ tabId: 'e', email: 'sim.driver3@goride.test', location: null }),
      ],
      VIEW,
      123,
    );
    expect(layout.actors).toEqual([
      { email: 'sim.driver1@goride.test', role: 'driver', lat: 3.1, lng: 101.6, online: true },
      { email: 'sim.driver2@goride.test', role: 'driver', lat: 3.1, lng: 101.6, online: false },
      { email: 'sim.rider1@goride.test', role: 'rider', lat: 3.1, lng: 101.6 },
    ]);
  });

  it('plans a load: moves matching tabs, fixes online state, keeps trips, lists missing accounts', () => {
    const layout: Layout = {
      name: 'x',
      savedAt: 1,
      view: VIEW,
      actors: [
        { email: 'sim.driver1@goride.test', role: 'driver', lat: 3.2, lng: 101.7, online: true },
        { email: 'sim.driver2@goride.test', role: 'driver', lat: 3.3, lng: 101.8, online: true },
        { email: 'sim.driver3@goride.test', role: 'driver', lat: 3.4, lng: 101.9, online: true },
        { email: 'sim.rider1@goride.test', role: 'rider', lat: 3.5, lng: 101.5 },
      ],
    };
    const plan = planLoad(layout, [
      tab({ tabId: 'a', activity: 'online' }),
      tab({ tabId: 'b', email: 'sim.driver2@goride.test', activity: 'offline' }),
      tab({ tabId: 'c', email: 'sim.driver3@goride.test', driverTrip: { requestId: 'r', ongoingTripId: 'o', phase: 'on_trip', pickup: { lat: 0, lng: 0 }, dropoff: { lat: 0, lng: 0 } } }),
    ]);
    expect(plan.moves).toEqual([
      { tabId: 'a', point: { lat: 3.2, lng: 101.7 } },
      { tabId: 'b', point: { lat: 3.3, lng: 101.8 } },
    ]);
    expect(plan.online.map((o) => [o.tab.tabId, o.online])).toEqual([['b', true]]);
    expect(plan.kept.map((t) => t.tabId)).toEqual(['c']);
    expect(plan.missing.map((m) => m.email)).toEqual(['sim.rider1@goride.test']);
  });

  it('round-trips through storage and replaces a layout of the same name', () => {
    const one = captureLayout('A', [tab({})], VIEW, 1);
    const two = captureLayout('B', [tab({})], VIEW, 2);
    writeLayouts(upsertLayout(upsertLayout([], one), two));
    expect(readLayouts().map((l) => l.name)).toEqual(['B', 'A']);
    writeLayouts(upsertLayout(readLayouts(), captureLayout('A', [], VIEW, 3)));
    expect(readLayouts().map((l) => [l.name, l.savedAt])).toEqual([
      ['A', 3],
      ['B', 2],
    ]);
  });

  it('imports one layout or a list, and rejects anything else', () => {
    const layout = captureLayout('A', [tab({})], VIEW, 1);
    expect(parseLayouts(JSON.stringify(layout))).toHaveLength(1);
    expect(parseLayouts(JSON.stringify([layout, layout]))).toHaveLength(2);
    expect(() => parseLayouts('nope')).toThrow('isn’t JSON');
    expect(() => parseLayouts(JSON.stringify({ name: 'x' }))).toThrow('isn’t a simulator layout');
    expect(() => parseLayouts(JSON.stringify([{ ...layout, actors: [{ email: 'a', role: 'admin', lat: 1, lng: 2 }] }]))).toThrow();
  });
});
