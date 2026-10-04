import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Presentational pieces of the public form (Heyflow look: large white fields, soft shadow). No state. */

export const softShadow = 'shadow-[0_1px_2px_rgb(34_64_60/0.08)]';
const fieldBase =
  'block min-h-14 w-full border border-line bg-white px-4 py-3 text-base text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/25 aria-[invalid=true]:border-red-700';
/** Visible keyboard focus for buttons and links on the public page. */
export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

/** Text inputs, selects and textareas. */
export const inputCls = `mt-1.5 rounded-md ${softShadow} ${fieldBase}`;
/** An input joined to a leading icon cell; the InputWithIcon wrapper carries margin, radius and shadow. */
export const joinedInputCls = `min-w-0 rounded-r-md ${fieldBase}`;

export function Field(props: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={props.id} className="block text-sm font-medium text-ink">{props.label}</label>
      {props.children}
      {props.hint && !props.error && <p id={`${props.id}-hint`} className="mt-1.5 text-sm text-muted">{props.hint}</p>}
      {props.error && <p id={`${props.id}-error`} className="mt-1.5 text-sm text-red-700">{props.error}</p>}
    </div>
  );
}

export function InputWithIcon({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className={`mt-1.5 flex rounded-md ${softShadow}`}>
      <span aria-hidden="true" className="grid w-14 shrink-0 place-items-center rounded-l-md border border-r-0 border-line bg-paper text-ink">{icon}</span>
      {children}
    </div>
  );
}

/** Single-choice card with a radio-style dot (Vorhaben). A toggle button: clicking the active card clears it. */
export function OptionCard({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={`flex min-h-14 w-full items-center gap-3 rounded-lg border bg-paper px-4 py-3 text-left text-base text-ink transition-colors ${focusRing} ${active ? 'border-ink ring-1 ring-ink' : `border-line ${softShadow} hover:border-terracotta`}`}>
      <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${active ? 'border-ink' : 'border-line'}`}>
        {active && <span className="size-2.5 rounded-full bg-ink" />}
      </span>
      {icon && <span aria-hidden="true" className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

/** Multi-choice pill (Erreichbarkeit). */
export function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={`min-h-11 rounded-full border px-5 text-sm font-medium transition-colors ${focusRing} ${active ? 'border-ink bg-ink text-white' : `border-line bg-white text-ink ${softShadow} hover:border-terracotta`}`}>
      {children}
    </button>
  );
}

/** The two-line terracotta pill used for the submit button. */
export function PillButton({ sub, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { sub?: ReactNode }) {
  return (
    <button {...rest}
      className={`flex min-h-16 w-full flex-col items-center justify-center rounded-full bg-terracotta-deep px-6 py-3 text-center text-white shadow-[0_8px_24px_-12px_rgb(169_86_58/0.7)] transition hover:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100 ${className}`}>
      <span className="inline-flex items-center gap-2 text-lg font-semibold leading-tight sm:text-xl">{children}</span>
      {sub && <span className="mt-0.5 text-sm font-normal">{sub}</span>}
    </button>
  );
}

export function Spinner() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5 motion-safe:animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function PhoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-6">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
