import { ChevronRight, TriangleAlert } from 'lucide-react';

// Web port of go-ride-driver-app's ProfileChip (D06, top-left over the map).
// Amber alert only while verification is outstanding — no "all good" variant.

interface ProfileChipProps {
  firstName: string;
  lastName: string;
  plate: string | null;
  status: 'online' | 'paused' | 'offline';
  hasAlert: boolean;
  onPress: () => void;
}

export function ProfileChip({ firstName, lastName, plate, status, hasAlert, onPress }: ProfileChipProps) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  return (
    <button
      type="button"
      onClick={onPress}
      aria-label="Open menu"
      className="flex items-center gap-[10px] rounded-pill bg-white py-2 pr-3 pl-2 text-left shadow-float"
    >
      <span className="flex h-[34px] w-[34px] items-center justify-center rounded-pill bg-primary-50 text-[13px] font-extrabold text-primary-700">
        {initials}
      </span>
      <span>
        <span className="block text-[14px] font-extrabold text-neutral-900">{firstName}</span>
        <span className="block text-[12px] text-neutral-500">
          {plate ?? 'No vehicle'} · {status}
        </span>
      </span>
      {hasAlert && (
        <span className="flex h-5 w-5 items-center justify-center rounded-pill bg-warning-500 text-white">
          <TriangleAlert size={12} strokeWidth={2.4} />
        </span>
      )}
      <ChevronRight size={18} strokeWidth={2} className="text-neutral-400" />
    </button>
  );
}
