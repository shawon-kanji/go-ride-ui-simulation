import type { FareQuote, ServiceType } from '../api/types';

// R03 helpers: tier presentation, quote validity and the booking idempotency key.

export interface TierInfo {
  name: string;
  /** Short line under the name, like the handoff's "4 seats". */
  detail: string;
  tag?: string;
}

// Names follow the fare_configs tier_name metadata and the handoff (Standard /
// Standard 6 seater / Standard Plus). Seat counts mirror trip-dispatch-worker's
// eligibility: RIDE_XL needs ≥6 seats, RIDE_PREMIUM a luxury vehicle.
export const TIERS: Record<ServiceType, TierInfo> = {
  RIDE: { name: 'Standard', detail: '4 seats', tag: 'Car or taxi' },
  RIDE_XL: { name: 'Standard 6 seater', detail: '6 seats · room for luggage', tag: 'Luggage' },
  RIDE_PREMIUM: { name: 'Standard Plus', detail: 'Luxury cars · top-rated drivers' },
};

const ORDER: ServiceType[] = ['RIDE', 'RIDE_XL', 'RIDE_PREMIUM'];

export function sortQuotes(quotes: FareQuote[]): FareQuote[] {
  return [...quotes].sort((a, b) => ORDER.indexOf(a.service_type) - ORDER.indexOf(b.service_type));
}

/** Whole seconds until the quote's locked price lapses (0 once expired). */
export function quoteSecondsLeft(quote: Pick<FareQuote, 'expires_at'>, now = Date.now()): number {
  const expiresAt = Date.parse(quote.expires_at);
  if (Number.isNaN(expiresAt)) return 0;
  return Math.max(0, Math.floor((expiresAt - now) / 1000));
}

export function isQuoteExpired(quote: Pick<FareQuote, 'expires_at'>, now = Date.now()): boolean {
  return quoteSecondsLeft(quote, now) === 0;
}

/** 754 → "12:34". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * One Idempotency-Key per fare quote: tapping Book again after a timeout or a network
 * error resends the same key, so cab-request-handler returns the request it already
 * created instead of a second one. A new quote gets a new key.
 */
export function createIdempotencyKeys(newKey: () => string = () => crypto.randomUUID()) {
  const keys = new Map<string, string>();
  return (fareId: string): string => {
    let key = keys.get(fareId);
    if (!key) {
      key = newKey();
      keys.set(fareId, key);
    }
    return key;
  };
}

export const idempotencyKeyForFare = createIdempotencyKeys();
