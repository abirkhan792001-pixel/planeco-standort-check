import { describe, expect, it } from 'vitest';
import { REACHABILITY_HOURS } from '@/lib/labels';
import { REACHABILITY } from '@/lib/leads/types';
import { firstErrorStep, PROJECT_TYPE_REQUIRED, STEP_FIELDS, STEP_TITLES, stepOf, validateAll, validateStep } from '@/lib/leads/wizard';
import { validPayload } from '../fixtures/payload';

const empty = {
  ...validPayload, projectType: null, addressUnknown: false, postalCode: '', city: '', street: '', houseNumber: '', plotNote: '',
  firstName: '', lastName: '', email: '', phone: '', reachability: [],
};

describe('step map', () => {
  it('every visible field belongs to exactly one step', () => {
    const all = Object.values(STEP_FIELDS).flat();
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(
      ['addressUnknown', 'city', 'email', 'firstName', 'houseNumber', 'lastName', 'phone', 'plotNote', 'postalCode', 'projectType', 'reachability', 'street'].sort());
  });
  it('stepOf maps fields; unknown keys such as "form" belong to the last step', () => {
    expect(stepOf('projectType')).toBe(1);
    expect(stepOf('street')).toBe(2);
    expect(stepOf('email')).toBe(3);
    expect(stepOf('form')).toBe(3);
  });
  it('step titles', () =>
    expect(STEP_TITLES).toEqual({ 1: 'Worum geht es bei Ihrem Vorhaben?', 2: 'Wo liegt Ihr Grundstück?', 3: 'Wie erreichen wir Sie?' }));
});

describe('validateStep', () => {
  it('step 1 requires a project type (UI rule; the API keeps it optional)', () => {
    expect(validateStep(1, empty)).toEqual({ projectType: PROJECT_TYPE_REQUIRED });
    expect(validateStep(1, { ...empty, projectType: 'sonstiges' })).toEqual({});
  });
  it('step 2 reports the address errors even while the contact fields are still empty', () =>
    expect(Object.keys(validateStep(2, empty)).sort()).toEqual(['city', 'postalCode', 'street']));
  it('step 2 with an unknown address needs a plot note', () => {
    expect(validateStep(2, { ...empty, addressUnknown: true })).toEqual({ plotNote: 'Bitte beschreiben Sie kurz, wo das Grundstück liegt' });
    expect(validateStep(2, { ...empty, addressUnknown: true, plotNote: 'Flurstück 12 bei Lübeck' })).toEqual({});
  });
  it('step 3 reports only contact errors', () =>
    expect(Object.keys(validateStep(3, empty)).sort()).toEqual(['email', 'firstName', 'lastName', 'phone']));
  it('a valid payload passes every step', () => {
    for (const s of [1, 2, 3] as const) expect(validateStep(s, validPayload)).toEqual({});
  });
});

describe('validateAll and firstErrorStep', () => {
  it('collect every step and find the earliest one with an error', () => {
    const e = validateAll(empty);
    expect(e.projectType).toBe(PROJECT_TYPE_REQUIRED);
    expect(e.street).toBeDefined();
    expect(e.email).toBeDefined();
    expect(firstErrorStep(e)).toBe(1);
    expect(firstErrorStep({ email: 'x', street: 'y' })).toBe(2);
    expect(firstErrorStep({ form: 'x' })).toBe(3);
    expect(firstErrorStep({})).toBeNull();
    expect(validateAll(validPayload)).toEqual({});
  });
});

describe('reachability hours (display only)', () => {
  it('one German time range per option, in option order', () => {
    expect(Object.keys(REACHABILITY_HOURS)).toEqual([...REACHABILITY]);
    expect(REACHABILITY_HOURS).toEqual({ vormittags: '8–12 Uhr', nachmittags: '12–17 Uhr', abends: '17–20 Uhr' });
  });
});
