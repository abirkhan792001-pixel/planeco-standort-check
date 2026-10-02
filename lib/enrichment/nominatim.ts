import 'server-only';
import { EnrichmentHttpError } from './errors';
import { buildStructuredQuery, buildUserAgent, type StructuredAddress } from './query';
import type { NominatimHit } from './types';

const MIN_GAP_MS = 1100;
let lastRequestAt = 0;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function politeGet(params: Record<string, string>): Promise<NominatimHit[]> {
  // Fail on a missing contact before reserving a slot or touching the network.
  const userAgent = buildUserAgent(process.env.APP_BASE_URL ?? 'https://planeco-standort-check.vercel.app', process.env.NOMINATIM_CONTACT);

  // Reserve the slot synchronously (before any await): concurrent callers each get their own, ≥ 1.1 s apart.
  const slot = Math.max(Date.now(), lastRequestAt + MIN_GAP_MS);
  lastRequestAt = slot;
  await sleep(slot - Date.now());

  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ ...params, format: 'jsonv2', addressdetails: '1' })}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent, 'Accept-Language': 'de' },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new EnrichmentHttpError('nominatim', res.status);
  return (await res.json()) as NominatimHit[];
}

/** `plzKnown`: OpenPLZ recognised the PLZ. If not (A-5), the postalcode parameter is omitted. */
export function searchStructured(a: StructuredAddress, plzKnown: boolean) {
  return politeGet(buildStructuredQuery(a, plzKnown));
}

export function searchFreeText(q: string) {
  return politeGet({ q: `${q}, Deutschland`, countrycodes: 'de', limit: '5' });
}

export async function searchPostalCodeCentroid(plz: string): Promise<{ lat: number; lon: number } | null> {
  const hits = await politeGet({ postalcode: plz, country: 'de', limit: '1' });
  return hits[0] ? { lat: Number(hits[0].lat), lon: Number(hits[0].lon) } : null;
}
