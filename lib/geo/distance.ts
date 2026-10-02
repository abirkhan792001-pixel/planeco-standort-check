import type { Hub } from '@/lib/config/service-area';

type Point = { lat: number; lon: number };

export function haversineKm(a: Point, b: Point): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestHub(p: Point, hubs: readonly Hub[]): { hub: Hub; distanceKm: number } {
  let best = { hub: hubs[0], distanceKm: haversineKm(p, hubs[0]) };
  for (const hub of hubs.slice(1)) {
    const d = haversineKm(p, hub);
    if (d < best.distanceKm) best = { hub, distanceKm: d };
  }
  return best;
}
