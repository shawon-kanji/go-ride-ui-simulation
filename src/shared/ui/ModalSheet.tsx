import { useEffect, type ReactNode } from 'react';

// A bottom sheet over a scrim, contained inside the phone frame (the frame's screen is
// `relative overflow-hidden`). Matches the handoff's D07/D10 sheets: 26px top radius,
// grab handle, scrim tap and Escape dismiss.

interface ModalSheetProps {
  open: boolean;
  onDismiss: () => void;
  labelledBy?: string;
  children: ReactNode;
}

export function ModalSheet({ open, onDismiss, labelledBy, children }: ModalSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onDismiss}
        className="absolute inset-0 cursor-default bg-neutral-900/55"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative max-h-[92%] overflow-y-auto rounded-t-sheet bg-white px-5 pt-[18px] pb-5"
      >
        <div className="mx-auto mb-4 h-1 w-11 rounded-pill bg-neutral-200" />
        {children}
      </div>
    </div>
  );
}
