import { describe, it, expect } from 'vitest';
import { assessServiceArea } from '@/lib/geo/service-area';
import { SERVICE_AREA } from '@/lib/config/service-area';

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
