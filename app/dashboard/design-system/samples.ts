import type { LeadListRow } from '@/lib/leads/types';

/** Specimen leads for /dashboard/design-system: the case samples (example.com = test leads), one per area verdict. */
const base: Omit<LeadListRow, 'id' | 'created_at' | 'first_name' | 'last_name' | 'email' | 'phone_raw'> = {
  idempotency_key: '00000000-0000-4000-8000-0000000000aa', is_test: true, email_normalized: '', phone_e164: null, phone_valid: true,
  phone_extension: null, reachability: [], address_unknown: false, street: null, house_number: null, postal_code: null, city: null,
  plot_note: null, address_key: null, project_type: null, privacy_notice_version: '2026-09-v1', utm_source: null, utm_medium: null,
  utm_campaign: null, utm_term: null, utm_content: null, gclid: null, gbraid: null, wbraid: null, fbclid: null, msclkid: null,
  placement: null, affiliate: null, landing_path: '/', referrer: null, device_type: 'mobile', duplicate_of: null, duplicate_reason: null,
  related_lead_id: null, spam_suspected: false, spam_reason: null, status: 'neu', disqualify_reason: null, assigned_to: null,
  assigned_at: null, status_changed_at: null, sales_note: null, email_status: 'skipped', email_attempts: 0, email_last_error: null,
  email_skip_reason: 'test_domain', email_sent_at: null, email_claimed_at: null, enrichment_status: 'done', enrichment_attempts: 1,
  enrichment_last_error: null, enriched_at: null, geo_precision: 'house', geo_lat: null, geo_lon: null, geo_municipality: null,
  geo_municipality_key: null, geo_district: null, geo_state_code: null, geo_found_postcode: null, geo_flags: [], geo_candidates: null,
};

export const SPECIMEN_USER = '00000000-0000-4000-8000-00000000000a';
export const SPECIMEN_PROFILES = [{ id: SPECIMEN_USER, display_name: 'Vertrieb A' }];

export const SPECIMEN_ROWS: LeadListRow[] = [
  {
    ...base, id: 's1', created_at: '2026-10-04T18:07:00Z', first_name: 'Henry', last_name: 'Braun', email: 'henry.braun@example.com',
    phone_raw: '0621 4410 2290', address_unknown: true, plot_note: 'Heidelberg', geo_precision: 'locality', geo_lat: 49.3988, geo_lon: 8.6724,
    geo_state_code: 'DE-BW', geo_municipality: 'Heidelberg', geo_flags: ['address_unknown'], project_type: 'sonstiges', reachability: ['nachmittags'],
    utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'standort-check-sued',
  },
  {
    ...base, id: 's2', created_at: '2026-10-04T16:38:00Z', first_name: 'Julius', last_name: 'Kron', email: 'julius.kron@example.com',
    phone_raw: '0162 5386 9725', address_unknown: true, plot_note: 'Lübeck', geo_precision: 'locality', geo_lat: 53.8655, geo_lon: 10.6866,
    geo_state_code: 'DE-SH', geo_flags: ['address_unknown'], project_type: 'neubau', reachability: ['vormittags'],
    status: 'in_bearbeitung', assigned_to: SPECIMEN_USER, assigned_at: '2026-10-04T17:00:00Z',
  },
  {
    ...base, id: 's3', created_at: '2026-10-03T22:27:00Z', first_name: 'Jörg', last_name: 'Klöpper', email: 'joerg.kloepper@example.com',
    phone_raw: '0451 9988776', street: 'Am Mühlenteich', house_number: '7', postal_code: '23627', city: 'Groß Grönau',
    geo_precision: 'postcode', geo_lat: 53.8012, geo_lon: 10.7456, geo_state_code: 'DE-SH', geo_district: 'Herzogtum Lauenburg',
    geo_flags: ['house_not_found'], project_type: 'anbau', reachability: ['abends'],
  },
  {
    ...base, id: 's4', created_at: '2026-10-03T22:27:00Z', first_name: 'Kai', last_name: 'Ruthenberg', email: 'kai.ruthenberg@example.com',
    phone_raw: '040 55512345', street: 'Osterstraße', house_number: '88', postal_code: '20259', city: 'Hamburg',
    geo_precision: 'house', geo_lat: 53.5763, geo_lon: 9.9529, geo_state_code: 'DE-HH', project_type: 'sanierung',
    reachability: ['vormittags', 'nachmittags'], status: 'qualifiziert', assigned_to: SPECIMEN_USER, utm_source: 'facebook', utm_medium: 'paid_social',
  },
  {
    ...base, id: 's5', created_at: '2026-10-03T21:15:00Z', first_name: 'Mia', last_name: 'Albers', email: 'mia.albers@example.com',
    phone_raw: '030 1234567', street: 'Lindenallee', house_number: '3', postal_code: '14467', city: 'Potsdam', enrichment_status: 'pending',
    geo_precision: null, project_type: 'umbau',
  },
];
