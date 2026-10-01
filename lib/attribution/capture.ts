import { ATTRIBUTION_KEYS, type AttributionKey, type RawAttribution } from './types';

const MAX = 500;

/** Pure: called in the browser with location.search, document.referrer and location.pathname. No storage. */
export function captureAttribution(search: string, referrer: string, pathname: string): { attribution: RawAttribution; isTest: boolean } {
  const params = new URLSearchParams(search);
  const lower = new Map<string, string>();
  params.forEach((value, key) => lower.set(key.toLowerCase(), value));

  const attribution: RawAttribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const v = lower.get(key)?.trim();
    if (v) attribution[key as AttributionKey] = v.slice(0, MAX);
  }
  attribution.landing_path = (pathname || '/').slice(0, MAX);
  if (referrer) attribution.referrer = referrer.slice(0, MAX);
  return { attribution, isTest: lower.get('test') === '1' };
}
