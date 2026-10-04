import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

/** Presentational pieces of the public form (Heyflow look: large white fields, soft shadow). No state. */

export const softShadow = 'shadow-[0_1px_2px_rgb(34_64_60/0.08)]';
/** Visible keyboard focus for buttons and links on the public page. */
export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

/** Single-choice card with a radio-style dot; reports its state via aria-pressed. */
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

/** The terracotta pill used for "Weiter" and the submit button. */
export function PillButton({ children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest}
      className={`flex min-h-16 w-full items-center justify-center gap-2 rounded-full bg-terracotta-deep px-6 py-3 text-center text-lg font-semibold leading-tight text-white shadow-[0_8px_24px_-12px_rgb(169_86_58/0.7)] transition hover:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100 sm:text-xl ${className}`}>
      {children}
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

export function PhoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-6">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

/* ---------- Heyflow-style fields: the label sits inside the field and floats up on focus or once there is a value ---------- */

const fieldBox =
  'peer block w-full border border-line bg-white px-4 text-base text-ink focus:border-ink focus:outline-hidden focus:ring-2 focus:ring-ink aria-[invalid=true]:border-red-700';
const labelBase = 'pointer-events-none absolute truncate text-muted transition-all motion-reduce:transition-none';
const floatingLabel = `${labelBase} right-4 top-1/2 -translate-y-1/2 text-base peer-focus:top-2.5 peer-focus:translate-y-0 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-2.5 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-xs peer-autofill:top-2.5 peer-autofill:translate-y-0 peer-autofill:text-xs`;

type FieldBase = { id: string; label: string; error?: string; hint?: string; className?: string };

export function ErrorIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-0.5 size-4 shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5v.01" />
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-ink">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** The line under a field: its error (red, with icon) or else its hint. Ids match the fields' aria-describedby. */
export function FieldNote({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) return <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-sm text-red-700"><ErrorIcon />{error}</p>;
  if (hint) return <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">{hint}</p>;
  return null;
}

export function TextField({ id, label, error, hint, icon, className = '', ...input }:
  FieldBase & { icon?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'placeholder' | 'className'>) {
  return (
    <div className={className}>
      <div className={`relative flex rounded-md ${softShadow}`}>
        {icon && <span aria-hidden="true" className="grid w-14 shrink-0 place-items-center rounded-l-md border border-r-0 border-line bg-paper text-ink">{icon}</span>}
        <input id={id} placeholder=" " {...input} className={`${fieldBox} h-16 min-w-0 pb-2 pt-6 ${icon ? 'rounded-r-md' : 'rounded-md'}`} />
        <label htmlFor={id} className={`${floatingLabel} ${icon ? 'left-[4.5rem]' : 'left-4'}`}>{label}</label>
      </div>
      <FieldNote id={id} error={error} hint={hint} />
    </div>
  );
}

export function TextArea({ id, label, error, hint, className = '', ...area }:
  FieldBase & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'placeholder' | 'className'>) {
  return (
    <div className={className}>
      <div className={`relative rounded-md ${softShadow}`}>
        <textarea id={id} placeholder=" " {...area} className={`${fieldBox} min-h-28 rounded-md pb-3 pt-7`} />
        <label htmlFor={id} className={`${labelBase} left-px right-px top-px rounded-t-md bg-white px-[15px] pb-1 pt-2.5 text-xs`}>{label}</label>
      </div>
      <FieldNote id={id} error={error} hint={hint} />
    </div>
  );
}

export function SelectField({ id, label, error, hint, className = '', children, ...select }:
  FieldBase & { children: ReactNode } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className' | 'children'>) {
  return (
    <div className={className}>
      <div className={`relative rounded-md ${softShadow}`}>
        <select id={id} {...select} className={`${fieldBox} h-16 appearance-none rounded-md pb-2 pr-10 pt-6`}>{children}</select>
        <label htmlFor={id} className={`${labelBase} left-4 right-10 top-2.5 text-xs`}>{label}</label>
        <ChevronIcon />
      </div>
      <FieldNote id={id} error={error} hint={hint} />
    </div>
  );
}
