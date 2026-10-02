// No 'server-only' import on purpose: these builders are pure and unit-tested.
import { EnrichmentConfigError } from './errors';

export type StructuredAddress = { street: string; houseNumber: string | null; postalCode: string; city: string };

/**
 * Nominatim structured-search parameters (spec §15.1). `plzKnown` is true only when OpenPLZ recognised the PLZ:
 * for an unknown PLZ (A-5) the `postalcode` parameter is left out and the search runs on street + number + city.
 */
export function buildStructuredQuery(a: StructuredAddress, plzKnown: boolean): Record<string, string> {
  const query: Record<string, string> = {
    street: `${a.houseNumber ?? ''} ${a.street}`.trim(),
    city: a.city,
    country: 'de',
    limit: '5',
  };
  if (plzKnown && a.postalCode) query.postalcode = a.postalCode;
  return query;
}

// Header values must stay on one line; also drops the other control characters.
const CONTROL = /[\u0000-\u001f\u007f]+/g;
const oneLine = (s: string) => s.replace(CONTROL, ' ').trim();

/**
 * `standort-check-case/1.0 (+{base}; {contact})`. Nominatim's usage policy requires a way to reach the operator, so a
 * missing contact is a configuration error (stored as `config_missing_contact`), never a contact-less User-Agent.
 */
export function buildUserAgent(baseUrl: string, contact: string | undefined): string {
  const cleanContact = oneLine(contact ?? '');
  if (!cleanContact) throw new EnrichmentConfigError('config_missing_contact');
  return `standort-check-case/1.0 (+${oneLine(baseUrl)}; ${cleanContact})`;
}
