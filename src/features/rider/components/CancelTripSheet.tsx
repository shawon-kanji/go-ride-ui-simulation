import { Check } from 'lucide-react';
import { useState } from 'react';

import { ApiError } from '../../../shared/api/http-client';
import { Button } from '../../../shared/ui/Button';
import { ModalSheet } from '../../../shared/ui/ModalSheet';
import { useCancelTripMutation } from '../api/queries';
import type { CancellationReason } from '../api/types';

// Rider cancel. The handoff rule is "cancellation always asks for a reason". The API
// takes a fixed enum (a wrong value is a 400 and the trip stays live, which keeps that
// driver out of dispatch), so each option maps to an enum value and its wording goes
// in `note`.

interface ReasonOption {
  id: string;
  label: string;
  reason: CancellationReason;
}

const SEARCH_REASONS: ReasonOption[] = [
  { id: 'plans', label: 'My plans changed', reason: 'rider_requested' },
  { id: 'mistake', label: 'I booked by mistake', reason: 'rider_requested' },
  { id: 'wait', label: 'It’s taking too long to find a driver', reason: 'rider_requested' },
  { id: 'other', label: 'Something else', reason: 'other' },
];

const ASSIGNED_REASONS: ReasonOption[] = [
  { id: 'late', label: 'The driver is taking too long', reason: 'rider_requested' },
  { id: 'plans', label: 'My plans changed', reason: 'rider_requested' },
  { id: 'asked', label: 'The driver asked me to cancel', reason: 'other' },
  { id: 'other', label: 'Something else', reason: 'other' },
];

const IN_TRIP_REASONS: ReasonOption[] = [
  { id: 'here', label: 'I want to get out here', reason: 'rider_requested' },
  { id: 'unsafe', label: 'I don’t feel safe', reason: 'other' },
  { id: 'route', label: 'We’re going the wrong way', reason: 'unsafe_destination' },
  { id: 'other', label: 'Something else', reason: 'other' },
];

const COPY = {
  searching: { title: 'Cancel this request?', body: 'No fee — nobody has accepted yet. Tell us why:', confirm: 'Cancel request', reasons: SEARCH_REASONS },
  assigned: { title: 'Cancel your ride?', body: 'Your driver is already on the way. Tell us why:', confirm: 'Cancel ride', reasons: ASSIGNED_REASONS },
  in_progress: {
    title: 'End the trip here?',
    body: 'Your driver is told straight away and the trip ends. Tell us why:',
    confirm: 'Cancel trip',
    reasons: IN_TRIP_REASONS,
  },
} as const;

interface CancelTripSheetProps {
  open: boolean;
  requestId: string;
  stage: keyof typeof COPY;
  onDismiss: () => void;
}

export function CancelTripSheet({ open, requestId, stage, onDismiss }: CancelTripSheetProps) {
  const copy = COPY[stage];
  const options = copy.reasons;
  const [selected, setSelected] = useState<string | null>(null);
  const cancel = useCancelTripMutation();
  const option = options.find((o) => o.id === selected) ?? null;

  const submit = () => {
    if (!option) return;
    // On success the hook clears the trip and goes home.
    cancel.mutate({ requestId, reason: option.reason, note: option.label });
  };

  const errorMessage =
    cancel.error && !(cancel.error instanceof ApiError && cancel.error.code === 'trip_already_cancelled')
      ? cancel.error instanceof ApiError && cancel.error.code === 'trip_not_cancellable'
        ? 'This trip can’t be cancelled any more.'
        : cancel.error.message
      : null;

  return (
    <ModalSheet open={open} onDismiss={onDismiss} labelledBy="cancel-trip-title">
      <h2 id="cancel-trip-title" className="text-[22px] font-extrabold tracking-[-0.02em] text-r-ink">
        {copy.title}
      </h2>
      <p className="mt-1 text-[14px] text-r-ink-2">{copy.body}</p>

      <div role="radiogroup" className="mt-4 flex flex-col gap-2">
        {options.map((o) => {
          const active = o.id === selected;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(o.id)}
              className={`flex items-center justify-between rounded-card border px-4 py-3 text-left text-[15px] font-semibold ${active ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-r-line text-r-ink'}`}
            >
              {o.label}
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-pill border-2 ${active ? 'border-primary-500 bg-primary-500 text-white' : 'border-neutral-300'}`}
              >
                {active && <Check size={12} strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>

      {errorMessage && <p className="mt-3 text-[13px] font-semibold text-danger-600">{errorMessage}</p>}

      <div className="mt-5 flex flex-col gap-2">
        <Button
          label={copy.confirm}
          variant="destructive"
          shape="pill"
          size="large"
          disabled={!option}
          loading={cancel.isPending}
          onClick={submit}
        />
        <Button label="Keep my ride" variant="ghost" shape="pill" size="large" onClick={onDismiss} />
      </div>
    </ModalSheet>
  );
}
