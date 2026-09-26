import { Banknote, CircleCheck, LoaderCircle, Star, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { ApiError } from '../../../shared/api/http-client';
import { formatMoney } from '../../../shared/lib/format';
import { Button } from '../../../shared/ui/Button';
import { useRateTripMutation } from '../api/queries';
import { useBookingDraft } from '../booking/booking-draft';
import type { RiderTrip } from '../trip/trip-model';
import { dispatchTrip } from '../trip/trip-store';

// After the drop-off: pay your driver (awaiting_payment), trip complete + rating, and a
// trip that ended some other way. None of these is in the handoff (R06 is the last
// designed trip screen); they follow its sheet-over-grey style.

function Sheet({ icon, tone, children }: { icon: ReactNode; tone: 'brand' | 'danger'; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col justify-end bg-r-bg px-4 pb-5">
      <div className="rounded-sheet bg-white px-5 py-6 shadow-sheet">
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-pill ${tone === 'danger' ? 'bg-danger-50 text-danger-600' : 'bg-primary-50 text-primary-600'}`}
        >
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}

function useFinish() {
  const navigate = useNavigate();
  const resetDraft = useBookingDraft((s) => s.reset);
  return () => {
    dispatchTrip({ type: 'clear' });
    resetDraft();
    navigate('/user', { replace: true });
  };
}

const firstName = (trip: RiderTrip) => trip.driver?.name?.split(' ')[0] ?? 'your driver';

/** awaiting_payment: the driver ended the trip and is about to take the cash. */
export function PayDriverScreen({ trip }: { trip: RiderTrip }) {
  const fare = trip.finalFare ?? trip.fareTotal;
  return (
    <Sheet icon={<Banknote size={24} />} tone="brand">
      <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.1em] text-r-ink-3">You’ve arrived</p>
      <h1 data-testid="pay-driver" className="mt-1 text-[26px] leading-tight font-extrabold tracking-[-0.02em] text-r-ink">
        Pay {firstName(trip)} in cash
      </h1>
      <p className="mt-2 text-[40px] leading-tight font-extrabold tracking-[-0.03em] text-r-ink">
        {fare !== undefined ? formatMoney(fare, trip.currency) : '—'}
      </p>
      <p className="mt-1 text-[14px] text-r-ink-2">Exactly as quoted when you booked — no surge added.</p>
      <p className="mt-5 flex items-center gap-2 rounded-card bg-r-bg px-4 py-3 text-[14px] font-semibold text-r-ink-2">
        <LoaderCircle size={16} className="animate-spin" /> Waiting for {firstName(trip)} to confirm the cash
      </p>
    </Sheet>
  );
}

/** completed: fare paid, then rate the driver (optional). */
export function TripCompleteScreen({ trip }: { trip: RiderTrip }) {
  const finish = useFinish();
  const rate = useRateTripMutation();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const fare = trip.finalFare ?? trip.fareTotal;
  const alreadyRated = rate.error instanceof ApiError && rate.error.code === 'trip_already_rated';

  const submit = () => {
    if (!trip.ongoingTripId || rating === 0) return;
    rate.mutate({ ongoingTripId: trip.ongoingTripId, rating, comment: comment.trim() || undefined }, { onSuccess: finish });
  };

  return (
    <Sheet icon={<CircleCheck size={24} />} tone="brand">
      <h1 data-testid="trip-complete" className="mt-3 text-[26px] font-extrabold tracking-[-0.02em] text-r-ink">
        Trip complete
      </h1>
      <p className="mt-1 text-[15px] text-r-ink-2">
        Paid {fare !== undefined ? formatMoney(fare, trip.currency) : ''} · cash
        {trip.dropoff.label ? ` · ${trip.dropoff.label}` : ''}
      </p>

      <p className="mt-5 text-[16px] font-bold text-r-ink">How was your ride with {firstName(trip)}?</p>
      <div role="radiogroup" aria-label="Rating" className="mt-2 flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => setRating(n)}
            className="p-1"
          >
            <Star size={34} strokeWidth={1.6} className={n <= rating ? 'fill-[#f5b301] text-[#f5b301]' : 'text-r-line'} />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Anything to add? (optional)"
        aria-label="Comment"
        rows={2}
        maxLength={500}
        className="mt-3 w-full resize-none rounded-card border border-r-line px-4 py-3 text-[15px] text-r-ink outline-none placeholder:text-r-ink-3 focus:border-primary-500"
      />

      {rate.error && !alreadyRated && <p className="mt-2 text-[13px] font-semibold text-danger-600">{rate.error.message}</p>}
      {alreadyRated && <p className="mt-2 text-[13px] font-semibold text-r-ink-2">You’ve already rated this trip.</p>}

      <div className="mt-4 flex flex-col gap-2">
        {alreadyRated ? (
          <Button label="Done" shape="pill" size="large" onClick={finish} />
        ) : (
          <>
            <Button label="Submit rating" shape="pill" size="large" disabled={rating === 0} loading={rate.isPending} onClick={submit} />
            <Button label="Skip" variant="ghost" shape="pill" size="large" onClick={finish} />
          </>
        )}
      </div>
    </Sheet>
  );
}

/** cancelled after assignment (redispatches go back to R04 instead), or timed out. */
export function TripEndedScreen({ trip }: { trip: RiderTrip }) {
  const finish = useFinish();
  const byDriver = trip.cancelledBy === 'driver';
  const midTrip = trip.cancelStage === 'in_progress';
  const title = byDriver ? (midTrip ? 'Your driver ended the trip' : 'Your driver cancelled') : 'Trip cancelled';
  const detail = midTrip
    ? 'The trip was cancelled before the drop-off. You weren’t charged.'
    : 'You weren’t charged.';

  return (
    <Sheet icon={<XCircle size={24} />} tone="danger">
      <h1 data-testid="trip-ended" className="mt-3 text-[26px] font-extrabold tracking-[-0.02em] text-r-ink">
        {title}
      </h1>
      <p className="mt-1 text-[15px] text-r-ink-2">{detail}</p>
      <div className="mt-5">
        <Button label="Done" shape="pill" size="large" onClick={finish} />
      </div>
    </Sheet>
  );
}
