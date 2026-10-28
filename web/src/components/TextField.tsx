import { useId, useState, type InputHTMLAttributes } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  lowercase?: boolean; // username and email: lowercase as they type
}

// Spec section 4, Text input: label above, 48 tall, error below starting with the field name,
// show/hide toggle on passwords.
export default function TextField({ label, value, onChange, error, lowercase, type = 'text', ...rest }: Props) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const isPassword = type === 'password';

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && shown ? 'text' : type}
          value={value}
          onChange={(e) => onChange(lowercase ? e.target.value.toLowerCase() : e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`h-12 w-full rounded-(--radius-input) border bg-bg px-3 text-base focus:border-primary focus:outline-1 focus:outline-offset-0 focus:outline-primary ${
            error ? 'border-error' : 'border-border-input'
          } ${isPassword ? 'pr-16' : ''}`}
          {...rest}
        />
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
