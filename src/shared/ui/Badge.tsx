// Web port of go-ride-driver-app/src/components/Badge.tsx.

type Variant = 'active' | 'inactive' | 'pending' | 'blocked';

const VARIANT_CLASSES: Record<Variant, string> = {
  active: 'bg-success-50 text-success-700',
  inactive: 'bg-neutral-100 text-neutral-600',
  pending: 'bg-neutral-100 text-neutral-600',
  blocked: 'bg-danger-50 text-danger-700',
};

interface BadgeProps {
  label: string;
  variant: Variant;
}

export function Badge({ label, variant }: BadgeProps) {
  return (
    <span className={`inline-flex self-start rounded-pill px-2.5 py-1 text-[12px] font-bold ${VARIANT_CLASSES[variant]}`}>
      {label}
    </span>
  );
}
