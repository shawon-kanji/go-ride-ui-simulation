import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

// Web port of go-ride-driver-app/src/components/Button.tsx — same variants, shapes and
// sizes. `primary` follows the active theme (driver indigo / rider green).

type Variant =
  | 'primary'
  | 'secondary'
  | 'destructive'
  | 'ghost'
  | 'tonal'
  | 'dark'
  | 'muted'
  | 'success'
  | 'destructive-outline';
type Shape = 'rect' | 'pill';
type Size = 'compact' | 'default' | 'large';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-primary-500 text-white active:bg-primary-600',
  secondary: 'bg-secondary-500 text-white active:bg-secondary-600',
  destructive: 'bg-danger-500 text-white active:bg-danger-600',
  ghost: 'border border-neutral-300 bg-transparent text-neutral-800 active:bg-neutral-100',
  tonal: 'bg-primary-50 text-primary-700 active:opacity-80',
  dark: 'bg-neutral-900 text-white active:bg-neutral-800',
  muted: 'bg-neutral-200 text-neutral-500',
  success: 'bg-success-500 text-white active:bg-success-600',
  'destructive-outline': 'border border-neutral-300 bg-transparent text-danger-600 active:bg-danger-50',
};

const SHAPE_CLASSES: Record<Shape, string> = {
  rect: 'rounded-control',
  pill: 'rounded-pill',
};

// Handoff heights: utility pills 34–38px, form CTAs 48–54px, confirmation CTAs 54–60px.
const SIZE_CLASSES: Record<Size, string> = {
  compact: 'min-h-[36px] px-4 py-2 text-[13px]',
  default: 'min-h-[48px] px-4 py-3 text-[15px]',
  large: 'min-h-[54px] px-5 py-3 text-[17px]',
};

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  variant?: Variant;
  shape?: Shape;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  shape = 'rect',
  size = 'default',
  loading = false,
  disabled = false,
  fullWidth = true,
  type = 'button',
  className = '',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`flex items-center justify-center gap-2 font-bold transition-colors ${fullWidth ? 'w-full' : ''} ${SHAPE_CLASSES[shape]} ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${isDisabled ? 'opacity-50' : ''} ${className}`}
      {...rest}
    >
      {loading && <LoaderCircle size={18} className="animate-spin" aria-hidden />}
      {label}
    </button>
  );
}
