import type { JobOfferMessage } from '../api/types';
import { bestOfferId, countOpen, SETTLED_VISIBLE_MS, sortOffers, useOfferStore } from './offer-store';

const NOW = Date.parse('2026-09-25T10:00:00Z');

function makeOffer(id: string, overrides: Partial<JobOfferMessage> = {}): JobOfferMessage {
  return {
    type: 'job_offer',
    job_offer_id: id,
    request_id: `req-${id}`,
    trip_id: `trip-${id}`,
    offer_rank: 1,
    offer_version: 1,
    pickup_lat: 3.139,
    pickup_lng: 101.687,
    dropoff_lat: 3.15,
    dropoff_lng: 101.7,
    pickup_distance_km: 1.2,
    pickup_eta_minutes: 3,
    estimated_earning: 20,
    currency_code: 'MYR',
    expires_at: new Date(NOW + 20_000).toISOString(),
    sent_at: new Date(NOW).toISOString(),
    ...overrides,
  };
}

const store = () => useOfferStore.getState();
const cards = () => Object.values(store().offers);

beforeEach(() => store().clear());

describe('offer store', () => {
  it('adds a live card and ignores the same offer replayed on reconnect', () => {
    store().receive(makeOffer('a'), NOW);
    store().setState('a', 'accepting', NOW + 1);
    store().receive(makeOffer('a'), NOW + 2);

    expect(cards()).toHaveLength(1);
    expect(store().offers.a.state).toBe('accepting');
  });

  it('revives a settled card when dispatch re-offers the same row (redispatch keeps the job_offer_id)', () => {
    store().receive(makeOffer('a'), NOW);
    store().withdrawRequest('req-a', NOW + 1_000); // another driver accepted
    expect(store().offers.a.state).toBe('taken');

    // That driver cancelled; dispatch upserts this driver's row with a fresh expiry.
    const reoffer = makeOffer('a', { expires_at: new Date(NOW + 40_000).toISOString() });
    store().receive(reoffer, NOW + 5_000);
    expect(store().offers.a).toMatchObject({ state: 'live', settledAt: null, acked: false, offer: reoffer });
    expect(countOpen(cards())).toBe(1);
  });

  it('ignores a replay of a settled card with the same expiry', () => {
    store().receive(makeOffer('a'), NOW);
    store().withdrawRequest('req-a', NOW + 1_000);
    store().receive(makeOffer('a'), NOW + 2_000);
    expect(store().offers.a.state).toBe('taken');
  });

  it('marks an offer that arrives already past its TTL as expired', () => {
    store().receive(makeOffer('a', { expires_at: new Date(NOW - 1).toISOString() }), NOW);
    expect(store().offers.a.state).toBe('expired');
  });

  it('expires live offers when their own timer runs out', () => {
    store().receive(makeOffer('a', { expires_at: new Date(NOW + 5_000).toISOString() }), NOW);
    store().receive(makeOffer('b', { expires_at: new Date(NOW + 30_000).toISOString() }), NOW);

    store().expireDue(NOW + 5_000);

    expect(store().offers.a.state).toBe('expired');
    expect(store().offers.b.state).toBe('live');
  });

  it('turns every open card for a withdrawn request into "taken"', () => {
    store().receive(makeOffer('a', { request_id: 'req-1' }), NOW);
    store().receive(makeOffer('b', { request_id: 'req-2' }), NOW);
    store().setState('a', 'accepting', NOW);

    store().withdrawRequest('req-1', NOW + 100);

    expect(store().offers.a.state).toBe('taken');
    expect(store().offers.b.state).toBe('live');
  });

  it('does not overwrite an accepted card when its request is withdrawn', () => {
    store().receive(makeOffer('a', { request_id: 'req-1' }), NOW);
    store().setState('a', 'accepted', NOW);
    store().withdrawRequest('req-1', NOW + 100);
    expect(store().offers.a.state).toBe('accepted');
  });

  it('keeps settled cards visible briefly, then prunes them', () => {
    store().receive(makeOffer('a'), NOW);
    store().receive(makeOffer('b'), NOW);
    store().withdrawRequest('req-a', NOW);

    store().prune(NOW + SETTLED_VISIBLE_MS - 1);
    expect(cards()).toHaveLength(2);

    store().prune(NOW + SETTLED_VISIBLE_MS);
    expect(Object.keys(store().offers)).toEqual(['b']);
  });

  it('records the seen-ack once', () => {
    store().receive(makeOffer('a'), NOW);
    store().markAcked('a');
    expect(store().offers.a.acked).toBe(true);
  });
});

describe('sorting and highlighting', () => {
  it('lists open offers first, best earning first', () => {
    store().receive(makeOffer('low', { estimated_earning: 10 }), NOW);
    store().receive(makeOffer('high', { estimated_earning: 50 }), NOW);
    store().receive(makeOffer('gone', { estimated_earning: 99 }), NOW);
    store().withdrawRequest('req-gone', NOW);

    expect(sortOffers(cards()).map((c) => c.offer.job_offer_id)).toEqual(['high', 'low', 'gone']);
    expect(bestOfferId(cards())).toBe('high');
    expect(countOpen(cards())).toBe(2);
  });

  it('breaks earning ties by the nearest pickup', () => {
    store().receive(makeOffer('far', { pickup_distance_km: 4 }), NOW);
    store().receive(makeOffer('near', { pickup_distance_km: 0.5 }), NOW);
    expect(sortOffers(cards())[0].offer.job_offer_id).toBe('near');
  });

  it('highlights nothing when there is only one live offer', () => {
    store().receive(makeOffer('only'), NOW);
    expect(bestOfferId(cards())).toBeNull();
  });
});
