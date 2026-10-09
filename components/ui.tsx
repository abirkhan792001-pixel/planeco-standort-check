import type { ButtonHTMLAttributes } from 'react';
import { SERVICE_AREA } from '@/lib/config/service-area';
import type { AreaAssessment } from '@/lib/geo/service-area';
import type { LabelTone } from '@/lib/labels';

/**
 * Dashboard design system primitives (shown on /dashboard/design-system). Class maps instead of a variant library: every
 * variant is a plain string, so the classes stay greppable and Tailwind sees them.
 */

export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-deep';

export type ButtonVariant = 'primary' | 'confirm' | 'secondary' | 'ghost';
const buttonBase = `inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const buttonVariant: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-soft',
  confirm: 'bg-moss text-white hover:bg-ink',
  secondary: 'border border-line bg-surface text-ink hover:bg-cream',
  ghost: 'text-ink underline-offset-4 hover:underline',
};
const buttonSize = { sm: 'h-8 px-2.5 text-[13px]', md: 'h-9 px-3.5 text-sm' } as const;

export function buttonClass(variant: ButtonVariant = 'secondary', size: keyof typeof buttonSize = 'sm') {
  return `${buttonBase} ${buttonVariant[variant]} ${buttonSize[size]}`;
}

export function Button({ variant, size, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: keyof typeof buttonSize }) {
  return <button type="button" className={`${buttonClass(variant, size)} ${className}`} {...props} />;
}

/** Text inputs and selects share one height and boundary so a filter row lines up. */
export const fieldClass = `h-9 rounded-md border border-line bg-surface px-2.5 text-sm text-ink placeholder:text-muted ${focusRing}`;

/** A toggle filter. aria-pressed carries the state; the check mark repeats it without colour. */
export function Chip({ pressed, count, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean; count?: number }) {
  return (
    <button type="button" aria-pressed={pressed}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors ${focusRing} ${
        pressed ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink hover:bg-cream'}`}
      {...props}>
      {pressed && <span aria-hidden="true">✓</span>}
      {children}
      {count !== undefined && (
        <span className={`font-data text-xs tabular-nums ${pressed ? 'text-white/80' : 'text-muted'}`}>{count}</span>
      )}
    </button>
  );
}

export const toneClass: Record<LabelTone, string> = {
  green: 'bg-moss-wash text-moss', amber: 'bg-ochre-wash text-ochre', red: 'bg-brick-wash text-brick',
  grey: 'bg-stone-wash text-muted', blue: 'bg-slate-wash text-slate',
};

export function Badge({ tone, title, children }: { tone: LabelTone; title?: string; children: React.ReactNode }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${toneClass[tone]}`}>
      {children}
    </span>
  );
}

/** Small uppercase label above a group of controls or a block of facts. */
export function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] text-muted ${className}`}>{children}</span>;
}

/**
 * Distance bar: kilometres to the nearest hub on a fixed scale, with the service radius and the edge band marked.
 * The scale runs to radius + 3 × edge band; anything farther pins to the end.
 */
const SCALE_KM = SERVICE_AREA.radiusKm + 3 * SERVICE_AREA.edgeBandKm;
const pctOf = (km: number) => `${(Math.min(km, SCALE_KM) / SCALE_KM) * 100}%`;

export function DistanceBar({ area }: { area: AreaAssessment }) {
  if (area.distanceKm === undefined || !area.hub) return null;
  const { radiusKm, edgeBandKm } = SERVICE_AREA;
  const dot = area.verdict === 'inside' ? 'bg-moss' : area.verdict === 'edge' ? 'bg-ochre' : 'bg-brick';
  // The km figure is in the area badge next to the bar; here it is only spoken.
  return (
    <span role="img" aria-label={`${area.distanceKm} km bis ${area.hub}, Einsatzradius ${radiusKm} km`}
      className="block py-1">
      <span className="relative block h-1.5 w-28 rounded-full bg-brick-wash">
        <span className="absolute inset-y-0 left-0 rounded-l-full bg-moss-wash" style={{ width: pctOf(radiusKm) }} />
        <span className="absolute inset-y-0 bg-ochre-wash" style={{ left: pctOf(radiusKm), width: pctOf(edgeBandKm) }} />
        <span className="absolute -inset-y-0.5 w-px bg-line" style={{ left: pctOf(radiusKm) }} />
        <span className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${dot}`}
          style={{ left: pctOf(area.distanceKm) }} />
      </span>
    </span>
  );
}
