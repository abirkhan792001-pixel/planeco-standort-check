export const LEAD_STATUSES = ['neu', 'in_bearbeitung', 'qualifiziert', 'nicht_qualifiziert', 'gewonnen', 'verloren'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const DISQUALIFY_REASONS = ['ausserhalb_gebiet', 'kein_bedarf', 'nicht_erreichbar', 'spam', 'duplikat', 'sonstiges'] as const;
export type DisqualifyReason = (typeof DISQUALIFY_REASONS)[number];

export const TERMINAL_STATUSES: readonly LeadStatus[] = ['gewonnen', 'verloren', 'nicht_qualifiziert'];

export type JobStatus = 'pending' | 'done' | 'failed' | 'skipped';

export const PROJECT_TYPES = ['neubau', 'anbau', 'umbau', 'sanierung', 'sonstiges'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const REACHABILITY = ['vormittags', 'nachmittags', 'abends'] as const;
export type Reachability = (typeof REACHABILITY)[number];

export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown';

/** One row of public.leads, exactly as selected with `select('*')`. */
export type LeadRow = {
  id: string;
  created_at: string;
  idempotency_key: string;
  is_test: boolean;
  first_name: string;
  last_name: string;
  email: string;
  email_normalized: string;
  phone_raw: string;
  phone_e164: string | null;
  phone_valid: boolean;
  reachability: Reachability[];
  address_unknown: boolean;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  plot_note: string | null;
  address_key: string | null;
  project_type: ProjectType | null;
  privacy_notice_version: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  msclkid: string | null;
  placement: string | null;
  affiliate: string | null;
  landing_path: string | null;
  referrer: string | null;
  device_type: DeviceType | null;
  duplicate_of: string | null;
  duplicate_reason: string[] | null;
  related_lead_id: string | null;
  spam_suspected: boolean;
  spam_reason: string | null;
  status: LeadStatus;
  disqualify_reason: DisqualifyReason | null;
  assigned_to: string | null;
  assigned_at: string | null;
  status_changed_at: string | null;
  sales_note: string | null;
  email_status: JobStatus;
  email_attempts: number;
  email_last_error: string | null;
  email_skip_reason: string | null;
  email_sent_at: string | null;
  enrichment_status: JobStatus;
  enrichment_attempts: number;
  enrichment_last_error: string | null;
  enriched_at: string | null;
  geo_precision: 'house' | 'street' | 'postcode' | 'locality' | 'none' | null;
  geo_lat: number | null;
  geo_lon: number | null;
  geo_municipality: string | null;
  geo_municipality_key: string | null;
  geo_district: string | null;
  geo_state_code: string | null;
  geo_found_postcode: string | null;
  geo_flags: string[];
  geo_candidates: unknown;
  geo_raw: unknown;
};
