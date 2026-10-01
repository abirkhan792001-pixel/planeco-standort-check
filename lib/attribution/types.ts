export const ATTRIBUTION_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'placement', 'affiliate',
] as const;
export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];

export type RawAttribution = Partial<Record<AttributionKey | 'landing_path' | 'referrer', string | null>>;

export type ChannelGroup =
  | 'Paid Search' | 'Paid Social' | 'Paid Other' | 'Organic Search' | 'Organic Social'
  | 'Social (unklar)' | 'Email' | 'Campaign' | 'Referral' | 'Direkt/Unbekannt';

export type ChannelInfo = { group: ChannelGroup; channel: string; campaign: string };
