export const ATTRIBUTION_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'placement', 'affiliate',
] as const;
export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];

export type RawAttribution = Partial<Record<AttributionKey | 'landing_path' | 'referrer', string | null>>;

/** Runtime list of the channel groups (spec §16); drives the dashboard "Kanal" filter. */
export const CHANNEL_GROUPS = [
  'Paid Search', 'Paid Social', 'Paid Other', 'Organic Search', 'Organic Social',
  'Social (unklar)', 'Email', 'Campaign', 'Referral', 'Direkt/Unbekannt',
] as const;
export type ChannelGroup = (typeof CHANNEL_GROUPS)[number];

export type ChannelInfo = { group: ChannelGroup; channel: string; campaign: string };
