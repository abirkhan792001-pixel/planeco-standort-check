import type { ChannelInfo, RawAttribution } from './types';

const PAID = new Set(['cpc', 'ppc', 'paid', 'paidsearch', 'paid_search', 'paidsocial', 'paid_social', 'cpm', 'display', 'retargeting']);
const META = new Set(['facebook', 'fb', 'instagram', 'ig', 'meta']);
/** Manually tagged search ads (utm_source + paid medium, no click id) — e.g. auto-tagging off or stripped. */
const SEARCH_ADS = new Map([['google', 'Google Ads'], ['bing', 'Microsoft Ads']]);
const SEARCH = ['google.', 'bing.', 'duckduckgo.', 'ecosia.', 'yahoo.', 'startpage.'];
const SOCIAL = ['facebook.', 'instagram.', 'linkedin.', 't.co', 'x.com', 'tiktok.'];

const clean = (v: string | null | undefined) => {
  const t = (v ?? '').trim().toLowerCase();
  return t || null;
};

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function matches(host: string, patterns: string[]): boolean {
  return patterns.some((p) => (p.endsWith('.') ? host.startsWith(p) || host.includes(`.${p}`) : host === p || host.endsWith(`.${p}`)));
}

/**
 * Ordered rules, first match wins (spec §16, plus: google/bing + paid medium without click id = Paid Search).
 * Raw values stay in the DB; this runs at read time.
 */
export function classifyChannel(a: RawAttribution, ownHost: string): ChannelInfo {
  const campaign = a.utm_campaign?.trim() || '(ohne Kampagne)';
  const src = clean(a.utm_source);
  const med = clean(a.utm_medium);
  const anyUtm = [a.utm_source, a.utm_medium, a.utm_campaign, a.utm_term, a.utm_content].some((v) => clean(v));

  if (clean(a.gclid) || clean(a.gbraid) || clean(a.wbraid)) return { group: 'Paid Search', channel: 'Google Ads', campaign };
  if (clean(a.msclkid)) return { group: 'Paid Search', channel: 'Microsoft Ads', campaign };
  const searchAds = src && med && PAID.has(med) ? SEARCH_ADS.get(src) : undefined;
  if (searchAds) return { group: 'Paid Search', channel: searchAds, campaign };
  if (src && META.has(src)) {
    return med && PAID.has(med)
      ? { group: 'Paid Social', channel: 'Meta Ads', campaign }
      : { group: 'Organic Social', channel: 'Meta (organisch)', campaign };
  }
  if (med && PAID.has(med)) return { group: 'Paid Other', channel: `Paid – ${src ?? 'unbekannt'}`, campaign };
  if (anyUtm) return { group: med === 'email' ? 'Email' : 'Campaign', channel: src ?? 'unbekannt', campaign };
  if (clean(a.fbclid)) return { group: 'Social (unklar)', channel: 'Facebook/Instagram (unklar ob bezahlt)', campaign };

  const host = hostOf(a.referrer);
  const own = ownHost.toLowerCase().replace(/^www\./, '');
  if (host && host !== own) {
    if (matches(host, SEARCH)) return { group: 'Organic Search', channel: host, campaign };
    if (matches(host, SOCIAL)) return { group: 'Organic Social', channel: host, campaign };
    return { group: 'Referral', channel: host, campaign };
  }
  return { group: 'Direkt/Unbekannt', channel: 'Direkt/Unbekannt', campaign };
}
