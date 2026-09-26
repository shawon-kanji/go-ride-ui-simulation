import { Polyline } from '@vis.gl/react-google-maps';
import { CircleCheck, MessageSquare, Phone, Shield, Star, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';

import { distanceKm, formatMoney } from '../../../shared/lib/format';
import { Button } from '../../../shared/ui/Button';
import { useBookingDraft } from '../booking/booking-draft';
import { CancelTripSheet } from '../components/CancelTripSheet';
import { PIN_COLORS } from '../components/map-colors';
import { CarMarker, FitBounds, PlaceDot, RiderMap } from '../components/map-pieces';
import type { RiderTrip } from '../trip/trip-model';
import { dispatchTrip, useTripStore } from '../trip/trip-store';

// R05 Driver on the way, from ride_assigned (driver, vehicle, plate, start PIN) and the
// driver_location stream (position, distance and ETA to the pickup). Trip phases after
// pickup get a plain status card until R06 and the rating screen arrive in Phase 4.

const FALLBACK_SPEED_KMH = 25;
const SHEET_HEIGHT = 440;

function useSecondsSince(at: number | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  return at === undefined ? null : Math.max(0, Math.round((now - at) / 1000));
}

/** Minutes to pickup: the gateway's ETA when we have one, else straight-line at city speed. */
function etaMinutes(trip: RiderTrip): number | null {
  const fix = trip.driverFix;
  if (!fix) return null;
  if (fix.etaMinutes !== undefined) return fix.etaMinutes;
  return (distanceKm(fix, trip.pickup) / FALLBACK_SPEED_KMH) * 60;
}

function Headline({ trip }: { trip: RiderTrip }) {
  const eta = etaMinutes(trip);
  const metres = trip.driverFix ? distanceKm(trip.driverFix, trip.pickup) * 1000 : null;
  const text =
    eta === null ? 'Driver assigned' : metres !== null && metres < 60 ? 'Arriving now' : `${Math.max(1, Math.round(eta))} min away`;
  return (
    <div className="flex items-baseline gap-2">
      <h1 data-testid="trip-eta" className="text-[30px] font-extrabold tracking-[-0.03em] text-r-ink">
        {text}
      </h1>
      {trip.pickup.label && <span className="truncate text-[15px] text-r-ink-2">{trip.pickup.label}</span>}
    </div>
  );
}

function DriverCard({ trip }: { trip: RiderTrip }) {
  const driver = trip.driver;
  const name = driver?.name ?? 'Your driver';
  const initials = name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const vehicle = [driver?.vehicleModel, driver?.vehicleColor?.toLowerCase()].filter(Boolean).join(', ');

  return (
    <div data-testid="driver-card" className="mt-3 flex items-center gap-3 rounded-card border border-r-line px-4 py-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pill bg-primary-50 text-[16px] font-extrabold text-primary-700">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-extrabold text-r-ink">{name}</p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-r-ink-2">
          <Star size={12} fill="currentColor" className="shrink-0" />
          {vehicle || 'Vehicle details after reconnect'}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-r-ink-3">Plate</p>
        <p data-testid="vehicle-plate" className="text-[19px] font-extrabold text-r-ink">
          {driver?.vehiclePlate ?? '—'}
        </p>
      </div>
    </div>
  );
}

function StartPin({ pin }: { pin: string | undefined }) {
  return (
    <div className="mt-3 flex items-center gap-3 rounded-card bg-primary-50 px-4 py-3">
      <div className="flex-1">
        <p className="text-[15px] font-bold text-primary-700">Start PIN</p>
        <p className="text-[12px] text-primary-700/80">Read it out before you get in</p>
      </div>
      <div data-testid="start-pin" className="flex gap-1.5" aria-label={pin ? `Start PIN ${pin.split('').join(' ')}` : 'Start PIN unavailable'}>
        {(pin ?? '····').split('').map((digit, i) => (
          <span
            key={i}
            className="flex h-11 w-9 items-center justify-center rounded-[10px] bg-white text-[22px] font-extrabold text-r-ink"
          >
            {digit}
          </span>
        ))}
      </div>
    </div>
  );
}

function ContactButtons() {
  const buttons = [
    { label: 'Call', Icon: Phone },
    { label: 'Message', Icon: MessageSquare },
    { label: 'Share', Icon: Shield },
  ];
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {buttons.map(({ label, Icon }) => (
        <button
          key={label}
          type="button"
          disabled
          title="Not available in the web simulator"
          className="flex items-center justify-center gap-2 rounded-card bg-primary-50 py-3 text-[15px] font-bold text-primary-700 opacity-80"
        >
          <Icon size={16} /> {label}
        </button>
      ))}
    </div>
  );
}

function DriverOnTheWay({ trip }: { trip: RiderTrip }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const ago = useSecondsSince(trip.driverFix?.at);
  const fare = trip.fareTotal !== undefined ? `${formatMoney(trip.fareTotal, trip.currency)} · cash on arrival` : 'Cash on arrival';
  const mapPoints = trip.driverFix ? [trip.driverFix, trip.pickup] : [trip.pickup];

  return (
    <div className="relative flex-1 overflow-hidden bg-r-map-land">
      <div className="absolute inset-x-0 top-0" style={{ bottom: SHEET_HEIGHT - 24 }}>
        <RiderMap defaultCenter={trip.pickup} defaultZoom={15}>
          <PlaceDot position={trip.pickup} kind="dropoff" />
          {trip.driverFix && (
            <>
              <Polyline path={[trip.driverFix, trip.pickup]} strokeColor={PIN_COLORS.route} strokeWeight={5} strokeOpacity={0.9} />
              <CarMarker position={trip.driverFix} />
            </>
          )}
          <FitBounds points={mapPoints} padding={{ top: 90, bottom: 60, left: 60, right: 60 }} singleZoom={15} />
        </RiderMap>
      </div>

      <div className="absolute top-4 left-4 flex items-center gap-2 rounded-pill bg-white px-4 py-2.5 text-[14px] font-bold text-r-ink shadow-float">
        {ago === null ? (
          <>
            <span className="h-2.5 w-2.5 rounded-pill bg-neutral-300" /> Waiting for the driver’s location
          </>
        ) : (
          <>
            <span className="h-2.5 w-2.5 rounded-pill bg-primary-500" /> Live · updated {ago}s ago
          </>
        )}
      </div>

      <div
        className="absolute inset-x-0 bottom-0 overflow-y-auto rounded-t-sheet bg-white px-4 pt-3 pb-5 shadow-sheet"
        style={{ maxHeight: SHEET_HEIGHT }}
      >
        <div className="mx-auto mb-3 h-1 w-11 rounded-pill bg-neutral-200" />
        <Headline trip={trip} />
        <DriverCard trip={trip} />
        <ContactButtons />
        <StartPin pin={trip.startPin} />
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[15px] font-bold text-r-ink">{fare}</span>
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            className="rounded-pill border border-r-line px-6 py-3 text-[15px] font-bold text-r-ink"
          >
            Cancel
          </button>
        </div>
      </div>

      <CancelTripSheet
        open={cancelOpen}
        requestId={trip.requestId}
        stage="assigned"
        onDismiss={() => setCancelOpen(false)}
      />
    </div>
  );
}

/** Phase 4 replaces this with R06 (on trip), payment and rating. */
function TripStatus({ trip }: { trip: RiderTrip }) {
  const navigate = useNavigate();
  const resetDraft = useBookingDraft((s) => s.reset);
  const settled = trip.phase === 'completed' || trip.phase === 'cancelled' || trip.phase === 'timed_out';
  const byDriver = trip.phase === 'cancelled' && trip.cancelledBy === 'driver';
  const fare = trip.finalFare ?? trip.fareTotal;

  const titles: Record<RiderTrip['phase'], string> = {
    searching: '',
    assigned: '',
    in_progress: `On the way to ${trip.dropoff.label ?? 'your drop-off'}`,
    awaiting_payment: 'You’ve arrived — pay your driver',
    completed: 'Trip complete',
    cancelled: byDriver ? 'Your driver cancelled' : 'Trip cancelled',
    timed_out: 'No driver found',
  };

  const done = () => {
    dispatchTrip({ type: 'clear' });
    resetDraft();
    navigate('/user', { replace: true });
  };

  return (
    <div className="flex flex-1 flex-col justify-end bg-r-bg px-4 pb-5">
      <div className="rounded-sheet bg-white px-5 py-6 shadow-sheet">
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-pill ${trip.phase === 'cancelled' ? 'bg-danger-50 text-danger-600' : 'bg-primary-50 text-primary-600'}`}
        >
          {trip.phase === 'cancelled' ? <XCircle size={24} /> : <CircleCheck size={24} />}
        </span>
        <h1 data-testid="trip-status" className="mt-3 text-[26px] font-extrabold tracking-[-0.02em] text-r-ink">
          {titles[trip.phase]}
        </h1>
        {fare !== undefined && (
          <p className="mt-1 text-[15px] text-r-ink-2">
            {trip.phase === 'completed' ? 'Paid' : 'Fare'} {formatMoney(fare, trip.currency)} · cash
          </p>
        )}
        {trip.driver?.name && (
          <p className="mt-1 text-[14px] text-r-ink-3">
            {trip.driver.name}
            {trip.driver.vehiclePlate ? ` · ${trip.driver.vehiclePlate}` : ''}
          </p>
        )}
        {settled && (
          <div className="mt-5">
            <Button label="Done" shape="pill" size="large" onClick={done} />
          </div>
        )}
      </div>
    </div>
  );
}

export function TripScreen() {
  const trip = useTripStore((s) => s.trip);
  if (!trip) return <Navigate to="/user" replace />;
  if (trip.phase === 'searching') return <Navigate to="/user/finding" replace />;
  return trip.phase === 'assigned' ? <DriverOnTheWay trip={trip} /> : <TripStatus trip={trip} />;
}
