import { describe, it, expect } from 'vitest';
import { assessServiceArea } from '@/lib/geo/service-area';
import { SERVICE_AREA } from '@/lib/config/service-area';
import { haversineKm } from '@/lib/geo/distance';

const g = (lat: number | null, lon: number | null, flags: string[] = [], status: 'done' | 'pending' | 'failed' | 'skipped' = 'done') =>
  ({ enrichment_status: status, geo_lat: lat, geo_lon: lon, geo_flags: flags });

describe('assessServiceArea (default config)', () => {
  it('Osterstraße, Hamburg is inside (Hamburg location)', () => {
    const a = assessServiceArea(g(53.5767322, 9.9487538), SERVICE_AREA);
    expect(a.verdict).toBe('inside');
    expect(a.hub).toBe('Hamburg');
    expect(a.distanceKm).toBeLessThan(10);
  });
  it('Groß Grönau is inside; nearest location Lübeck ~8 km', () => {
    const a = assessServiceArea(g(53.8017, 10.7494), SERVICE_AREA);
    expect(a.verdict).toBe('inside');
    expect(a.hub).toBe('Lübeck');
    expect(a.distanceKm).toBeLessThan(15);
  });
  it('Dresden is inside (Dresden location)', () => {
    const a = assessServiceArea(g(51.0589555, 13.7430758), SERVICE_AREA);
    expect(a.verdict).toBe('inside');
    expect(a.hub).toBe('Dresden');
    expect(a.distanceKm).toBeLessThan(5);
  });
  it('Uelzen (~33 km from Lüneburg) is on the edge', () => {
    const a = assessServiceArea(g(52.965, 10.56), SERVICE_AREA);
    expect(a.verdict).toBe('edge');
    expect(a.hub).toBe('Lüneburg');
  });
  it('Passau (~110 km from Regensburg) is outside', () => {
    const a = assessServiceArea(g(48.57, 13.43), SERVICE_AREA);
    expect(a.verdict).toBe('outside');
    expect(a.hub).toBe('Regensburg');
    expect(a.distanceKm).toBeGreaterThan(50);
  });
  it('lists the 151 Planeco location cities', () => {
    expect(SERVICE_AREA.hubs).toHaveLength(151);
    expect(new Set(SERVICE_AREA.hubs.map((h) => h.name)).size).toBe(151);
  });
  it('ambiguous or missing coordinates are unclear', () => {
    expect(assessServiceArea(g(null, null, ['ambiguous']), SERVICE_AREA).verdict).toBe('unclear');
    expect(assessServiceArea(g(null, null), SERVICE_AREA).verdict).toBe('unclear');
  });
  it('job states', () => {
    expect(assessServiceArea(g(null, null, [], 'pending'), SERVICE_AREA).verdict).toBe('pending');
    expect(assessServiceArea(g(null, null, [], 'failed'), SERVICE_AREA).verdict).toBe('failed');
    expect(assessServiceArea(g(null, null, [], 'skipped'), SERVICE_AREA).verdict).toBe('n/a');
  });
});

/** A-11: deterministic boundaries. `≤ radius` → inside, `≤ radius + band` → edge. */
describe('assessServiceArea — boundaries (A-11)', () => {
  const KM_PER_DEG = (6371 * Math.PI) / 180; // 111.1949… km per degree of latitude (haversine R = 6371)
  const hamburg = SERVICE_AREA.hubs.find((h) => h.name === 'Hamburg')!;
  /** The default limits with Hamburg as the only location, so no neighbouring location (Norderstedt) interferes. */
  const onlyHamburg = { ...SERVICE_AREA, hubs: [hamburg] };
  const north = (km: number) => g(hamburg.lat + km / KM_PER_DEG, hamburg.lon);
  const verdictAt = (km: number) => assessServiceArea(north(km), onlyHamburg);

  it('default config: just inside / just past the radius (30 km)', () => {
    expect(verdictAt(29.999).verdict).toBe('inside');
    expect(verdictAt(30.001).verdict).toBe('edge');
    expect(verdictAt(30.001).hub).toBe('Hamburg');
  });
  it('default config: just inside / just past radius + edge band (50 km)', () => {
    expect(verdictAt(49.999).verdict).toBe('edge');
    expect(verdictAt(50.001).verdict).toBe('outside');
  });

  // The next two use a tiny custom config whose limits are *derived from the haversine distance itself*, so the point
  // sits exactly on the limit in floating point (no tolerance involved).
  const hub = { name: 'Testhub', lat: 50, lon: 10 };
  const point = { lat: 50.5, lon: 10 }; // ≈ 55.6 km north of the hub
  const d = haversineKm(point, hub);
  const geo = g(point.lat, point.lon);

  it('a point exactly radiusKm from a hub is inside', () => {
    const cfg = { radiusKm: d, edgeBandKm: 15, hubs: [hub] };
    expect(assessServiceArea(geo, cfg).verdict).toBe('inside');
    // one hair farther away is no longer inside
    expect(assessServiceArea(g(point.lat + 1e-6, point.lon), cfg).verdict).toBe('edge');
  });
  it('a point exactly radiusKm + edgeBandKm from a hub is on the edge', () => {
    const radiusKm = d - 15;
    const edgeBandKm = d - radiusKm; // exact (Sterbenz), so radiusKm + edgeBandKm === d
    expect(radiusKm + edgeBandKm).toBe(d);
    const cfg = { radiusKm, edgeBandKm, hubs: [hub] };
    expect(assessServiceArea(geo, cfg).verdict).toBe('edge');
    expect(assessServiceArea(g(point.lat + 1e-6, point.lon), cfg).verdict).toBe('outside');
  });
});
