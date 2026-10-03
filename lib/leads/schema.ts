import { z } from 'zod';
import { ATTRIBUTION_KEYS } from '@/lib/attribution/types';
import { toAsciiDigits } from './normalize';
import { PROJECT_TYPES, REACHABILITY } from './types';

const NUL = String.fromCharCode(0);
const BAD_CHARS = 'Ungültige Zeichen';
const noNul = (v: string) => !v.includes(NUL);
const stripNul = (v: string) => v.split(NUL).join('');
const IDN_DOMAIN = 'Bitte E-Mail ohne Umlaute in der Domain eingeben';
/** Spec E-7 / S7: IDN domains are rejected. Judged only when there is an "@"; anything else gets the generic email error. */
const asciiDomain = (v: string) => {
  const at = v.lastIndexOf('@');
  return at < 0 || !/[^\u0000-\u007f]/.test(v.slice(at + 1));
};

const optText = (max: number) => z.string().trim().max(max).refine(noNul, BAD_CHARS).default('');
// Attribution values and the honeypot are not user-facing: NULs are stripped silently instead of rejected.
const attrValue = z.string().trim().max(500).transform(stripNul).nullable().optional();

const attributionSchema = z.object(
  Object.fromEntries([...ATTRIBUTION_KEYS, 'landing_path', 'referrer'].map((k) => [k, attrValue])) as Record<string, typeof attrValue>,
).default({});

export const leadPayloadSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    // Client-measured fill duration (Date.now() - renderedAt on the client's own clock): immune to clock skew.
    fillMs: z.number().int().min(0).max(86_400_000 * 7),
    website: z.string().max(200).transform(stripNul).default(''),
    isTest: z.boolean().default(false),
    firstName: z.string().trim().min(1, 'Bitte Vornamen angeben').max(100, 'Maximal 100 Zeichen').refine(noNul, BAD_CHARS),
    lastName: z.string().trim().min(1, 'Bitte Nachnamen angeben').max(100, 'Maximal 100 Zeichen').refine(noNul, BAD_CHARS),
    // The IDN check sits before .email() so its message is the first one for the field (fieldErrors keeps the first).
    email: z.string().trim().max(254).refine(asciiDomain, IDN_DOMAIN).email('Bitte eine gültige E-Mail-Adresse angeben').refine(noNul, BAD_CHARS),
    phone: z.string().trim().max(40).refine(noNul, BAD_CHARS).refine((v) => {
      if (v.includes('@')) return false; // an email address typed into the phone field (P-8), even one with 6+ digits
      const digits = toAsciiDigits(v).replace(/\D/g, '').length;
      return digits >= 6 && digits <= 15;
    }, 'Bitte eine Telefonnummer angeben, unter der wir Sie erreichen'),
    reachability: z.array(z.enum(REACHABILITY)).max(3).default([]),
    addressUnknown: z.boolean().default(false),
    street: optText(120),
    houseNumber: optText(10),
    postalCode: optText(5),
    city: optText(100),
    plotNote: optText(1000),
    projectType: z.enum(PROJECT_TYPES).nullable().default(null),
    attribution: attributionSchema,
  })
  .superRefine((v, ctx) => {
    if (v.addressUnknown) {
      // Code points, not UTF-16 units: Postgres char_length counts code points (CHECK plot_present).
      if ([...v.plotNote].length < 3) ctx.addIssue({ code: 'custom', path: ['plotNote'], message: 'Bitte beschreiben Sie kurz, wo das Grundstück liegt' });
      return;
    }
    if (!v.street) ctx.addIssue({ code: 'custom', path: ['street'], message: 'Bitte Straße angeben' });
    if (!/^\d{5}$/.test(v.postalCode)) ctx.addIssue({ code: 'custom', path: ['postalCode'], message: 'Bitte eine 5-stellige deutsche PLZ angeben – wir prüfen nur Grundstücke in Deutschland' });
    if (!v.city) ctx.addIssue({ code: 'custom', path: ['city'], message: 'Bitte Ort angeben' });
  });

export type LeadPayload = z.infer<typeof leadPayloadSchema>;
export type LeadPayloadInput = z.input<typeof leadPayloadSchema>;

/** First message per top-level field, for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
