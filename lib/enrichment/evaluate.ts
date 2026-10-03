import { normalizeHouseNumber, normalizePlace, normalizeStreet } from '@/lib/leads/normalize';
import { STATE_CODES } from './openplz';
import type { NominatimHit, OpenPlzLocality } from './types';

export type Precision = 'house' | 'street' | 'postcode' | 'locality' | 'none';
export type GeoFlag =
  | 'plz_not_found' | 'city_plz_mismatch' | 'plz_multiple_municipalities' | 'street_not_found'
  | 'house_not_found' | 'plz_mismatch' | 'ambiguous' | 'address_unknown' | 'cadastral_only';
export type GeoInput = {
  addressUnknown: boolean; street: string | null; houseNumber: string | null; postalCode: string | null; city: string | null;
  /** Free-text plot description; only read for unknown addresses (cadastral_only detection). */
  plotNote?: string | null;
};
export type Candidate = { label: string; municipality: string | null; stateCode: string | null; postcode: string | null; lat: number; lon: number };
export type EnrichmentResult = {
  precision: Precision; lat: number | null; lon: number | null;
  municipality: string | null; municipalityKey: string | null; district: string | null; stateCode: string | null;
  foundPostcode: string | null; flags: GeoFlag[]; candidates: Candidate[] | null;
};

const hitMunicipality = (h: NominatimHit) => h.address.city ?? h.address.town ?? h.address.village ?? h.address.municipality ?? null;
const hitState = (h: NominatimHit) => h.address['ISO3166-2-lvl4'] ?? null; // never address.state (missing for Hamburg)

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Parcel numbers cannot be geocoded; spec §15.1 flags such descriptions as cadastral_only. */
const CADASTRAL = /flurst(ü|ue)ck|gemarkung|flur\s*\d/i;

// normalizeHouseNumber also folds typographic dashes, so "14–16" equals "14-16".
const houseKey = normalizeHouseNumber;

/**
 * Keys a hit's house number can be matched by: the whole value ("14-16", "14/1") plus its parts when it lists several
 * numbers ("14;16", "14,16", "14/16"). An input "14" therefore does not match a range "14-16" (conservative).
 */
function houseKeys(raw: string | undefined): string[] {
  if (!raw) return [];
  return [houseKey(raw), ...raw.split(/[,;/]/).map(houseKey)].filter(Boolean);
}

/** True if the hit's postcode (possibly "20095;20097") has a part equal to `plz`. */
const postcodeMatches = (hit: NominatimHit, plz: string | null) =>
  !!plz && (hit.address.postcode ?? '').split(/[,;]/).some((part) => part.trim() === plz);

function streetMatches(input: string, found: string): boolean {
  if (!input || !found) return false;
  return input === found || (input.length >= 10 && levenshtein(input, found) <= 2);
}

function groupByMunicipality(hits: NominatimHit[]): Map<string, NominatimHit[]> {
  const groups = new Map<string, NominatimHit[]>();
  for (const h of hits) {
    const key = `${normalizePlace(hitMunicipality(h) ?? h.display_name ?? '')}|${hitState(h) ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), h]);
  }
  return groups;
}

const toCandidate = (h: NominatimHit): Candidate => ({
  label: [h.address.road, h.address.house_number, h.address.postcode, hitMunicipality(h)].filter(Boolean).join(' '),
  municipality: hitMunicipality(h), stateCode: hitState(h), postcode: h.address.postcode ?? null,
  lat: Number(h.lat), lon: Number(h.lon),
});

/** Pure. Spec §15.1. `plz` is null when no postcode was given; [] when OpenPLZ does not know it. */
export function evaluateGeocode(input: GeoInput, plz: OpenPlzLocality[] | null, hits: NominatimHit[]): EnrichmentResult {
  const flags = new Set<GeoFlag>();
  const result: EnrichmentResult = {
    precision: 'none', lat: null, lon: null, municipality: null, municipalityKey: null, district: null,
    stateCode: null, foundPostcode: null, flags: [], candidates: null,
  };
  const done = () => ({ ...result, flags: [...flags] });

  let plzPick: OpenPlzLocality | null = null;
  if (!input.addressUnknown && plz !== null) {
    if (plz.length === 0) flags.add('plz_not_found');
    else {
      if (new Set(plz.map((l) => l.municipality?.key ?? l.name)).size > 1) flags.add('plz_multiple_municipalities');
      const typed = normalizePlace(input.city ?? '');
      plzPick = plz.find((l) => normalizePlace(l.name) === typed) ?? null;
      if (!plzPick) {
        flags.add('city_plz_mismatch');
        plzPick = plz[0];
      }
      result.municipality = plzPick.municipality?.name.split(',')[0] ?? plzPick.name;
      result.municipalityKey = plzPick.municipality?.key ?? null;
      result.district = plzPick.district?.name ?? null;
      result.stateCode = STATE_CODES[plzPick.federalState.key] ?? null;
      if (result.municipality !== plzPick.name && normalizePlace(plzPick.name) === typed) result.municipality = plzPick.name;
    }
  }

  if (input.addressUnknown) {
    flags.add('address_unknown');
    if (input.plotNote && CADASTRAL.test(input.plotNote.normalize('NFC'))) flags.add('cadastral_only');
    const groups = groupByMunicipality(hits);
    if (groups.size === 0) return done();
    if (groups.size > 1) {
      flags.add('ambiguous');
      result.candidates = [...groups.values()].map((g) => toCandidate(g[0])).slice(0, 5);
      return done();
    }
    const top = hits[0];
    Object.assign(result, {
      precision: 'locality', lat: Number(top.lat), lon: Number(top.lon),
      municipality: hitMunicipality(top), stateCode: hitState(top), foundPostcode: top.address.postcode ?? null,
    });
    return done();
  }

  const street = normalizeStreet(input.street ?? '');
  const verified = hits.filter((h) => streetMatches(street, normalizeStreet(h.address.road ?? '')));

  if (verified.length === 0) {
    flags.add('street_not_found');
    if (plzPick) result.precision = 'postcode'; // coordinates come from the PLZ centroid (orchestrator)
    return done();
  }

  const groups = groupByMunicipality(verified);
  if (groups.size > 1) {
    flags.add('ambiguous');
    result.candidates = [...groups.values()].map((g) => toCandidate(g[0])).slice(0, 5);
    return done();
  }

  // Best hit: prefer one at the typed PLZ, then one with the typed house number, else the first verified hit.
  const atPlz = verified.filter((h) => postcodeMatches(h, input.postalCode));
  const pool = atPlz.length > 0 ? atPlz : verified;
  const hn = input.houseNumber ? houseKey(input.houseNumber) : null;
  const withHouse = hn ? pool.find((h) => houseKeys(h.address.house_number).includes(hn)) : undefined;
  const best = withHouse ?? pool[0];
  if (hn && !withHouse) flags.add('house_not_found');
  const found = best.address.postcode ?? null;
  if (found && input.postalCode && !postcodeMatches(best, input.postalCode)) flags.add('plz_mismatch');

  // municipalityKey and district belong to the OpenPLZ pick. A verified hit in another municipality (typed city and PLZ
  // contradict each other, A-6) would otherwise be reported with the key and district of the wrong one.
  const hitPlace = hitMunicipality(best);
  if (plzPick && hitPlace) {
    const pickNames = [plzPick.municipality?.name.split(',')[0], plzPick.name].map((n) => normalizePlace(n ?? ''));
    if (!pickNames.includes(normalizePlace(hitPlace))) {
      result.municipalityKey = null;
      result.district = null;
    }
  }

  Object.assign(result, {
    precision: withHouse ? 'house' : 'street',
    lat: Number(best.lat), lon: Number(best.lon),
    municipality: hitMunicipality(best) ?? result.municipality,
    stateCode: hitState(best) ?? result.stateCode,
    foundPostcode: found,
  });
  return done();
}
