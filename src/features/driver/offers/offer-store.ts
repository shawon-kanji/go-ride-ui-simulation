import { create } from 'zustand';

import type { JobOfferMessage } from '../api/types';

// Job offers held by this driver tab (D08). Rules from the design handoff and the
// websocket-gateway protocol:
//   - accept-only, per-offer TTL, first driver to accept wins; there is no decline
//   - offer_withdrawn (and trip_cancelled) identify the *request*, not the offer:
//     every live card for that request becomes "Taken by another driver"
//   - offers are replayed when the socket reconnects, so a repeat is a no-op — except a
//     re-offer of a settled card (redispatch reuses the job_offer_id with a new expiry)
//   - a settled card (taken/expired) stays visible, dimmed, for a few seconds

export type OfferState = 'live' | 'accepting' | 'accepted' | 'taken' | 'expired';

export interface OfferCard {
  offer: JobOfferMessage;
  state: OfferState;
  receivedAt: number;
  settledAt: number | null;
  acked: boolean;
}

export const SETTLED_VISIBLE_MS = 8_000;

interface OfferStoreState {
  offers: Record<string, OfferCard>;
  receive: (offer: JobOfferMessage, now?: number) => void;
  withdrawRequest: (requestId: string, now?: number) => void;
  expireDue: (now?: number) => void;
  setState: (jobOfferId: string, state: OfferState, now?: number) => void;
  markAcked: (jobOfferId: string) => void;
  prune: (now?: number) => void;
  clear: () => void;
}

const isOpen = (state: OfferState) => state === 'live' || state === 'accepting';

export const useOfferStore = create<OfferStoreState>((set) => ({
  offers: {},

  receive: (offer, now = Date.now()) =>
    set((store) => {
      const existing = store.offers[offer.job_offer_id];
      // A repeat is a replay after reconnect — unless the card had settled and this one
      // expires later: after a driver cancel, dispatch re-offers by resetting the same
      // driver_job_offers row, so the job_offer_id comes back (offer_version is always 1).
      const reoffer = existing && !isOpen(existing.state) && Date.parse(offer.expires_at) > Date.parse(existing.offer.expires_at);
      if (existing && !reoffer) return store;
      const expired = Date.parse(offer.expires_at) <= now;
      return {
        offers: {
          ...store.offers,
          [offer.job_offer_id]: {
            offer,
            state: expired ? 'expired' : 'live',
            receivedAt: now,
            settledAt: expired ? now : null,
            acked: false,
          },
        },
      };
    }),

  withdrawRequest: (requestId, now = Date.now()) =>
    set((store) => {
      let changed = false;
      const offers = { ...store.offers };
      for (const [id, card] of Object.entries(offers)) {
        if (card.offer.request_id === requestId && isOpen(card.state)) {
          offers[id] = { ...card, state: 'taken', settledAt: now };
          changed = true;
        }
      }
      return changed ? { offers } : store;
    }),

  expireDue: (now = Date.now()) =>
    set((store) => {
      let changed = false;
      const offers = { ...store.offers };
      for (const [id, card] of Object.entries(offers)) {
        if (card.state === 'live' && Date.parse(card.offer.expires_at) <= now) {
          offers[id] = { ...card, state: 'expired', settledAt: now };
          changed = true;
        }
      }
      return changed ? { offers } : store;
    }),

  setState: (jobOfferId, state, now = Date.now()) =>
    set((store) => {
      const card = store.offers[jobOfferId];
      if (!card) return store;
      return {
        offers: {
          ...store.offers,
          [jobOfferId]: { ...card, state, settledAt: isOpen(state) ? null : now },
        },
      };
    }),

  markAcked: (jobOfferId) =>
    set((store) => {
      const card = store.offers[jobOfferId];
      if (!card || card.acked) return store;
      return { offers: { ...store.offers, [jobOfferId]: { ...card, acked: true } } };
    }),

  prune: (now = Date.now()) =>
    set((store) => {
      const offers = Object.fromEntries(
        Object.entries(store.offers).filter(
          ([, card]) => card.settledAt === null || now - card.settledAt < SETTLED_VISIBLE_MS,
        ),
      );
      return Object.keys(offers).length === Object.keys(store.offers).length ? store : { offers };
    }),

  clear: () => set({ offers: {} }),
}));

/** Open offers first (best earning first, then nearest pickup), settled ones after. */
export function sortOffers(cards: OfferCard[]): OfferCard[] {
  return [...cards].sort((a, b) => {
    const openDiff = Number(isOpen(b.state)) - Number(isOpen(a.state));
    if (openDiff !== 0) return openDiff;
    const earningDiff = (b.offer.estimated_earning ?? 0) - (a.offer.estimated_earning ?? 0);
    if (earningDiff !== 0) return earningDiff;
    return a.offer.pickup_distance_km - b.offer.pickup_distance_km;
  });
}

/** The live offer the design highlights with a green border, or null. */
export function bestOfferId(cards: OfferCard[]): string | null {
  const open = sortOffers(cards).filter((card) => card.state === 'live');
  return open.length > 1 ? open[0].offer.job_offer_id : null;
}

export function countOpen(cards: OfferCard[]): number {
  return cards.filter((card) => isOpen(card.state)).length;
}
