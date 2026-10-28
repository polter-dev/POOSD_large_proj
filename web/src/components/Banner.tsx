interface Props {
  message: string;
  info?: boolean; // neutral confirmation ("If that email exists...") instead of an error
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}

// Spec section 4, Error banner: top of a form, error-bg fill, alert icon, the server's message as-is,
// optional action button inside.
export default function Banner({ message, info, actionLabel, onAction, actionDisabled }: Props) {
  return (
    <div
      role={info ? 'status' : 'alert'}
      className={`flex gap-3 rounded-(--radius-input) p-3 text-sm ${
        info ? 'bg-fit-great-bg text-fit-great-text' : 'bg-error-bg text-error'
      }`}
    >
      <svg className="mt-0.5 size-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        {info ? (
          <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm3.6 5.2a.75.75 0 0 0-1.06.06L7.2 9.05 5.4 7.33a.75.75 0 1 0-1.04 1.08l2.36 2.27a.75.75 0 0 0 1.08-.04l3.86-4.38a.75.75 0 0 0-.06-1.06Z" />
        ) : (
          <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm0 3.5a.9.9 0 0 0-.9.95l.2 4.3a.7.7 0 0 0 1.4 0l.2-4.3A.9.9 0 0 0 8 3.5Zm0 7.25a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
        )}
      </svg>
      <div className="flex flex-col items-start gap-2">
        <p>{message}</p>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            disabled={actionDisabled}
            className="font-semibold underline disabled:opacity-70"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
