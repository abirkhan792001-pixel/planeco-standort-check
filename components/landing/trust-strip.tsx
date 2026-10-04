import type { ReactElement } from 'react';
import { softShadow } from '@/components/form-ui';

const svg = { viewBox: '0 0 32 32', fill: 'none', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, className: 'size-7 stroke-ink' } as const;

/** Only claims this prototype keeps (spec R2): no third-party badges, no borrowed company claims. */
const ITEMS: { text: string; icon: ReactElement }[] = [
  {
    text: 'Kostenlos & unverbindlich',
    icon: (
      <svg {...svg}>
        <path d="M11 21l-2 8 7-3 7 3-2-8" />
        <circle cx="16" cy="13" r="9" className="fill-salmon" />
        <path d="M12 13l3 3 5-6" />
      </svg>
    ),
  },
  {
    text: 'Rückruf meist am nächsten Werktag',
    icon: (
      <svg {...svg}>
        <circle cx="16" cy="16" r="11" className="fill-salmon" />
        <path d="M16 10v6l4 3" />
      </svg>
    ),
  },
  {
    text: 'Prüfung von Lage & Genehmigung',
    icon: (
      <svg {...svg}>
        <path d="M8 4h11l5 5v19H8z" className="fill-paper" />
        <path d="M19 4v5h5" />
        <path d="M16 25s-5-5-5-8.5a5 5 0 0 1 10 0C21 20 16 25 16 25z" className="fill-terracotta" />
        <circle cx="16" cy="16.5" r="1.6" className="fill-cream" />
      </svg>
    ),
  },
];

export function TrustStrip() {
  return (
    <section aria-label="Ihre Vorteile" className="px-4 pb-8 sm:px-6">
      <ul className={`mx-auto grid max-w-5xl gap-5 rounded-[2rem] bg-paper px-6 py-7 md:grid-cols-3 md:px-10 ${softShadow}`}>
        {ITEMS.map((item) => (
          <li key={item.text} className="flex items-center gap-4 text-base">
            <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-white">{item.icon}</span>
            {item.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
