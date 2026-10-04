'use client';

import { useEffect, useRef, useState } from 'react';
import { captureAttribution } from '@/lib/attribution/capture';
import type { RawAttribution } from '@/lib/attribution/types';
import { isReservedEmailDomain } from '@/lib/config/app';
import { PROJECT_TYPE_LABELS, REACHABILITY_HOURS, REACHABILITY_LABELS } from '@/lib/labels';
import { PROJECT_TYPES, REACHABILITY, type ProjectType, type Reachability } from '@/lib/leads/types';
import { firstErrorStep, STEP_FIELDS, STEP_TITLES, STEPS, validateAll, validateStep, type Step } from '@/lib/leads/wizard';
import { ErrorIcon, FieldNote, focusRing, OptionCard, PhoneIcon, PillButton, SelectField, Spinner, TextArea, TextField, ToggleChip } from './form-ui';
import { LogoBadge, PlanecoMark, TrustBadges } from './landing/brand';
import { GermanyMap } from './landing/germany-map';
import { PROJECT_ICONS } from './landing/project-icons';

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

const WEBSITE_URL = 'https://www.planecobuilding.de/';
const headingCls = 'text-center text-3xl font-bold tracking-tight text-ink outline-none sm:text-4xl';

/** The three form steps and the success page (landing spec §10). `step`/`onStep` are owned by StandortFlow. */
export function LeadForm({ step, active, onStep }: { step: Step; active: boolean; onStep: (next: 0 | Step) => void }) {
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
  const headingRef = useRef<HTMLHeadingElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const [focusSeq, setFocusSeq] = useState(0);
  const shown = useRef({ step, active });

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

  // A new step (or the form becoming visible) moves focus to its question, so screen readers announce it.
  useEffect(() => {
    const changed = shown.current.step !== step || shown.current.active !== active;
    shown.current = { step, active };
    if (active && changed) headingRef.current?.focus();
  }, [step, active]);

  // After a failed check, focus the first broken field of the (possibly new) current step. Runs after the effect above.
  useEffect(() => {
    if (focusSeq === 0) return;
    for (const k of STEP_FIELDS[step]) {
      if (!errors[k]) continue;
      const el = formRef.current?.querySelector<HTMLElement>(`[name="${k}"], [data-field="${k}"]`);
      if (el) { el.focus(); return; }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSeq]);

  useEffect(() => {
    if (status === 'success') successRef.current?.focus();
  }, [status]);

  const payload = () => ({
    ...v, idempotencyKey, fillMs: Math.min(Math.round(Date.now() - renderedAt.current), 604_800_000), isTest: attr.isTest, attribution: attr.attribution,
  });

  const showErrors = (errs: Record<string, string>) => {
    setErrors(errs);
    const target = firstErrorStep(errs);
    if (target !== null && target !== step) onStep(target);
    setFocusSeq((n) => n + 1);
  };

  const chooseProject = (t: ProjectType) => {
    set('projectType', t);
    onStep(2);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'submitting') return;
    const p = payload();
    if (step < 3) {
      const errs = validateStep(step, p);
      if (Object.keys(errs).length > 0) { showErrors(errs); return; }
      setErrors({});
      onStep((step + 1) as Step);
      return;
    }
    const errs = validateAll(p);
    if (Object.keys(errs).length > 0) { showErrors(errs); return; }
    setErrors({});
    setStatus('submitting');
    setMessage(null);
    try {
      const res = await fetch('/api/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) });
      if (res.status === 200 || res.status === 201 || res.status === 202) {
        setStatus('success');
        window.scrollTo({ top: 0 });
        return;
      }
      if (res.status === 422) {
        const json = (await res.json()) as { errors?: Record<string, string> };
        setStatus('idle');
        showErrors(json.errors ?? {});
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
      <section className="mx-auto max-w-2xl px-4 pb-16 pt-6 text-center sm:px-6">
        <LogoBadge />
        <div role="status">
          <h1 ref={successRef} tabIndex={-1} className={headingCls}>
            Perfekt! Wir haben Ihre Anfrage erhalten. <span aria-hidden="true">🎉</span>
          </h1>
          <p className="mt-3 text-xl text-muted">Vielen Dank, {v.firstName} – wir helfen Ihnen gerne.</p>
          <p className="mx-auto mt-10 max-w-xl">
            {isReservedEmailDomain(v.email)
              ? 'Testadresse erkannt – es wird keine Bestätigungs-E-Mail versendet.'
              : <>Wir senden Ihnen eine Bestätigung an <strong>{v.email}</strong>. Falls sie nicht ankommt, schauen Sie bitte auch im Spam-Ordner nach.</>}
          </p>
          <p className="mx-auto mt-3 max-w-xl">Unser Team prüft Ihren Standort und meldet sich in der Regel am nächsten Werktag telefonisch bei Ihnen.</p>
        </div>
        <a href={WEBSITE_URL} className={`mt-12 inline-flex min-h-11 items-center gap-3 text-lg font-semibold text-muted transition-colors hover:text-ink ${focusRing}`}>
          Zurück zur Website
          <span aria-hidden="true" className="grid size-7 place-items-center rounded bg-ink">
            <PlanecoMark className="h-4 w-auto brightness-0 invert" />
          </span>
        </a>
      </section>
    );
  }

  const err = (k: string) => errors[k];
  const aria = (k: string, hint?: string | null) => ({
    'aria-invalid': Boolean(err(k)),
    'aria-describedby': err(k) ? `${k}-error` : hint ? `${k}-hint` : undefined,
  });
  const formMessage = errors.form ?? (status === 'error' ? message : null);

  return (
    <form ref={formRef} method="post" onSubmit={onSubmit} noValidate className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
      <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-ink/10">
        <div className="h-full rounded-full bg-ink transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(step / STEPS.length) * 100}%` }} />
      </div>
      <p className="mt-3 text-center text-sm text-muted">Schritt {step} von {STEPS.length}</p>
      <div className="mt-6"><LogoBadge /></div>
      <h1 id="step-title" ref={headingRef} tabIndex={-1} className={headingCls}>{STEP_TITLES[step]}</h1>

      {step === 1 && (
        <div className="mt-10">
          <div role="group" aria-labelledby="step-title" data-field="projectType" tabIndex={-1}
            aria-describedby={err('projectType') ? 'projectType-error' : undefined} className="space-y-3">
            {PROJECT_TYPES.map((t) => (
              <OptionCard key={t} active={v.projectType === t} icon={PROJECT_ICONS[t]} onClick={() => chooseProject(t)}>
                {PROJECT_TYPE_LABELS[t]}
              </OptionCard>
            ))}
          </div>
          <FieldNote id="projectType" error={err('projectType')} />
        </div>
      )}

      {step === 2 && (
        <div className="mt-10 grid items-center gap-8 md:grid-cols-[11rem_1fr]">
          <GermanyMap className="mx-auto hidden w-40 md:block" />
          <div className="space-y-4">
            <label className="flex min-h-11 items-center gap-3 text-base text-ink">
              <input type="checkbox" name="addressUnknown" className="size-5 accent-ink" checked={v.addressUnknown}
                onChange={(e) => set('addressUnknown', e.target.checked)} />
              Ich kenne die genaue Adresse noch nicht
            </label>
            {!v.addressUnknown && (
              <>
                <div className="grid grid-cols-[7.5rem_1fr] gap-3">
                  <TextField id="postalCode" name="postalCode" label="PLZ" inputMode="numeric" autoComplete="off" maxLength={5}
                    value={v.postalCode} onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ''))}
                    error={err('postalCode')} hint={plzWarning ?? undefined} {...aria('postalCode', plzWarning)} />
                  {localities.length > 1 ? (
                    <SelectField id="city" name="city" label="Ort" value={v.city} onChange={(e) => set('city', e.target.value)} error={err('city')} {...aria('city')}>
                      <option value="">Bitte wählen</option>
                      {localities.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
                    </SelectField>
                  ) : (
                    <TextField id="city" name="city" label="Ort" autoComplete="off" value={v.city} onChange={(e) => set('city', e.target.value)}
                      error={err('city')} {...aria('city')} />
                  )}
                </div>
                <div className="grid grid-cols-[1fr_6.5rem] gap-3">
                  <TextField id="street" name="street" label="Straße" autoComplete="off" value={v.street} onChange={(e) => set('street', e.target.value)}
                    error={err('street')} {...aria('street')} />
                  <TextField id="houseNumber" name="houseNumber" label="Nr." autoComplete="off" maxLength={10} value={v.houseNumber}
                    onChange={(e) => set('houseNumber', e.target.value)} error={err('houseNumber')} {...aria('houseNumber')} />
                </div>
                <p className="text-sm text-muted">Die Adresse des Grundstücks – nicht Ihre Wohnadresse, falls abweichend. Keine Hausnummer? Einfach leer lassen.</p>
              </>
            )}
            <TextArea id="plotNote" name="plotNote" rows={3} maxLength={1000}
              label={v.addressUnknown ? 'Wo liegt das Grundstück? (z. B. Ort, Straße, Flurstück)' : 'Weitere Angaben (optional), z. B. Flurstück'}
              value={v.plotNote} onChange={(e) => set('plotNote', e.target.value)} error={err('plotNote')} {...aria('plotNote')} />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-10 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField id="firstName" name="firstName" label="Vorname" autoComplete="given-name" value={v.firstName}
              onChange={(e) => set('firstName', e.target.value)} error={err('firstName')} {...aria('firstName')} />
            <TextField id="lastName" name="lastName" label="Nachname" autoComplete="family-name" value={v.lastName}
              onChange={(e) => set('lastName', e.target.value)} error={err('lastName')} {...aria('lastName')} />
          </div>
          <TextField id="email" name="email" type="email" label="E-Mail-Adresse" autoComplete="email" value={v.email}
            onChange={(e) => set('email', e.target.value)} error={err('email')} {...aria('email')} />
          <TextField id="phone" name="phone" type="tel" label="Telefonnummer" autoComplete="tel" icon={<PhoneIcon />} value={v.phone}
            onChange={(e) => set('phone', e.target.value)} error={err('phone')} {...aria('phone')} />
          <div className="pt-2">
            <p id="reachability-label" className="text-sm font-medium text-ink">Wann sind Sie gut erreichbar? (optional)</p>
            <div role="group" aria-labelledby="reachability-label" data-field="reachability" tabIndex={-1} className="mt-2 flex flex-wrap gap-2">
              {REACHABILITY.map((r) => (
                <ToggleChip key={r} active={v.reachability.includes(r)}
                  onClick={() => set('reachability', v.reachability.includes(r) ? v.reachability.filter((x) => x !== r) : [...v.reachability, r])}>
                  {REACHABILITY_LABELS[r]} <span className="font-normal">· {REACHABILITY_HOURS[r]}</span>
                </ToggleChip>
              ))}
            </div>
          </div>
        </div>
      )}

      <div aria-hidden="true" inert className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" value={v.website} onChange={(e) => set('website', e.target.value)} />
      </div>

      {formMessage && <p role="alert" className="mt-8 flex items-start justify-center gap-1.5 text-center text-sm text-red-700"><ErrorIcon />{formMessage}</p>}

      {step > 1 && (
        <div className="mt-8 space-y-4">
          <PillButton type="submit" disabled={!ready || status === 'submitting'}>
            {!ready ? 'Wird geladen …' : step === 2 ? 'Weiter' : status === 'submitting' ? <><Spinner />Wird gesendet …</> : 'Kostenlosen Standort-Check anfordern'}
          </PillButton>
          {step === 3 && (
            <p className="text-center text-sm text-muted">
              Wir verwenden Ihre Angaben ausschließlich zur Bearbeitung Ihrer Anfrage. Details in unseren{' '}
              <a href="/datenschutz" target="_blank" rel="noopener" className="font-medium text-ink underline underline-offset-2">Datenschutzhinweisen</a>.
            </p>
          )}
        </div>
      )}

      <div className="mt-6 text-center">
        <button type="button" onClick={() => onStep(step === 1 ? 0 : ((step - 1) as Step))}
          className={`inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted underline-offset-2 hover:text-ink hover:underline ${focusRing}`}>
          <span aria-hidden="true">←</span> Zurück
        </button>
      </div>

      {step === 3 && <TrustBadges className="mt-12 justify-center" />}
    </form>
  );
}
