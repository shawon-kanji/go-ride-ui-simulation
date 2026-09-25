// Currency display: the handoff shows Malaysian ringgit as "RM 72.00". Unknown codes
// are shown as-is; a missing code falls back to RM like the driver app.
const CURRENCY_SYMBOLS: Record<string, string> = { MYR: 'RM', RM: 'RM' };

export function formatMoney(amount: number, currencyCode?: string): string {
  const symbol = currencyCode ? (CURRENCY_SYMBOLS[currencyCode] ?? currencyCode) : 'RM';
  return `${symbol} ${amount.toFixed(2)}`;
}

export function formatKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function formatMinutesShort(minutes: number): string {
  return `${Math.max(1, Math.round(minutes))} min`;
}

/** 252 → "4h 12m"; drops the hours when there are none (from the app's StatCards). */
export function formatMinutes(total: number): string {
  const totalMinutes = Math.floor(total);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
