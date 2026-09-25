import { X } from 'lucide-react';

// Web port of go-ride-driver-app/src/components/Banner.tsx.

type Variant = 'error' | 'warning' | 'info' | 'success';

const VARIANT_CLASSES: Record<Variant, string> = {
  error: 'bg-danger-50 border-danger-500 text-danger-700',
  warning: 'bg-warning-50 border-warning-500 text-warning-700',
  info: 'bg-primary-50 border-primary-500 text-primary-700',
  success: 'bg-success-50 border-success-500 text-success-700',
};

interface BannerProps {
  message: string;
  variant?: Variant;
  onDismiss?: () => void;
}

export function Banner({ message, variant = 'info', onDismiss }: BannerProps) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`mb-4 flex items-center justify-between rounded-control border px-3 py-3 ${VARIANT_CLASSES[variant]}`}
    >
      <p className="flex-1 text-[14px] font-semibold">{message}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="ml-3 -mr-1 p-1">
          <X size={16} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}
