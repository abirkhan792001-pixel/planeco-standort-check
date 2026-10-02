import type { LeadRow } from '@/lib/leads/types';

export function makeLeadRow(o: Partial<LeadRow> = {}): LeadRow {
  return {
    id: '00000000-0000-4000-8000-000000000001', created_at: '2026-10-01T08:00:00Z', idempotency_key: '00000000-0000-4000-8000-0000000000aa',
    is_test: false, first_name: 'Thomas', last_name: 'Ahrens', email: 'thomas@gmx.de', email_normalized: 'thomas@gmx.de',
    phone_raw: '+49 40 / 123 456', phone_e164: '+4940123456', phone_valid: true, reachability: [],
    address_unknown: false, street: 'Hauptstraße', house_number: '14', postal_code: '01067', city: 'Dresden', plot_note: null,
    address_key: 'hauptstrasse|14|01067', project_type: null, privacy_notice_version: '2026-09-v1',
    utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null,
    gclid: null, gbraid: null, wbraid: null, fbclid: null, msclkid: null, placement: null, affiliate: null,
    landing_path: '/', referrer: null, device_type: 'mobile',
    duplicate_of: null, duplicate_reason: null, related_lead_id: null, spam_suspected: false, spam_reason: null,
    status: 'neu', disqualify_reason: null, assigned_to: null, assigned_at: null, status_changed_at: null, sales_note: null,
    email_status: 'pending', email_attempts: 0, email_last_error: null, email_skip_reason: null, email_sent_at: null,
    enrichment_status: 'pending', enrichment_attempts: 0, enrichment_last_error: null, enriched_at: null,
    geo_precision: null, geo_lat: null, geo_lon: null, geo_municipality: null, geo_municipality_key: null,
    geo_district: null, geo_state_code: null, geo_found_postcode: null, geo_flags: [], geo_candidates: null, geo_raw: null,
    ...o,
  };
}
