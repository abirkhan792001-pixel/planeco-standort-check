'use client';

import { useActionState } from 'react';
import { signIn } from './actions';

export default function LoginPage() {
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="text-xl font-bold text-stone-900">Standort-Check · Vertrieb</h1>
      <form action={action} className="mt-6 space-y-4">
        <label className="block text-sm">E-Mail
          <input name="email" type="email" autoComplete="username" required className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" />
        </label>
        <label className="block text-sm">Passwort
          <input name="password" type="password" autoComplete="current-password" required className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={pending} className="w-full rounded-lg bg-emerald-800 py-2 font-semibold text-white disabled:opacity-60">
          {pending ? 'Anmelden …' : 'Anmelden'}
        </button>
      </form>
    </main>
  );
}
