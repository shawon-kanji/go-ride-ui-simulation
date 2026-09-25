import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';

// Web port of go-ride-driver-app/src/components/ScreenHeader.tsx: 20px gutter, white
// background, neutral-200 hairline, 44px back target.

interface ScreenHeaderProps {
  title: string;
  /** Defaults to history back. Pass null for a header with no back affordance. */
  onBack?: (() => void) | null;
  right?: ReactNode;
}

export function ScreenHeader({ title, onBack, right }: ScreenHeaderProps) {
  const navigate = useNavigate();
  const showBack = onBack !== null;
  const handleBack = onBack ?? (() => navigate(-1));

  return (
    <header className="flex items-center border-b border-neutral-200 bg-white px-5 py-3">
      {showBack && (
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back"
          className="-ml-2 flex h-11 w-11 items-center justify-center text-neutral-900"
        >
          <ChevronLeft size={24} strokeWidth={2} />
        </button>
      )}
      <h1 className="flex-1 text-[17px] font-extrabold text-neutral-900">{title}</h1>
      {right ? <div className="ml-3">{right}</div> : null}
    </header>
  );
}
