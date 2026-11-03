import type { ReactNode } from 'react';

// A page's empty, loading or problem state: short title, a line of text, optional buttons
// (same as mobile's StatusMessage).
export default function StatusMessage({
  title, message, loading, children,
}: { title?: string; message: string; loading?: boolean; children?: ReactNode }) {
  return (
    <div role="status" className="mx-auto flex max-w-[480px] flex-col items-center gap-2 py-12 text-center">
      {loading && (
        <svg className="mb-2 size-8 animate-spin text-primary" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {title && <h2 className="text-xl leading-[1.3] font-semibold">{title}</h2>}
      <p className="text-base text-text-muted">{message}</p>
      {children && <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">{children}</div>}
    </div>
  );
}
