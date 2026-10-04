'use client';

import { useEffect, useRef, useState } from 'react';
import { captureAttribution } from '@/lib/attribution/capture';
import type { RawAttribution } from '@/lib/attribution/types';
import { fieldErrors, leadPayloadSchema } from '@/lib/leads/schema';
import { PROJECT_TYPES, REACHABILITY, type ProjectType, type Reachability } from '@/lib/leads/types';
import { PROJECT_TYPE_LABELS, REACHABILITY_LABELS } from '@/lib/labels';
import { isReservedEmailDomain } from '@/lib/config/app';

type Locality = { name: string };
type Values = {
  postalCode: string; city: string; street: string; houseNumber: string; addressUnknown: boolean; plotNote: string;
  projectType: ProjectType | null; firstName: string; lastName: string; phone: string; email: string;
  reachability: Reachability[]; website: string;
};
const EMPTY: Values = {
  postalCode: '', city: '', street: '', houseNumber: '', addressUnknown: false, plotNote: '', projectType: null,
  firstName: '', lastName: '', phone: '', email: '', reachability: [], website: '',
};

const PAGE_ORDER = ['addressUnknown', 'postalCode', 'city', 'street', 'houseNumber', 'plotNote', 'projectType', 'firstName', 'lastName', 'phone', 'email', 'reachability'];

const inputCls = 'mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-base focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/30 aria-[invalid=true]:border-red-600';

function Field(props: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={props.id} className="block text-sm font-medium text-stone-800">{props.label}</label>
      {props.children}
      {props.hint && !props.error && <p id={`${props.id}-hint`} className="mt-1 text-sm text-stone-500">{props.hint}</p>}
      {props.error && <p id={`${props.id}-error`} className="mt-1 text-sm text-red-700">{props.error}</p>}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-sm ${active ? 'border-emerald-800 bg-emerald-800 text-white' : 'border-stone-300 bg-white text-stone-800'}`}>
      {children}
    </button>
  );
}

export function LeadForm() {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const renderedAt = useRef(Date.now());
  const [attr, setAttr] = useState<{ attribution: RawAttribution; isTest: boolean }>({ attribution: {}, isTest: false });
  const [v, setV] = useState<Values>(EMPTY);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [plzWarning, setPlzWarning] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const [focusSeq, setFocusSeq] = useState(0);

  useEffect(() => {
    setAttr(captureAttribution(window.location.search, document.referrer, window.location.pathname));
    setReady(true);
  }, []);

  const clearError = (key: string) => setErrors((e) => {
    if (!(key in e) && !('form' in e)) return e;
    const { [key]: _k, form: _f, ...rest } = e;
    void _k; void _f;
    return rest;
  });
  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setV((s) => ({ ...s, [key]: value }));
    clearError(key);
  };
  const setPostalCode = (value: string) => {
    setV((s) => (s.postalCode === value ? s : { ...s, postalCode: value, city: '' }));
    clearError('postalCode');
    clearError('city');
  };

  useEffect(() => {
    if (!/^\d{5}$/.test(v.postalCode)) {
      setLocalities([]);
      setPlzWarning(null);
      setV((s) => (s.city === '' ? s : { ...s, city: '' }));
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/plz/${v.postalCode}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((list: Locality[]) => {
        const unique = [...new Map(list.map((l) => [l.name, l])).values()];
        setLocalities(unique);
        if (unique.length === 0) setPlzWarning('PLZ nicht gefunden – bitte prüfen.');
        else {
          setPlzWarning(null);
          setV((s) => ({
            ...s,
            city: unique.length === 1 ? unique[0].name : unique.some((l) => l.name === s.city) ? s.city : '',
          }));
        }
      })
      .catch(() => { /* lookup is a convenience; free input stays possible */ });
    return () => ctrl.abort();
  }, [v.postalCode]);

  useEffect(() => {
    if (focusSeq === 0) return;
    for (const k of PAGE_ORDER) {
      if (!errors[k]) continue;
      const el = formRef.current?.querySelector<HTMLElement>(`[name="${k}"], [data-field="${k}"]`);
      if (el) { el.focus(); return; }
    }
    alertRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSeq]);

  useEffect(() => {
    if (status === 'success') successRef.current?.focus();
  }, [status]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'submitting') return;
    const payload = { ...v, idempotencyKey, fillMs: Math.min(Math.round(Date.now() - renderedAt.current), 604_800_000), isTest: attr.isTest, attribution: attr.attribution };
    const local = leadPayloadSchema.safeParse(payload);
    if (!local.success) {
      const errs = fieldErrors(local.error);
      setErrors(errs);
      setFocusSeq((n) => n + 1);
      return;
    }
    setErrors({});
    setStatus('submitting');
    setMessage(null);
    try {
      const res = await fetch('/api/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.status === 200 || res.status === 201 || res.status === 202) {
        setStatus('success');
        window.scrollTo({ top: 0 });
        return;
      }
      if (res.status === 422) {
        const json = (await res.json()) as { errors?: Record<string, string> };
        setErrors(json.errors ?? {});
        setFocusSeq((n) => n + 1);
        setStatus('idle');
        return;
      }
      const phone = process.env.NEXT_PUBLIC_CONTACT_PHONE;
      setStatus('error');
      setMessage(`Ihre Anfrage konnte gerade nicht gespeichert werden. Bitte versuchen Sie es später erneut${phone ? ` oder rufen Sie uns an: ${phone}` : ''}.`);
    } catch {
      setStatus('error');
      setMessage('Verbindung fehlgeschlagen – bitte erneut senden. Ihre Eingaben bleiben erhalten.');
    }
  }

  if (status === 'success') {
    return (
      <div role="status" className="rounded-2xl bg-emerald-50 p-6 text-stone-900">
        <h2 ref={successRef} tabIndex={-1} className="text-xl font-semibold outline-none">Vielen Dank, {v.firstName}!</h2>
        <p className="mt-2">
          Wir haben Ihre Anfrage erhalten.{' '}
          {isReservedEmailDomain(v.email)
            ? 'Testadresse erkannt – es wird keine Bestätigungs-E-Mail versendet.'
            : <>Wir senden Ihnen eine Bestätigung an <strong>{v.email}</strong>. Falls sie nicht ankommt, schauen Sie bitte auch im Spam-Ordner nach.</>}
        </p>
        <p className="mt-2">Unser Team prüft Ihren Standort und meldet sich in der Regel am nächsten Werktag telefonisch bei Ihnen.</p>
      </div>
    );
  }

  const err = (k: string) => errors[k];
  const aria = (k: string, hint?: string | null) => ({
    'aria-invalid': Boolean(err(k)),
    'aria-describedby': err(k) ? `${k}-error` : hint ? `${k}-hint` : undefined,
  });

  return (
    <form ref={formRef} method="post" onSubmit={onSubmit} noValidate className="space-y-8">
      {Object.keys(errors).length > 0 && (
        <div ref={alertRef} tabIndex={-1} role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{errors.form ?? "Bitte prüfen Sie die markierten Felder."}</div>
      )}

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-stone-900">Ihr Grundstück</legend>
        <label className="flex items-center gap-3 text-sm text-stone-800">
          <input type="checkbox" name="addressUnknown" className="size-5" checked={v.addressUnknown}
            onChange={(e) => set('addressUnknown', e.target.checked)} />
          Ich kenne die genaue Adresse noch nicht
        </label>

        {!v.addressUnknown && (
          <>
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <Field id="postalCode" label="PLZ" error={err('postalCode')} hint={plzWarning ?? undefined}>
                <input id="postalCode" name="postalCode" inputMode="numeric" autoComplete="off" maxLength={5} className={inputCls}
                  value={v.postalCode} onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ''))} {...aria('postalCode', plzWarning)} />
              </Field>
              <Field id="city" label="Ort" error={err('city')}>
                {localities.length > 1 ? (
                  <select id="city" name="city" className={inputCls} value={v.city} onChange={(e) => set('city', e.target.value)} {...aria('city')}>
                    <option value="">Bitte wählen</option>
                    {localities.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
                  </select>
                ) : (
                  <input id="city" name="city" autoComplete="off" className={inputCls} value={v.city} onChange={(e) => set('city', e.target.value)} {...aria('city')} />
                )}
              </Field>
            </div>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <Field id="street" label="Straße" error={err('street')}>
                <input id="street" name="street" autoComplete="off" className={inputCls} value={v.street} onChange={(e) => set('street', e.target.value)} {...aria('street')} />
              </Field>
              <Field id="houseNumber" label="Nr." error={err('houseNumber')}>
                <input id="houseNumber" name="houseNumber" autoComplete="off" maxLength={10} className={inputCls} value={v.houseNumber} onChange={(e) => set('houseNumber', e.target.value)} {...aria('houseNumber')} />
              </Field>
            </div>
            <p className="text-sm text-stone-500">Die Adresse des Grundstücks – nicht Ihre Wohnadresse, falls abweichend. Keine Hausnummer? Einfach leer lassen.</p>
          </>
        )}

        <Field id="plotNote" label={v.addressUnknown ? 'Wo liegt das Grundstück? (z. B. Ort, Straße, Flurstück)' : 'Weitere Angaben (optional), z. B. Flurstück'} error={err('plotNote')}>
          <textarea id="plotNote" name="plotNote" rows={3} maxLength={1000} className={inputCls} value={v.plotNote} onChange={(e) => set('plotNote', e.target.value)} {...aria('plotNote')} />
        </Field>

        <div>
          <p id="projectType-label" className="text-sm font-medium text-stone-800">Vorhaben (optional)</p>
          <div role="group" aria-labelledby="projectType-label" data-field="projectType" tabIndex={-1} className="mt-2 flex flex-wrap gap-2">
            {PROJECT_TYPES.map((t) => (
              <Chip key={t} active={v.projectType === t} onClick={() => set('projectType', v.projectType === t ? null : t)}>{PROJECT_TYPE_LABELS[t]}</Chip>
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-stone-900">Ihre Kontaktdaten</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="firstName" label="Vorname" error={err('firstName')}>
            <input id="firstName" name="firstName" autoComplete="given-name" className={inputCls} value={v.firstName} onChange={(e) => set('firstName', e.target.value)} {...aria('firstName')} />
          </Field>
          <Field id="lastName" label="Nachname" error={err('lastName')}>
            <input id="lastName" name="lastName" autoComplete="family-name" className={inputCls} value={v.lastName} onChange={(e) => set('lastName', e.target.value)} {...aria('lastName')} />
          </Field>
        </div>
        <Field id="phone" label="Telefon" error={err('phone')}>
          <input id="phone" name="phone" type="tel" autoComplete="tel" className={inputCls} value={v.phone} onChange={(e) => set('phone', e.target.value)} {...aria('phone')} />
        </Field>
        <Field id="email" label="E-Mail" error={err('email')}>
          <input id="email" name="email" type="email" autoComplete="email" className={inputCls} value={v.email} onChange={(e) => set('email', e.target.value)} {...aria('email')} />
        </Field>
        <div>
          <p id="reachability-label" className="text-sm font-medium text-stone-800">Wann sind Sie gut erreichbar? (optional)</p>
          <div role="group" aria-labelledby="reachability-label" data-field="reachability" tabIndex={-1} className="mt-2 flex flex-wrap gap-2">
            {REACHABILITY.map((r) => (
              <Chip key={r} active={v.reachability.includes(r)}
                onClick={() => set('reachability', v.reachability.includes(r) ? v.reachability.filter((x) => x !== r) : [...v.reachability, r])}>
                {REACHABILITY_LABELS[r]}
              </Chip>
            ))}
          </div>
        </div>
      </fieldset>

      <div aria-hidden="true" inert className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" value={v.website} onChange={(e) => set('website', e.target.value)} />
      </div>

      {status === 'error' && message && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{message}</div>}

      <div className="space-y-3">
        <button type="submit" disabled={!ready || status === 'submitting'}
          className="min-h-12 w-full rounded-lg bg-emerald-800 px-4 text-base font-semibold text-white disabled:opacity-60">
          {!ready ? 'Wird geladen …' : status === 'submitting' ? 'Wird gesendet …' : 'Kostenlosen Standort-Check anfordern'}
        </button>
        <p className="text-xs text-stone-500">
          Wir verwenden Ihre Angaben ausschließlich zur Bearbeitung Ihrer Anfrage. Details in unseren{' '}
          <a href="/datenschutz" target="_blank" rel="noopener" className="underline">Datenschutzhinweisen</a>.
        </p>
      </div>
    </form>
  );
}
