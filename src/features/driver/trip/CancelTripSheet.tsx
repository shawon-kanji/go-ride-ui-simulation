import { useState } from 'react';

import { Button } from '../../../shared/ui/Button';
import { ModalSheet } from '../../../shared/ui/ModalSheet';
import type { CancellationReason } from '../api/types';
import { tripActionError, useCancelDriverTripMutation } from './use-trip-actions';

// D10 Cancel with a reason. The five reasons are the schema's enum in the design's
// order; the note is optional free text. Confirm stays disabled until a reason is
// picked. Before pickup the request goes straight back into dispatch.

const REASONS: { reason: CancellationReason; label: string }[] = [
  { reason: 'rider_absent', label: 'Rider isn’t at the pickup point' },
  { reason: 'rider_requested', label: 'Rider asked me to cancel' },
  { reason: 'vehicle_problem', label: 'Vehicle problem' },
  { reason: 'unsafe_destination', label: 'Wrong or unsafe destination' },
  { reason: 'other', label: 'Something else' },
];

interface CancelTripSheetProps {
  open: boolean;
  ongoingTripId: string;
  /** Before pickup the trip goes back into dispatch; mid-trip it just ends. */
  beforePickup: boolean;
  onDismiss: () => void;
}

export function CancelTripSheet({ open, ongoingTripId, beforePickup, onDismiss }: CancelTripSheetProps) {
  const [reason, setReason] = useState<CancellationReason | null>(null);
  const [note, setNote] = useState('');
  const cancel = useCancelDriverTripMutation();

  return (
    <ModalSheet open={open} onDismiss={onDismiss} labelledBy="cancel-trip-title">
      <h2 id="cancel-trip-title" className="text-[22px] font-extrabold tracking-[-0.01em] text-neutral-900">
        Cancel this trip?
      </h2>
      <p className="mt-2 text-[15px] text-neutral-600">
        {beforePickup
          ? 'The rider is told straight away and the trip goes back into dispatch. Frequent cancellations affect your acceptance score.'
          : 'The rider is told straight away and the trip ends here. Frequent cancellations affect your acceptance score.'}
      </p>

      <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.08em] text-neutral-500">Pick a reason</p>
      <div role="radiogroup" className="mt-2 flex flex-col gap-2">
        {REASONS.map((r) => {
          const active = r.reason === reason;
          return (
            <button
              key={r.reason}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setReason(r.reason)}
              className={`flex items-center gap-3 rounded-control px-4 py-3 text-left text-[15px] font-semibold text-neutral-900 ${active ? 'border-2 border-primary-500 bg-primary-50' : 'border border-neutral-200'}`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-pill border-2 ${active ? 'border-primary-500' : 'border-neutral-300'}`}
              >
                {active && <span className="h-2.5 w-2.5 rounded-pill bg-primary-500" />}
              </span>
              {r.label}
            </button>
          );
        })}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note for support (optional)"
        aria-label="Note for support"
        rows={3}
        maxLength={500}
        className="mt-3 w-full resize-none rounded-control border border-neutral-200 px-4 py-3 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-primary-500"
      />

      {cancel.error && <p className="mt-2 text-[13px] font-semibold text-danger-600">{tripActionError(cancel.error)}</p>}

      <div className="mt-4 flex gap-3">
        <Button label="Keep trip" variant="ghost" shape="pill" size="large" onClick={onDismiss} />
        <Button
          label="Cancel trip"
          variant="destructive"
          shape="pill"
          size="large"
          disabled={!reason}
          loading={cancel.isPending}
          onClick={() => reason && cancel.mutate({ ongoingTripId, reason, note: note.trim() || undefined })}
        />
      </div>
    </ModalSheet>
  );
}
