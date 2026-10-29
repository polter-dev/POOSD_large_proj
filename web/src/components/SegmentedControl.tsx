import { useId } from 'react';

interface Props<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T | '';
  onChange: (value: T) => void;
  error?: string | null;
}

// Prototype screens 05 (Sex, Goal): joined buttons, the selected one filled primary. Real radio inputs
// underneath, so arrow keys, screen readers and the focus ring work without extra code.
export default function SegmentedControl<T extends string>({ label, options, value, onChange, error }: Props<T>) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1" aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-1 text-sm font-semibold">{label}</legend>
      <div
        className={`flex h-12 overflow-hidden rounded-(--radius-input) border ${error ? 'border-error' : 'border-border-input'}`}
      >
        {options.map((o) => (
          <label
            key={o.value}
            // Keyboard focus ring: primary on an unselected (white) segment, white inside the selected (green) one.
            className="flex flex-1 cursor-pointer items-center justify-center border-l border-border-input text-base font-semibold first:border-l-0 hover:bg-surface has-checked:bg-primary has-checked:text-on-primary has-focus-visible:outline-2 has-focus-visible:-outline-offset-4 has-focus-visible:outline-primary has-checked:has-focus-visible:outline-on-primary"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
      {error && (
        <p id={`${name}-error`} className="text-sm text-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
