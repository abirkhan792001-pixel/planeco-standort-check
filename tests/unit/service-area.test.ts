import { describe, it, expect } from 'vitest';
import { assessServiceArea } from '@/lib/geo/service-area';
import { SERVICE_AREA } from '@/lib/config/service-area';
import { haversineKm } from '@/lib/geo/distance';

const g = (lat: number | null, lon: number | null, flags: string[] = [], status: 'done' | 'pending' | 'failed' | 'skipped' = 'done') =>
  ({ enrichment_status: status, geo_lat: lat, geo_lon: lon, geo_flags: flags });

describe('assessServiceArea (default config)', () => {
  it('Osterstraße, Hamburg is inside', () => {
    const a = assessServiceArea(g(53.5767322, 9.9487538), SERVICE_AREA);
    expect(a.verdict).toBe('inside');
    expect(a.hub).toBe('Hamburg');
    expect(a.distanceKm).toBeLessThan(10);
  });
  it('Groß Grönau (~57 km) is on the edge', () => {
    const a = assessServiceArea(g(53.8017, 10.7494), SERVICE_AREA);
    expect(a.verdict).toBe('edge');
    expect(a.distanceKm).toBeGreaterThan(50);
    expect(a.distanceKm).toBeLessThan(65);
  });
  it('Dresden is outside; nearest hub Berlin ~164 km', () => {
    const a = assessServiceArea(g(51.0589555, 13.7430758), SERVICE_AREA);
    expect(a.verdict).toBe('outside');
    expect(a.hub).toBe('Berlin');
    expect(a.distanceKm).toBeGreaterThan(150);
    expect(a.distanceKm).toBeLessThan(180);
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
  const hamburg = SERVICE_AREA.hubs[0];
  /** A point `km` due north of the Hamburg hub; every other hub is farther than 400 km away. */
  const north = (km: number) => g(hamburg.lat + km / KM_PER_DEG, hamburg.lon);
  const verdictAt = (km: number) => assessServiceArea(north(km), SERVICE_AREA);

  it('default config: just inside / just past the radius (50 km)', () => {
    expect(verdictAt(49.999).verdict).toBe('inside');
    expect(verdictAt(50.001).verdict).toBe('edge');
    expect(verdictAt(50.001).hub).toBe('Hamburg');
  });
  it('default config: just inside / just past radius + edge band (65 km)', () => {
    expect(verdictAt(64.999).verdict).toBe('edge');
    expect(verdictAt(65.001).verdict).toBe('outside');
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
