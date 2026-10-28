import type { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  loading?: boolean;
}

// Spec section 4, Buttons: 48 tall, full width in forms. Loading swaps the label for a spinner
// and disables the button without changing its width.
export default function Button({ variant = 'primary', loading, disabled, children, className = '', ...rest }: Props) {
  const look =
    variant === 'primary'
      ? 'bg-primary text-on-primary hover:bg-primary-hover'
      : 'border border-border-input bg-bg text-text hover:bg-surface';
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading}
      className={`flex h-12 w-full items-center justify-center rounded-(--radius-input) px-4 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-70 ${look} ${className}`}
      {...rest}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="size-5 animate-spin" viewBox="0 0 24 24" fill="none" role="img" aria-label="Loading">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
