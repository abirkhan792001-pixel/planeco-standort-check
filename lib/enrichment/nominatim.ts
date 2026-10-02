import 'server-only';
import type { NominatimHit } from './types';

let lastRequestAt = 0;

async function politeGet(params: Record<string, string>): Promise<NominatimHit[]> {
  const wait = lastRequestAt + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();

  const base = process.env.APP_BASE_URL ?? 'https://planeco-standort-check.vercel.app';
  const contact = process.env.NOMINATIM_CONTACT ?? '';
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ ...params, format: 'jsonv2', addressdetails: '1' })}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': `standort-check-case/1.0 (+${base}; ${contact})`, 'Accept-Language': 'de' },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  return (await res.json()) as NominatimHit[];
}

export function searchStructured(a: { street: string; houseNumber: string | null; postalCode: string; city: string }) {
  return politeGet({ street: `${a.houseNumber ?? ''} ${a.street}`.trim(), postalcode: a.postalCode, city: a.city, country: 'de', limit: '5' });
}

export function searchFreeText(q: string) {
  return politeGet({ q: `${q}, Deutschland`, countrycodes: 'de', limit: '5' });
}

export async function searchPostalCodeCentroid(plz: string): Promise<{ lat: number; lon: number } | null> {
  const hits = await politeGet({ postalcode: plz, country: 'de', limit: '1' });
  return hits[0] ? { lat: Number(hits[0].lat), lon: Number(hits[0].lon) } : null;
}
