export type Hub = { name: string; lat: number; lon: number };
export type ServiceAreaConfig = { radiusKm: number; edgeBandKm: number; hubs: readonly Hub[] };

/**
 * ASSUMPTION (see NOTES.md): Planeco publishes city pages for these metro areas; the real service area is pending
 * Planeco's answer. Change only this file when it arrives — verdicts are derived at read time, history updates.
 */
export const SERVICE_AREA: ServiceAreaConfig = {
  radiusKm: 50,
  edgeBandKm: 15,
  hubs: [
    { name: 'Hamburg', lat: 53.5503, lon: 9.992 },
    { name: 'Berlin', lat: 52.52, lon: 13.405 },
    { name: 'München', lat: 48.1372, lon: 11.5755 },
    { name: 'Köln', lat: 50.9384, lon: 6.9599 },
    { name: 'Frankfurt am Main', lat: 50.1106, lon: 8.6821 },
    { name: 'Düsseldorf', lat: 51.2254, lon: 6.7763 },
    { name: 'Stuttgart', lat: 48.7784, lon: 9.18 },
  ],
};
