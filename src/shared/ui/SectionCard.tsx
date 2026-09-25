import type { ReactNode } from 'react';

// Web port of go-ride-driver-app/src/components/SectionCard.tsx: rows run full-bleed
// so their dividers reach the card edge (D03 menu, D04 document rows).

interface SectionCardProps {
  eyebrow: string;
  meta?: string;
  children: ReactNode;
  className?: string;
}

export function SectionCard({ eyebrow, meta, children, className = '' }: SectionCardProps) {
  return (
    <section className={`overflow-hidden rounded-card border border-neutral-200 bg-white ${className}`}>
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-neutral-500">{eyebrow}</h2>
        {meta ? <p className="text-[13px] font-bold text-neutral-600">{meta}</p> : null}
      </div>
      {children}
    </section>
  );
}
