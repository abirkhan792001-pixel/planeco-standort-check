import type { ServiceAreaConfig } from '@/lib/config/service-area';
import type { JobStatus } from '@/lib/leads/types';
import { nearestHub } from './distance';

export type AreaVerdict = 'inside' | 'edge' | 'outside' | 'unclear' | 'pending' | 'failed' | 'n/a';
export type AreaAssessment = { verdict: AreaVerdict; hub?: string; distanceKm?: number };

export function assessServiceArea(
  g: { enrichment_status: JobStatus; geo_lat: number | null; geo_lon: number | null; geo_flags: string[] },
  cfg: ServiceAreaConfig,
): AreaAssessment {
  if (g.enrichment_status === 'skipped') return { verdict: 'n/a' };
  if (g.enrichment_status === 'pending') return { verdict: 'pending' };
  if (g.enrichment_status === 'failed') return { verdict: 'failed' };
  if (g.geo_flags.includes('ambiguous') || g.geo_lat === null || g.geo_lon === null) return { verdict: 'unclear' };
  const { hub, distanceKm } = nearestHub({ lat: g.geo_lat, lon: g.geo_lon }, cfg.hubs);
  const verdict = distanceKm <= cfg.radiusKm ? 'inside' : distanceKm <= cfg.radiusKm + cfg.edgeBandKm ? 'edge' : 'outside';
  return { verdict, hub: hub.name, distanceKm: Math.round(distanceKm) };
}
