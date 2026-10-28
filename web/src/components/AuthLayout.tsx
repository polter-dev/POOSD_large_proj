import type { ReactNode } from 'react';

// Spec section 3: web forms max 400 wide, centered, 24 side padding.
export default function AuthLayout({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[448px] flex-col justify-center px-6 py-12">
      <p className="mb-8 text-base font-bold text-primary">Menu Macro Fitter</p>
      <h1 className="text-[28px] leading-[1.2] font-bold">{title}</h1>
      {lead && <div className="mt-2 text-base text-text-muted">{lead}</div>}
      <div className="mt-6 flex flex-col gap-4">{children}</div>
    </main>
  );
}
