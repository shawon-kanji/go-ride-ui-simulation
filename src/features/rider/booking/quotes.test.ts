import type { FareQuote } from '../api/types';
import { createIdempotencyKeys, formatCountdown, isQuoteExpired, quoteSecondsLeft, sortQuotes } from './quotes';

const NOW = Date.parse('2026-09-25T10:00:00Z');

describe('quote validity', () => {
  it('counts whole seconds down to expires_at', () => {
    expect(quoteSecondsLeft({ expires_at: '2026-09-25T10:15:00Z' }, NOW)).toBe(900);
    expect(quoteSecondsLeft({ expires_at: '2026-09-25T10:00:00.999Z' }, NOW)).toBe(0);
  });

  it('is expired at and after expires_at, and when the date is unreadable', () => {
    expect(isQuoteExpired({ expires_at: '2026-09-25T10:00:00Z' }, NOW)).toBe(true);
    expect(isQuoteExpired({ expires_at: '2026-09-25T09:59:00Z' }, NOW)).toBe(true);
    expect(isQuoteExpired({ expires_at: '' }, NOW)).toBe(true);
    expect(isQuoteExpired({ expires_at: '2026-09-25T10:00:02Z' }, NOW)).toBe(false);
  });

  it('formats the countdown as m:ss', () => {
    expect(formatCountdown(900)).toBe('15:00');
    expect(formatCountdown(61)).toBe('1:01');
    expect(formatCountdown(-3)).toBe('0:00');
  });
});

describe('sortQuotes', () => {
  it('orders tiers Standard, 6 seater, Plus whatever the server order', () => {
    const q = (service_type: FareQuote['service_type']) => ({ service_type }) as FareQuote;
    expect(sortQuotes([q('RIDE_PREMIUM'), q('RIDE'), q('RIDE_XL')]).map((x) => x.service_type)).toEqual([
      'RIDE',
      'RIDE_XL',
      'RIDE_PREMIUM',
    ]);
  });
});

describe('createIdempotencyKeys', () => {
  it('reuses the key when the same fare is booked again (a retry)', () => {
    let n = 0;
    const keyFor = createIdempotencyKeys(() => `key-${++n}`);
    expect(keyFor('fare-1')).toBe('key-1');
    expect(keyFor('fare-1')).toBe('key-1');
  });

  it('gives a new quote a new key', () => {
    let n = 0;
    const keyFor = createIdempotencyKeys(() => `key-${++n}`);
    keyFor('fare-1');
    expect(keyFor('fare-2')).toBe('key-2');
  });
});
