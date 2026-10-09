'use client';

import { useActionState } from 'react';
import { signIn } from './actions';
import { dashboardFonts } from '@/app/fonts';
import { PlanecoMark } from '@/components/landing/brand';
import { buttonClass, Eyebrow, fieldClass } from '@/components/ui';

export default function LoginPage() {
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <main className={`${dashboardFonts} grid min-h-dvh place-items-start bg-cream px-4 pt-24 text-ink`}>
      <div className="mx-auto w-full max-w-sm rounded-lg border border-hairline bg-surface p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-cream"><PlanecoMark className="h-6 w-auto" /></span>
          <div>
            <h1 className="font-brand text-lg font-semibold leading-tight">Standort-Check</h1>
            <p className="text-xs text-muted">Vertrieb · Anmeldung</p>
          </div>
        </div>
        <form action={action} className="mt-6 space-y-4">
          <label className="flex flex-col gap-1"><Eyebrow>E-Mail</Eyebrow>
            <input name="email" type="email" autoComplete="username" required className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1"><Eyebrow>Passwort</Eyebrow>
            <input name="password" type="password" autoComplete="current-password" required className={fieldClass} />
          </label>
          {error && <p role="alert" className="rounded-md bg-brick-wash px-3 py-2 text-sm text-brick">{error}</p>}
          <button disabled={pending} className={`${buttonClass('primary', 'md')} w-full`}>
            {pending ? 'Anmelden …' : 'Anmelden'}
          </button>
        </form>
      </div>
    </main>
  );
}
