import { useEffect, useRef, type ReactNode } from 'react';

// A modal on the native <dialog>: focus trap, Esc to close and the backdrop come from the browser.
export default function Dialog({ open, title, onClose, children }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="dialog-title"
      className="m-auto w-[min(560px,calc(100%-2rem))] rounded-(--radius-card) border border-border bg-bg p-0 text-text shadow-lg backdrop:bg-black/40"
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id="dialog-title" className="text-xl leading-[1.3] font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-m-2 rounded-(--radius-input) p-2 text-text-muted hover:bg-surface hover:text-text"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
