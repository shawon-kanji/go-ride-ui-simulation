import { Polyline } from '@vis.gl/react-google-maps';
import { ArrowLeft, Banknote, CalendarDays, Car, CarFront, ChevronDown, ChevronUp, RefreshCw, User, Van } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';

import { ApiError } from '../../../shared/api/http-client';
import { formatMoney, formatMoneyTight } from '../../../shared/lib/format';
import { Button } from '../../../shared/ui/Button';
import { useFareEstimateQuery, useRequestCabMutation } from '../api/queries';
import type { FareQuote, ServiceType } from '../api/types';
import { useBookingDraft } from '../booking/booking-draft';
import { formatCountdown, quoteSecondsLeft, sortQuotes, TIERS } from '../booking/quotes';
import { PIN_COLORS } from '../components/map-colors';
import { FitBounds, PlaceDot, RiderMap } from '../components/map-pieces';

// R03 Pick a ride: every tier from one POST /cab/fare-estimate (the backend locks each
// quote for 15 minutes), the route on the map, the chosen tier's fare breakdown, and
// Book. Cash only; surge is shown if the backend ever sends it, with no surge UI.

const TIER_ICONS: Record<ServiceType, typeof Car> = { RIDE: Car, RIDE_XL: Van, RIDE_PREMIUM: CarFront };
const MAP_HEIGHT = 230;

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function TierCard({ quote, selected, onSelect }: { quote: FareQuote; selected: boolean; onSelect: () => void }) {
  const tier = TIERS[quote.service_type];
  const Icon = TIER_ICONS[quote.service_type];
  const surge = quote.surge_multiplier > 1;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-testid={`tier-${quote.service_type}`}
      onClick={onSelect}
      className={`flex w-full items-center gap-4 rounded-card px-4 py-4 text-left ${selected ? 'border-2 border-primary-500 bg-primary-50' : 'border border-r-line bg-white'}`}
    >
      <Icon size={30} strokeWidth={1.6} className="shrink-0 text-r-ink" />
      <span className="min-w-0 flex-1">
        <span className="block text-[18px] font-extrabold text-r-ink">{tier.name}</span>
        <span className="mt-0.5 block text-[14px] text-r-ink-2">{tier.detail}</span>
        {tier.tag && (
          <span
            className={`mt-1.5 inline-block rounded-[8px] px-2 py-0.5 text-[12px] font-bold ${selected ? 'bg-white text-r-ink' : 'bg-primary-50 text-primary-700'}`}
          >
            {tier.tag}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[18px] font-extrabold text-r-ink">{formatMoney(quote.total_fare, quote.currency_code)}</span>
        {surge ? (
          <span className="block text-[12px] font-bold text-warning-600">×{quote.surge_multiplier.toFixed(1)} busy</span>
        ) : (
          selected && <span className="block text-[12px] text-r-ink-2">fixed</span>
        )}
      </span>
    </button>
  );
}

function Breakdown({ quote }: { quote: FareQuote }) {
  const rows: [string, number][] = [
    ['Base fare', quote.base_fare],
    [`Distance${quote.route_distance_km ? ` · ${quote.route_distance_km.toFixed(1)} km` : ''}`, quote.distance_fare],
    [`Time${quote.route_duration_minutes ? ` · ${Math.round(quote.route_duration_minutes)} min` : ''}`, quote.time_fare],
  ];
  if (quote.surcharge_total) rows.push(['Surcharges', quote.surcharge_total]);
  if (quote.discount_total) rows.push(['Discounts', -quote.discount_total]);
  return (
    <div className="mt-2 rounded-card bg-r-bg px-4 py-3 text-[14px]">
      {rows.map(([label, amount]) => (
        <div key={label} className="flex justify-between py-0.5 text-r-ink-2">
          <span>{label}</span>
          <span>{formatMoney(amount, quote.currency_code)}</span>
        </div>
      ))}
      {quote.surge_multiplier !== 1 && (
        <div className="flex justify-between py-0.5 text-warning-700">
          <span>Demand multiplier</span>
          <span>×{quote.surge_multiplier}</span>
        </div>
      )}
      <div className="mt-1 flex justify-between border-t border-r-line pt-1.5 font-bold text-r-ink">
        <span>Total{quote.total_fare > quote.base_fare + quote.distance_fare + quote.time_fare ? ' (minimum fare)' : ''}</span>
        <span>{formatMoney(quote.total_fare, quote.currency_code)}</span>
      </div>
    </div>
  );
}

export function PickRideScreen() {
  const navigate = useNavigate();
  const { pickup, dropoff } = useBookingDraft();
  const estimate = useFareEstimateQuery(pickup, dropoff);
  const book = useRequestCabMutation();
  const [selected, setSelected] = useState<ServiceType>('RIDE');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const now = useNow(1_000);

  if (!pickup || !dropoff) return <Navigate to="/user" replace />;

  const quotes = sortQuotes(estimate.data?.quotes ?? []);
  const quote = quotes.find((q) => q.service_type === selected) ?? quotes[0];
  const secondsLeft = quote ? quoteSecondsLeft(quote, now) : 0;
  const expired = !!quote && secondsLeft === 0;
  const polyline = quotes.find((q) => q.route_polyline)?.route_polyline;

  const bookError = book.error instanceof ApiError ? book.error : null;
  const staleQuote = bookError?.code === 'fare_expired' || bookError?.code === 'fare_already_used';

  const refresh = () => {
    book.reset();
    void estimate.refetch();
  };

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-white">
      <div className="relative shrink-0" style={{ height: MAP_HEIGHT + 24 }}>
        <RiderMap defaultCenter={pickup} defaultZoom={13}>
          <PlaceDot position={pickup} kind="pickup" />
          <PlaceDot position={dropoff} kind="dropoff" />
          {polyline ? (
            <Polyline encodedPath={polyline} strokeColor={PIN_COLORS.route} strokeWeight={5} strokeOpacity={0.95} />
          ) : (
            <Polyline path={[pickup, dropoff]} strokeColor={PIN_COLORS.route} strokeWeight={4} strokeOpacity={0.6} geodesic />
          )}
          <FitBounds points={[pickup, dropoff]} padding={{ top: 70, bottom: 50, left: 70, right: 170 }} />
        </RiderMap>

        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate('/user/pickup')}
          className="absolute top-4 left-4 flex h-11 w-11 items-center justify-center rounded-pill bg-white text-r-ink shadow-float"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="absolute top-4 right-4 flex max-w-[190px] flex-col items-end gap-2">
          {[
            { place: pickup, color: PIN_COLORS.pickup, fallback: 'Pickup' },
            { place: dropoff, color: PIN_COLORS.dropoff, fallback: 'Drop-off' },
          ].map(({ place, color, fallback }) => (
            <span key={fallback} className="flex max-w-full items-center gap-2 rounded-pill bg-white px-3 py-2 shadow-float">
              <span className="h-2.5 w-2.5 shrink-0 rounded-pill" style={{ background: color }} />
              <span className="truncate text-[14px] font-bold text-r-ink">{place.label ?? fallback}</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5 rounded-pill bg-white px-3 py-2 text-[14px] font-bold text-primary-700 shadow-float">
            <User size={14} /> For me
          </span>
        </div>
      </div>

      <div className="-mt-6 flex min-h-0 flex-1 flex-col rounded-t-sheet bg-white shadow-sheet">
        <div className="mx-auto mt-3 mb-2 h-1 w-11 shrink-0 rounded-pill bg-neutral-200" />

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
          {estimate.isLoading && (
            <div className="flex flex-col gap-3" aria-busy>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[92px] animate-pulse rounded-card bg-r-bg" />
              ))}
            </div>
          )}

          {estimate.isError && (
            <div className="rounded-card bg-danger-50 px-4 py-4 text-danger-700">
              <p className="text-[15px] font-bold">Couldn’t get prices</p>
              <p className="mt-1 text-[13px]">{estimate.error.message}</p>
              <div className="mt-3">
                <Button label="Try again" variant="destructive-outline" size="compact" fullWidth={false} onClick={refresh} />
              </div>
            </div>
          )}

          {quotes.length > 0 && (
            <div role="radiogroup" aria-label="Ride options" className="flex flex-col gap-3">
              {quotes.map((q) => (
                <TierCard key={q.fare_id} quote={q} selected={q.fare_id === quote?.fare_id} onSelect={() => setSelected(q.service_type)} />
              ))}
            </div>
          )}

          {quote && (
            <>
              <button
                type="button"
                onClick={() => setShowBreakdown((v) => !v)}
                className="mt-3 flex w-full items-center justify-between px-1 text-[14px] font-bold text-r-ink-2"
              >
                <span>
                  {expired ? (
                    <span className="text-danger-600">Prices expired</span>
                  ) : (
                    <>
                      Price held for <span data-testid="quote-countdown" className="tabular-nums">{formatCountdown(secondsLeft)}</span>
                    </>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  Fare breakdown {showBreakdown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
              </button>
              {showBreakdown && <Breakdown quote={quote} />}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-r-line px-4 pt-3 pb-4">
          <div className="flex items-center justify-between pb-3">
            <span className="flex items-center gap-2 text-[15px] font-bold text-r-ink">
              <Banknote size={20} /> Cash · pay on arrival
            </span>
            <span className="text-[14px] font-bold text-r-ink-3" title="Cash is the only payment method">
              Cash only
            </span>
          </div>

          {bookError && (
            <p className="pb-2 text-[13px] font-semibold text-danger-600">
              {staleQuote ? 'That price is no longer available — refresh to get a new one.' : bookError.message}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              disabled
              title="Scheduled rides aren’t supported yet"
              aria-label="Schedule"
              className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-pill bg-primary-50 text-primary-700 opacity-80"
            >
              <CalendarDays size={20} />
            </button>
            {expired || staleQuote ? (
              <Button
                label="Refresh prices"
                shape="pill"
                size="large"
                loading={estimate.isFetching}
                onClick={refresh}
                className="gap-2"
              />
            ) : (
              <Button
                label={quote ? `Book ${TIERS[quote.service_type].name} · ${formatMoneyTight(quote.total_fare, quote.currency_code)}` : 'Book'}
                shape="pill"
                size="large"
                disabled={!quote}
                loading={book.isPending}
                onClick={() => quote && book.mutate({ quote, pickup, dropoff })}
              />
            )}
          </div>
          {(expired || staleQuote) && (
            <p className="mt-2 flex items-center justify-center gap-1 text-[12px] text-r-ink-3">
              <RefreshCw size={12} /> Quotes are held for 15 minutes
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
