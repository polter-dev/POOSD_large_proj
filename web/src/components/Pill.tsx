import type { ReactNode } from 'react';

const LOOKS = {
  great: 'bg-fit-great-bg text-fit-great-text',
  ok: 'bg-fit-ok-bg text-fit-ok-text',
  neutral: 'bg-surface text-text-muted',
  over: 'bg-fit-over-bg text-fit-over-text',
};

// Spec section 4, Fit pill: caption text in a round pill. Fit colors are never the only signal, so the
// fit looks always carry text and an icon.
export default function Pill({ look, icon, children }: { look: keyof typeof LOOKS; icon?: 'check' | 'dash'; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] leading-[1.2] font-medium ${LOOKS[look]}`}>
      {icon === 'check' && (
        <svg className="size-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 6.5 5 9l4.5-5.5" />
        </svg>
      )}
      {icon === 'dash' && (
        <svg className="size-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 6h6" />
        </svg>
      )}
      {children}
    </span>
  );
}

export const FitPill = ({ great }: { great: boolean }) =>
  great ? <Pill look="great" icon="check">Great fit</Pill> : <Pill look="ok" icon="dash">OK</Pill>;
