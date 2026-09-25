import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';

// Web port of go-ride-driver-app/src/components/TextInput.tsx: 13px/700 label, 52px
// field, 1.5px resting border, 2px focus ring in the theme's primary, optional
// reveal toggle for passwords.

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  errorText?: string;
  revealToggle?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, errorText, revealToggle = false, type = 'text', className = '', id, ...inputProps },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [revealed, setRevealed] = useState(false);
  const inputType = type === 'password' && revealed ? 'text' : type;

  const borderClass = errorText
    ? 'border-[1.5px] border-danger-500 focus:border-2 focus:border-primary-500'
    : 'border-[1.5px] border-neutral-300 focus:border-2 focus:border-primary-500';

  return (
    <div className={`mb-4 ${className}`}>
      <label htmlFor={inputId} className="mb-1 block text-[13px] font-bold text-neutral-700">
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          ref={ref}
          id={inputId}
          type={inputType}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`min-h-[52px] w-full rounded-control bg-white px-3 py-3 text-[15px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 ${borderClass} ${revealToggle ? 'pr-12' : ''}`}
          aria-invalid={errorText ? true : undefined}
          {...inputProps}
        />
        {revealToggle && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            className="absolute right-0 flex h-11 w-11 items-center justify-center text-neutral-500"
          >
            {revealed ? <EyeOff size={20} strokeWidth={2} /> : <Eye size={20} strokeWidth={2} />}
          </button>
        )}
      </div>
      {errorText ? <p className="mt-1 text-[13px] font-semibold text-danger-600">{errorText}</p> : null}
    </div>
  );
});
