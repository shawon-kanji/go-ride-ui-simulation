import { Polyline } from '@vis.gl/react-google-maps';
import { Check, CircleCheck, Navigation, Phone, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';

import { distanceKm, formatMoney } from '../../../shared/lib/format';
import { useLocationStore } from '../../../shared/location/location-store';
import { PIN_COLORS } from '../../../shared/map/map-colors';
import { AppMap, CarMarker, FitBounds, PlaceDot } from '../../../shared/map/map-pieces';
import { usePlaceLabel } from '../../../shared/places/places';
import { Button } from '../../../shared/ui/Button';
import { CancelTripSheet } from '../trip/CancelTripSheet';
import type { DriverTrip } from '../trip/trip-model';
import { dispatchDriverTrip, useDriverTripStore } from '../trip/trip-store';
import {
  tripActionError,
  useCollectPaymentMutation,
  useEndTripMutation,
  useStartTripMutation,
} from '../trip/use-trip-actions';

// D09 Trip & cash collection. The design draws the on-trip state; heading to the
// pickup (with start-PIN entry) and the ends of a trip are this app's additions. The
// server only allows start (PIN) → end → collect-payment, so "Cash collected" unlocks
// once the trip has ended.

const CITY_SPEED_KMH = 25;
const SHEET_HEIGHT = 400;

const clock = (ms: number | undefined) =>
  ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

function initials(name: string | undefined): string {
  if (!name) return 'R';
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function RiderRow({ trip }: { trip: DriverTrip }) {
  const target = trip.phase === 'to_pickup' ? trip.pickup : trip.dropoff;
  const { data: place } = usePlaceLabel('driver', target.lat, target.lng);
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pill bg-primary-50 text-[16px] font-extrabold text-primary-700">
        {initials(trip.riderName)}
      </span>
      <div className="min-w-0 flex-1">
        <p data-testid="trip-rider" className="truncate text-[18px] font-extrabold text-neutral-900">
          {trip.riderName ?? 'Your rider'}
        </p>
        <p className="truncate text-[14px] text-neutral-500">
          {trip.phase === 'to_pickup' ? 'Pickup · ' : 'Drop-off · '}
          {place ?? `${target.lat.toFixed(4)}, ${target.lng.toFixed(4)}`}
        </p>
      </div>
      <button
        type="button"
        disabled
        aria-label="Call rider"
        title="Not available in the web simulator"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-neutral-100 text-neutral-700"
      >
        <Phone size={18} />
      </button>
    </div>
  );
}

function PinEntry({ trip }: { trip: DriverTrip }) {
  const [pin, setPin] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const start = useStartTripMutation();
  const error = tripActionError(start.error);

  return (
    <div className="mt-4 rounded-card bg-primary-50 px-4 py-4">
      <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-primary-700">At the pickup?</p>
      <p className="mt-1 text-[14px] text-neutral-700">Ask the rider for their 4-digit start PIN.</p>
      <label className="relative mt-3 flex cursor-text gap-2" onClick={() => input.current?.focus()}>
        <input
          ref={input}
          data-testid="start-pin-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="Start PIN"
          maxLength={4}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
            start.reset();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && pin.length === 4) start.mutate({ ongoingTripId: trip.ongoingTripId, pin });
          }}
          className="absolute inset-0 opacity-0"
        />
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`flex h-14 flex-1 items-center justify-center rounded-control bg-white text-[26px] font-extrabold text-neutral-900 ${error ? 'ring-2 ring-danger-500' : i === pin.length ? 'ring-2 ring-primary-500' : 'ring-1 ring-neutral-200'}`}
          >
            {pin[i] ?? ''}
          </span>
        ))}
      </label>
      {error && <p className="mt-2 text-[13px] font-semibold text-danger-600">{error}</p>}
      <div className="mt-3">
        <Button
          label="Start trip"
          shape="pill"
          size="large"
          disabled={pin.length !== 4}
          loading={start.isPending}
          onClick={() => start.mutate({ ongoingTripId: trip.ongoingTripId, pin })}
        />
      </div>
    </div>
  );
}

function Collection({ trip }: { trip: DriverTrip }) {
  const end = useEndTripMutation();
  const collect = useCollectPaymentMutation();
  const ended = trip.phase === 'collecting';
  const fare = trip.finalFare ?? trip.fareTotal;
  const error = tripActionError(end.error ?? collect.error);

  return (
    <div className="mt-4 rounded-card bg-success-50 px-4 py-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-success-700">
          {ended ? 'Collect now' : 'Collect on arrival'}
        </p>
        <p data-testid="collect-fare" className="text-[26px] font-extrabold tracking-[-0.02em] text-success-700">
          {fare !== undefined ? formatMoney(fare, trip.currency) : '—'}
        </p>
      </div>
      <p className="mt-1 text-[13px] text-success-700/90">
        {ended
          ? 'Trip ended. Take the cash, then mark it collected to complete the trip.'
          : 'Cash, exactly as quoted at booking. End the trip at the drop-off, then mark the cash collected.'}
      </p>
      {error && <p className="mt-2 text-[13px] font-semibold text-danger-600">{error}</p>}
      <div className="mt-3 flex gap-3">
        <div className="flex-[1.6]">
          <Button
            label="Cash collected"
            variant={ended ? 'success' : 'muted'}
            size="large"
            disabled={!ended}
            loading={collect.isPending}
            onClick={() => collect.mutate(trip.ongoingTripId)}
            className="gap-2"
          />
        </div>
        <div className="flex-1">
          <button
            type="button"
            disabled={ended || end.isPending}
            onClick={() => end.mutate(trip.ongoingTripId)}
            className="flex h-full min-h-[54px] w-full items-center justify-center gap-1.5 rounded-control border border-success-600 bg-white text-[16px] font-bold text-success-700 disabled:opacity-60"
          >
            {ended ? (
              <>
                <Check size={16} /> Ended
              </>
            ) : end.isPending ? (
              'Ending…'
            ) : (
              'End trip'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActiveTrip({ trip }: { trip: DriverTrip }) {
  const position = useLocationStore((s) => s.position);
  const [cancelOpen, setCancelOpen] = useState(false);
  const toPickup = trip.phase === 'to_pickup';
  const target = toPickup ? trip.pickup : trip.dropoff;
  const km = position ? distanceKm(position, target) : null;
  const minutes = km !== null ? Math.max(1, Math.round((km / CITY_SPEED_KMH) * 60)) : null;
  const pill = toPickup
    ? `To pickup${minutes ? ` · ${minutes} min` : ''}`
    : trip.phase === 'collecting'
      ? 'Arrived · collect cash'
      : `On trip${minutes ? ` · ${minutes} min left` : ''}`;

  return (
    <div className="relative flex-1 overflow-hidden bg-neutral-100">
      <div className="absolute inset-x-0 top-0" style={{ bottom: SHEET_HEIGHT - 24 }}>
        <AppMap defaultCenter={position ?? target} defaultZoom={15}>
          <PlaceDot position={target} kind={toPickup ? 'pickup' : 'dropoff'} />
          {!toPickup && <PlaceDot position={trip.pickup} kind="pickup" />}
          {position && (
            <>
              <Polyline path={[position, target]} strokeColor={PIN_COLORS.driverRoute} strokeWeight={5} strokeOpacity={0.9} />
              <CarMarker position={position} color={PIN_COLORS.driverRoute} />
            </>
          )}
          <FitBounds points={position ? [position, target] : [target]} padding={{ top: 90, bottom: 50, left: 60, right: 60 }} singleZoom={15} />
        </AppMap>
      </div>

      <div className="absolute inset-x-4 top-4 flex items-center justify-between">
        <span className="flex items-center gap-2 rounded-pill bg-white px-4 py-2.5 text-[14px] font-bold text-neutral-900 shadow-float">
          <span className="h-2.5 w-2.5 rounded-pill bg-success-500" />
          <span data-testid="trip-pill">{pill}</span>
        </span>
        <button
          type="button"
          disabled
          title="Route playback arrives with the simulator's power features (Phase 5)"
          className="flex items-center gap-2 rounded-pill bg-white px-4 py-2.5 text-[14px] font-bold text-neutral-900 shadow-float"
        >
          <Navigation size={16} /> Navigate
        </button>
      </div>

      <div
        className="absolute inset-x-0 bottom-0 overflow-y-auto rounded-t-[24px] bg-white px-5 pt-3 pb-5 shadow-sheet"
        style={{ maxHeight: SHEET_HEIGHT + 60 }}
      >
        <div className="mx-auto mb-4 h-1 w-11 rounded-pill bg-neutral-200" />
        <RiderRow trip={trip} />
        {toPickup ? <PinEntry trip={trip} /> : <Collection trip={trip} />}

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[13px] text-neutral-500">
            {toPickup ? `Accepted ${clock(trip.assignedAt)}` : `Started ${clock(trip.startedAt)}`} · fare locked, no surge added
          </p>
          {trip.phase !== 'collecting' && (
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="shrink-0 rounded-pill border border-neutral-300 px-5 py-2.5 text-[15px] font-bold text-neutral-900"
            >
              Cancel trip
            </button>
          )}
        </div>
      </div>

      <CancelTripSheet
        open={cancelOpen}
        ongoingTripId={trip.ongoingTripId}
        beforePickup={toPickup}
        onDismiss={() => setCancelOpen(false)}
      />
    </div>
  );
}

/** Completed or cancelled: say what happened, then back to D06 (still online). */
function TripEnded({ trip }: { trip: DriverTrip }) {
  const navigate = useNavigate();
  const completed = trip.phase === 'completed';
  const byRider = trip.cancelledBy === 'rider';
  const fare = trip.finalFare ?? trip.fareTotal;

  const title = completed ? 'Trip complete' : byRider ? 'The rider cancelled' : 'Trip cancelled';
  const detail = completed
    ? `${fare !== undefined ? formatMoney(fare, trip.currency) : 'Cash'} collected${trip.riderName ? ` from ${trip.riderName}` : ''}.`
    : byRider
      ? 'You weren’t charged anything and you’re still online for new offers.'
      : trip.redispatched
        ? 'The request went back into dispatch for another driver.'
        : 'The trip ended here.';

  return (
    <div className="flex flex-1 flex-col justify-end bg-neutral-50 px-5 pb-6">
      <div className="rounded-[24px] bg-white px-5 py-6 shadow-sheet">
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-pill ${completed ? 'bg-success-50 text-success-600' : 'bg-danger-50 text-danger-600'}`}
        >
          {completed ? <CircleCheck size={24} /> : <XCircle size={24} />}
        </span>
        <h1 data-testid="trip-ended" className="mt-3 text-[26px] font-extrabold tracking-[-0.02em] text-neutral-900">
          {title}
        </h1>
        <p className="mt-1 text-[15px] text-neutral-600">{detail}</p>
        <div className="mt-5">
          <Button
            label="Back to map"
            shape="pill"
            size="large"
            onClick={() => {
              dispatchDriverTrip({ type: 'clear' });
              navigate('/driver', { replace: true });
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function TripScreen() {
  const trip = useDriverTripStore((s) => s.trip);
  if (!trip) return <Navigate to="/driver" replace />;
  return trip.phase === 'completed' || trip.phase === 'cancelled' ? <TripEnded trip={trip} /> : <ActiveTrip trip={trip} />;
}
