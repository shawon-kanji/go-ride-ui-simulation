import { Check, Clock, SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';

import { formatMoney } from '../../../shared/lib/format';
import { Button } from '../../../shared/ui/Button';
import type { SearchStatus } from '../api/types';
import { useBookingDraft } from '../booking/booking-draft';
import { CancelTripSheet } from '../components/CancelTripSheet';
import { RiderMap, SearchPulse } from '../components/map-pieces';
import type { RiderTrip } from '../trip/trip-model';
import { dispatchTrip, useTripStore } from '../trip/trip-store';

// R04 Finding a driver. The rider isn't told which drivers are being offered the trip,
// so the steps follow trip_requests.status (polled from GET /cab/current-trip by the
// runtime): request sent → looking → offered to drivers → a driver accepted.

const STEPS: { status: SearchStatus[]; label: string; active: string }[] = [
  { status: ['search_started'], label: 'Request sent', active: 'sending' },
  { status: ['searching', 'driver_rejected'], label: 'Looking for drivers nearby', active: 'looking' },
  { status: ['offered'], label: 'Offered to nearby drivers', active: 'reviewing' },
  { status: ['driver_accepted'], label: 'A driver accepted', active: 'confirming' },
];

const HEADLINES: Record<SearchStatus, string> = {
  search_started: 'Finding drivers near you',
  searching: 'Looking a little further out',
  driver_rejected: 'Looking a little further out',
  offered: 'Offering your trip to nearby drivers',
  driver_accepted: 'A driver accepted — confirming',
};

function stepIndex(status: SearchStatus | undefined): number {
  const i = STEPS.findIndex((s) => status && s.status.includes(status));
  return i === -1 ? 0 : i;
}

function useElapsed(since: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function ElapsedChip({ since }: { since: number }) {
  const elapsed = useElapsed(since);
  return (
    <div className="absolute top-4 left-4 flex items-center gap-2 rounded-pill bg-white px-4 py-2.5 text-[15px] font-bold text-r-ink shadow-float">
      <Clock size={16} className="text-primary-700" /> Elapsed <span data-testid="elapsed" className="tabular-nums">{elapsed}</span>
    </div>
  );
}

function Searching({ trip }: { trip: RiderTrip }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const current = stepIndex(trip.searchStatus);
  const fare = trip.fareTotal !== undefined ? formatMoney(trip.fareTotal, trip.currency) : null;

  return (
    <>
      <h1 data-testid="finding-headline" className="text-[26px] leading-tight font-extrabold tracking-[-0.02em] text-r-ink">
        {HEADLINES[trip.searchStatus ?? 'search_started']}
      </h1>
      <p className="mt-2 text-[15px] leading-snug text-r-ink-2">
        {fare ? `Your fare stays at ${fare} whatever happens next. ` : ''}Cancel free until someone accepts.
      </p>

      <div className="mt-4 flex gap-1.5" aria-hidden>
        {STEPS.map((step, i) => (
          <div
            key={step.label}
            className={`h-1.5 flex-1 rounded-pill ${i < current ? 'bg-primary-500' : i === current ? 'animate-pulse bg-primary-500/60' : 'bg-r-line'}`}
          />
        ))}
      </div>

      <ol className="mt-4 flex flex-col gap-1">
        {STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={step.label}
              className={`flex items-center gap-3 rounded-card px-3 py-2.5 ${active ? 'bg-primary-50' : ''} ${i > current ? 'opacity-45' : ''}`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-pill ${done ? 'bg-primary-500 text-white' : active ? 'border-2 border-primary-500' : 'border-2 border-neutral-300'}`}
              >
                {done && <Check size={14} strokeWidth={3} />}
              </span>
              <span className="flex-1 text-[16px] font-bold text-r-ink">{step.label}</span>
              {active && <span className="text-[14px] font-bold text-primary-700">{step.active}</span>}
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        onClick={() => setCancelOpen(true)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-pill border border-r-line py-4 text-[16px] font-bold text-r-ink"
      >
        Cancel request <span className="text-[14px] font-semibold text-r-ink-3">no fee</span>
      </button>

      <CancelTripSheet
        open={cancelOpen}
        requestId={trip.requestId}
        stage="searching"
        onDismiss={() => setCancelOpen(false)}
      />
    </>
  );
}

function Ended({ trip }: { trip: RiderTrip }) {
  const navigate = useNavigate();
  const { setPickup, setDropoff } = useBookingDraft();
  const timedOut = trip.phase === 'timed_out';

  const done = () => {
    dispatchTrip({ type: 'clear' });
    navigate('/user', { replace: true });
  };

  const tryAgain = () => {
    setPickup(trip.pickup);
    setDropoff(trip.dropoff);
    dispatchTrip({ type: 'clear' });
    navigate('/user/ride', { replace: true });
  };

  return (
    <>
      <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-warning-50 text-warning-600">
        <SearchX size={24} />
      </span>
      <h1 className="mt-3 text-[26px] leading-tight font-extrabold tracking-[-0.02em] text-r-ink">
        {timedOut ? 'No drivers available right now' : 'This request was cancelled'}
      </h1>
      <p className="mt-2 text-[15px] text-r-ink-2">
        {timedOut
          ? 'Nobody nearby took the trip. You weren’t charged. Try again in a moment.'
          : 'It was cancelled before a driver was assigned. You weren’t charged.'}
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <Button label="Try again" shape="pill" size="large" onClick={tryAgain} />
        <Button label="Done" variant="ghost" shape="pill" size="large" onClick={done} />
      </div>
    </>
  );
}

export function FindingDriverScreen() {
  const trip = useTripStore((s) => s.trip);

  // Assigned onwards is R05's (the runtime moves the tab); no trip at all means home.
  if (!trip || (trip.phase !== 'searching' && trip.phase !== 'timed_out' && trip.phase !== 'cancelled')) {
    return <Navigate to="/user" replace />;
  }

  return (
    <div className="relative flex-1 overflow-hidden bg-r-map-land">
      <div className="absolute inset-x-0 top-0 bottom-[380px]">
        <RiderMap defaultCenter={trip.pickup} defaultZoom={15}>
          <SearchPulse position={trip.pickup} />
        </RiderMap>
      </div>

      {trip.phase === 'searching' && <ElapsedChip since={trip.requestedAt} />}

      <div className="absolute inset-x-0 bottom-0 rounded-t-sheet bg-white px-4 pt-3 pb-5 shadow-sheet">
        <div className="mx-auto mb-4 h-1 w-11 rounded-pill bg-neutral-200" />
        {trip.phase === 'searching' ? <Searching trip={trip} /> : <Ended trip={trip} />}
      </div>
    </div>
  );
}
