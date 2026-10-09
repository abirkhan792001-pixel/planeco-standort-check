import type { ButtonHTMLAttributes } from 'react';
import { SERVICE_AREA } from '@/lib/config/service-area';
import type { AreaAssessment } from '@/lib/geo/service-area';
import type { LabelTone } from '@/lib/labels';

/**
 * Dashboard design system primitives. Class maps instead of a variant library: every
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
/** The same field one step smaller, for controls inside a line of text (e.g. "sortiert nach"). */
export const fieldClassSm = `h-7 rounded-md border border-line bg-surface px-1.5 text-[13px] text-ink ${focusRing}`;

export const toneClass: Record<LabelTone, string> = {
  green: 'bg-moss-wash text-moss', amber: 'bg-ochre-wash text-ochre', red: 'bg-brick-wash text-brick',
  grey: 'bg-stone-wash text-muted', blue: 'bg-slate-wash text-slate',
};
/** Tone as text colour only (on white or paper; every value reaches >= 4.5:1). */
export const toneText: Record<LabelTone, string> = {
  green: 'text-moss', amber: 'text-ochre', red: 'text-brick', grey: 'text-muted', blue: 'text-slate',
};
/** Tone as a solid dot, for legends and filter chips. */
export const toneDot: Record<LabelTone, string> = {
  green: 'bg-moss', amber: 'bg-ochre', red: 'bg-brick', grey: 'bg-line', blue: 'bg-slate',
};

/** A toggle filter. aria-pressed carries the state; pressed fills the chip (a luminance change, not only a hue). */
export function Chip({ pressed, dot, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean; dot?: LabelTone }) {
  return (
    <button type="button" aria-pressed={pressed}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px] transition-colors ${focusRing} ${
        pressed ? 'border-ink bg-ink text-white' : 'border-hairline bg-surface text-ink hover:border-line'}`}
      {...props}>
      {dot && <span aria-hidden="true" className={`size-2 rounded-full ${toneDot[dot]} ${pressed ? 'ring-1 ring-white/70' : ''}`} />}
      {children}
    </button>
  );
}

/** One choice out of a few (radio semantics without a form): a bordered strip of buttons. */
export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-hairline bg-paper p-0.5">
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={`h-6 rounded px-2.5 text-[13px] transition-colors ${focusRing} ${
            value === v ? 'bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--color-hairline)]' : 'text-muted hover:text-ink'}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

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
  // Decorative: the verdict and the km figure stand next to it as text.
  return (
    <span aria-hidden="true" title={`Einsatzradius ${radiusKm} km, Randlage bis ${radiusKm + edgeBandKm} km`}
      className="inline-flex shrink-0 items-center py-1">
      <span className="relative block h-1.5 w-16 rounded-full bg-brick-wash">
        <span className="absolute inset-y-0 left-0 rounded-l-full bg-moss-wash" style={{ width: pctOf(radiusKm) }} />
        <span className="absolute inset-y-0 bg-ochre-wash" style={{ left: pctOf(radiusKm), width: pctOf(edgeBandKm) }} />
        <span className="absolute -inset-y-0.5 w-px bg-line" style={{ left: pctOf(radiusKm) }} />
        <span className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${dot}`}
          style={{ left: pctOf(area.distanceKm) }} />
      </span>
    </span>
  );
}
