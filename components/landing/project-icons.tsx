import type { ReactElement } from 'react';
import type { ProjectType } from '@/lib/leads/types';

/** Small line icons for the Vorhaben cards, in Planeco's illustration style (ink lines, salmon fills). Decorative. */
const svg = { viewBox: '0 0 32 32', fill: 'none', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, className: 'size-8 stroke-ink' } as const;

export const PROJECT_ICONS: Record<ProjectType, ReactElement> = {
  neubau: (
    <svg {...svg}>
      <rect x="8" y="14" width="16" height="13" className="fill-salmon" />
      <path d="M5 15 16 6l11 9" />
      <rect x="14" y="19" width="4" height="8" className="fill-ink" />
      <path d="M27 3v4M25 5h4" className="stroke-terracotta" />
    </svg>
  ),
  anbau: (
    <svg {...svg}>
      <rect x="4" y="14" width="14" height="13" className="fill-salmon" />
      <path d="M2 15 11 7l9 8" />
      <rect x="18" y="18" width="11" height="9" strokeDasharray="2 2" className="stroke-terracotta" />
    </svg>
  ),
  umbau: (
    <svg {...svg}>
      <rect x="7" y="15" width="14" height="12" className="fill-salmon" />
      <path d="M4 16 14 8l10 8" />
      <path d="M28 13a8 8 0 0 0-6-8" className="stroke-terracotta" />
      <path d="M21 2.5 22 5l-2.5 1" className="stroke-terracotta" />
    </svg>
  ),
  sanierung: (
    <svg {...svg}>
      <rect x="6" y="14" width="16" height="13" className="fill-paper" />
      <path d="M3 15 14 6l11 9" />
      <path d="M17 27c0-6 4-10 11-10 0 6-4 10-11 10z" className="fill-salmon" />
      <path d="M17 27l6-5" />
    </svg>
  ),
  sonstiges: (
    <svg {...svg}>
      <path d="M6 7h20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14l-6 5v-5H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" className="fill-salmon" />
      <circle cx="11" cy="14.5" r="1.4" className="fill-ink" stroke="none" />
      <circle cx="16" cy="14.5" r="1.4" className="fill-ink" stroke="none" />
      <circle cx="21" cy="14.5" r="1.4" className="fill-ink" stroke="none" />
    </svg>
  ),
};
