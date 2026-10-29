import { useId, useState, type InputHTMLAttributes } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  lowercase?: boolean; // username and email: lowercase as they type
  suffix?: string; // unit shown inside the right edge ("ft", "lb")
  hideLabel?: boolean; // label kept for screen readers when a group shows one heading (Height: ft + in)
  invalid?: boolean; // red outline when the group shows the error message instead of this field
}

// Spec section 4, Text input: label above, 48 tall, error below starting with the field name,
// show/hide toggle on passwords.
export default function TextField({
  label, value, onChange, error, lowercase, suffix, hideLabel, invalid, type = 'text', ...rest
}: Props) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const isPassword = type === 'password';
  const bad = !!error || !!invalid;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-sm font-semibold'}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && shown ? 'text' : type}
          value={value}
          onChange={(e) => onChange(lowercase ? e.target.value.toLowerCase() : e.target.value)}
          aria-invalid={bad}
          aria-describedby={error ? `${id}-error` : undefined}
          // Focus keeps the field's color, so a field with an error stays red while it's being fixed.
          className={`h-12 w-full rounded-(--radius-input) border bg-bg px-3 text-base focus:outline-1 focus:outline-offset-0 ${
            bad ? 'border-error focus:outline-error' : 'border-border-input focus:border-primary focus:outline-primary'
          } ${isPassword ? 'pr-16' : ''} ${suffix ? 'pr-12' : ''}`}
          {...rest}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-base text-text-muted" aria-hidden="true">
            {suffix}
          </span>
        )}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-pressed={shown}
            aria-label={shown ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-1 my-1 rounded-(--radius-input) px-3 text-sm font-semibold text-primary hover:underline"
          >
            {shown ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
