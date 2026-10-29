import { useId } from 'react';

interface Props<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T | '';
  onChange: (value: T) => void;
  placeholder: string;
  error?: string | null;
}

// Native select styled like TextField (spec section 4, Text input), for Activity level.
export default function SelectField<T extends string>({ label, options, value, onChange, placeholder, error }: Props<T>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`h-12 w-full rounded-(--radius-input) border bg-bg px-3 text-base focus:outline-1 focus:outline-offset-0 ${
          error ? 'border-error focus:outline-error' : 'border-border-input focus:border-primary focus:outline-primary'
        } ${value ? '' : 'text-text-muted'}`}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="text-text">
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${id}-error`} className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
