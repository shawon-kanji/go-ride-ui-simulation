import { useEffect, useState } from 'react';

import { useRealtimeStore } from '../../../shared/realtime/use-realtime';
import { Button } from '../../../shared/ui/Button';
import { usePlaceLabel } from '../../../shared/places/places';
import { formatKm, formatMinutesShort, formatMoney } from '../format';
import { type OfferCard as OfferCardModel, useOfferStore } from './offer-store';

// One D08 offer: fare at 24px, trip distance/duration, pickup → drop-off stem with
// the pickup's "N min away", then a footer with this offer's own countdown and Accept.
// The best live offer gets a green border and a green Accept.

const URGENT_MS = 8_000;

/** Street name via reverse geocoding; coordinates while loading or if it fails. */
function PlaceName({ lat, lng }: { lat: number; lng: number }) {
  const { data } = usePlaceLabel('driver', lat, lng);
  if (data) return <>{data}</>;
  return <span className="font-mono text-[13px]">{`${lat.toFixed(4)}, ${lng.toFixed(4)}`}</span>;
}

function useCountdown(expiresAt: string, sentAt: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, []);
  const expires = Date.parse(expiresAt);
  const total = Math.max(1, expires - Date.parse(sentAt));
  const remaining = Math.max(0, expires - now);
  return { remaining, fraction: Math.min(1, remaining / total) };
}

const SETTLED_LABEL = {
  taken: 'Taken by another driver',
  expired: 'Expired',
  accepted: 'Accepted',
} as const;

interface OfferCardProps {
  card: OfferCardModel;
  best: boolean;
  onAccept: (jobOfferId: string) => void;
}

export function OfferCard({ card, best, onAccept }: OfferCardProps) {
  const { offer, state } = card;
  const client = useRealtimeStore((s) => s.client);
  const { remaining, fraction } = useCountdown(offer.expires_at, offer.sent_at);
  const settled = state === 'taken' || state === 'expired' || state === 'accepted';
  const urgent = remaining < URGENT_MS;

  // Tell the gateway the driver has seen this offer (delivery bookkeeping only).
  // Reads `acked` from the store, not props: StrictMode re-runs this effect before the
  // re-render, and a stale prop would send a second ack.
  useEffect(() => {
    if (!client || useOfferStore.getState().offers[offer.job_offer_id]?.acked) return;
    if (client.send({ type: 'ack', job_offer_id: offer.job_offer_id, status: 'seen' })) {
      useOfferStore.getState().markAcked(offer.job_offer_id);
    }
  }, [client, offer.job_offer_id]);

  const tripParts = [
    offer.trip_distance_km ? formatKm(offer.trip_distance_km) : null,
    offer.trip_duration_minutes ? formatMinutesShort(offer.trip_duration_minutes) : null,
  ].filter(Boolean);

  return (
    <article
      data-testid="offer-card"
      data-state={state}
      className={`overflow-hidden rounded-card border bg-white ${best && !settled ? 'border-2 border-success-500' : 'border-neutral-200'} ${settled ? 'opacity-50' : ''}`}
    >
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-baseline gap-2">
          <p className="text-[24px] font-extrabold tracking-[-0.02em] text-neutral-900">
            {offer.estimated_earning !== undefined ? formatMoney(offer.estimated_earning, offer.currency_code) : '—'}
          </p>
          {tripParts.length > 0 && <p className="text-[13px] font-semibold text-neutral-500">{tripParts.join(' · ')}</p>}
          {offer.rider_name && (
            <span className="ml-auto max-w-[35%] truncate rounded-pill bg-neutral-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-600">
              {offer.rider_name}
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-[12px_1fr] gap-x-2.5">
          <span className="mt-[7px] h-2 w-2 rounded-full bg-primary-500" />
          <p className="text-[14px] font-bold text-neutral-900">
            <PlaceName lat={offer.pickup_lat} lng={offer.pickup_lng} />
            <span className="font-medium text-neutral-500"> · {formatMinutesShort(offer.pickup_eta_minutes)} away</span>
          </p>
          <span className="mx-auto my-0.5 h-3 w-px bg-neutral-300" />
          <span />
          <span className="mt-[7px] h-2 w-2 rounded-full bg-danger-500" />
          <p className="text-[14px] font-bold text-neutral-900">
            <PlaceName lat={offer.dropoff_lat} lng={offer.dropoff_lng} />
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 border-t border-neutral-200 px-4 py-3">
        {settled ? (
          <p className="flex-1 text-[14px] font-bold text-neutral-600">{SETTLED_LABEL[state]}</p>
        ) : (
          <div className="flex-1">
            <p className={`text-[17px] font-extrabold ${urgent ? 'text-danger-600' : 'text-neutral-900'}`}>
              {Math.ceil(remaining / 1000)}s <span className="text-[13px] font-medium text-neutral-500">left</span>
            </p>
            <div className="mt-1.5 h-1 overflow-hidden rounded-pill bg-neutral-200">
              <div
                className={`h-full rounded-pill ${urgent ? 'bg-danger-500' : 'bg-success-500'}`}
                style={{ width: `${fraction * 100}%` }}
              />
            </div>
          </div>
        )}
        {!settled && (
          <Button
            label={state === 'accepting' ? 'Accepting' : 'Accept'}
            variant={best ? 'success' : 'dark'}
            shape="pill"
            size="default"
            fullWidth={false}
            className="min-w-[98px]"
            loading={state === 'accepting'}
            onClick={() => onAccept(offer.job_offer_id)}
          />
        )}
      </div>
    </article>
  );
}
