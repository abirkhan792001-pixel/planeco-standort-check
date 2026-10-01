import type { OpenPlzLocality } from './types';

export const STATE_CODES: Record<string, string> = {
  '01': 'DE-SH', '02': 'DE-HH', '03': 'DE-NI', '04': 'DE-HB', '05': 'DE-NW', '06': 'DE-HE', '07': 'DE-RP', '08': 'DE-BW',
  '09': 'DE-BY', '10': 'DE-SL', '11': 'DE-BE', '12': 'DE-BB', '13': 'DE-MV', '14': 'DE-SN', '15': 'DE-ST', '16': 'DE-TH',
};

export type LocalitySummary = {
  name: string; municipality: string | null; municipalityKey: string | null; district: string | null; stateCode: string | null;
};

export function toLocalitySummary(l: OpenPlzLocality): LocalitySummary {
  return {
    name: l.name,
    municipality: l.municipality?.name ?? null,
    municipalityKey: l.municipality?.key ?? null,
    district: l.district?.name ?? null,
    stateCode: STATE_CODES[l.federalState.key] ?? null,
  };
}

/** Returns [] for an unknown postcode; throws on network/HTTP errors (caller decides whether to retry). */
export async function lookupPostalCode(plz: string): Promise<OpenPlzLocality[]> {
  if (!/^\d{5}$/.test(plz)) return [];
  const res = await fetch(`https://openplzapi.org/de/Localities?postalCode=${plz}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`openplz ${res.status}`);
  return (await res.json()) as OpenPlzLocality[];
}
