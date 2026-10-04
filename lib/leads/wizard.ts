import { fieldErrors, leadPayloadSchema } from './schema';

/** The three form steps after the start screen (landing spec §10). */
export const STEPS = [1, 2, 3] as const;
export type Step = (typeof STEPS)[number];

/** The fields each step shows, in on-screen (= focus) order. */
export const STEP_FIELDS: Record<Step, readonly string[]> = {
  1: ['projectType'],
  2: ['addressUnknown', 'postalCode', 'city', 'street', 'houseNumber', 'plotNote'],
  3: ['firstName', 'lastName', 'email', 'phone', 'reachability'],
};

export const STEP_TITLES: Record<Step, string> = {
  1: 'Worum geht es bei Ihrem Vorhaben?',
  2: 'Wo liegt Ihr Grundstück?',
  3: 'Wie erreichen wir Sie?',
};

/** UI rule for step 1 only: the cards advance on click, so a choice is required there. The API keeps it optional. */
export const PROJECT_TYPE_REQUIRED = 'Bitte wählen Sie Ihr Vorhaben.';

/** The step that shows `field`; keys no step shows (e.g. "form") belong to the last step. */
export function stepOf(field: string): Step {
  for (const s of STEPS) if (STEP_FIELDS[s].includes(field)) return s;
  return 3;
}

function schemaErrors(payload: Record<string, unknown>): Record<string, string> {
  const res = leadPayloadSchema.safeParse(payload);
  return res.success ? {} : fieldErrors(res.error);
}

/** Errors of one step: the full schema runs (cross-field rules stay in one place); only this step's fields are kept. */
export function validateStep(step: Step, payload: Record<string, unknown>): Record<string, string> {
  const own: Record<string, string> = {};
  for (const [k, msg] of Object.entries(schemaErrors(payload))) if (STEP_FIELDS[step].includes(k)) own[k] = msg;
  if (step === 1 && payload.projectType == null) own.projectType = PROJECT_TYPE_REQUIRED;
  return own;
}

/** Everything that blocks sending: every step's errors plus anything else the schema reports (key kept as is). */
export function validateAll(payload: Record<string, unknown>): Record<string, string> {
  const all = schemaErrors(payload);
  if (payload.projectType == null && !all.projectType) all.projectType = PROJECT_TYPE_REQUIRED;
  return all;
}

/** The earliest step that has one of `errors`, or null when there are none. */
export function firstErrorStep(errors: Record<string, string>): Step | null {
  const keys = Object.keys(errors);
  return keys.length ? (Math.min(...keys.map(stepOf)) as Step) : null;
}
