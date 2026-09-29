create extension if not exists pgcrypto;

create type lead_status       as enum ('neu','in_bearbeitung','qualifiziert','nicht_qualifiziert','gewonnen','verloren');
create type disqualify_reason as enum ('ausserhalb_gebiet','kein_bedarf','nicht_erreichbar','spam','duplikat','sonstiges');
create type job_status        as enum ('pending','done','failed','skipped');

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null
);

create table public.leads (
  id                     uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  idempotency_key        uuid not null unique,
  is_test                boolean not null default false,

  first_name             text not null check (char_length(first_name) between 1 and 100),
  last_name              text not null check (char_length(last_name)  between 1 and 100),
  email                  text not null check (char_length(email) <= 254),
  email_normalized       text not null,
  phone_raw              text not null check (char_length(phone_raw) <= 40),
  phone_e164             text,
  phone_valid            boolean not null default false,
  reachability           text[] not null default '{}',

  address_unknown        boolean not null default false,
  street                 text check (char_length(street) <= 120),
  house_number           text check (char_length(house_number) <= 10),
  postal_code            text check (postal_code ~ '^[0-9]{5}$'),
  city                   text check (char_length(city) <= 100),
  plot_note              text check (char_length(plot_note) <= 1000),
  address_key            text,
  project_type           text check (project_type in ('neubau','anbau','umbau','sanierung','sonstiges')),
  privacy_notice_version text not null,
  constraint plot_present check (
    (address_unknown and char_length(coalesce(plot_note,'')) >= 3)
    or (not address_unknown and street is not null and postal_code is not null and city is not null)
  ),

  utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text,
  gclid text, gbraid text, wbraid text, fbclid text, msclkid text, placement text, affiliate text,
  landing_path text, referrer text,
  device_type text check (device_type in ('mobile','tablet','desktop','unknown')),

  duplicate_of           uuid references public.leads(id),
  duplicate_reason       text[],
  related_lead_id        uuid references public.leads(id),
  spam_suspected         boolean not null default false,
  spam_reason            text,

  status                 lead_status not null default 'neu',
  disqualify_reason      disqualify_reason,
  assigned_to            uuid references auth.users(id),
  assigned_at            timestamptz,
  status_changed_at      timestamptz,
  sales_note             text check (char_length(sales_note) <= 2000),
  constraint reason_matches_status check ((status = 'nicht_qualifiziert') = (disqualify_reason is not null)),

  email_status           job_status not null default 'pending',
  email_attempts         int not null default 0,
  email_last_error       text,
  email_skip_reason      text,
  email_sent_at          timestamptz,

  enrichment_status      job_status not null default 'pending',
  enrichment_attempts    int not null default 0,
  enrichment_last_error  text,
  enriched_at            timestamptz,
  geo_precision          text check (geo_precision in ('house','street','postcode','locality','none')),
  geo_lat                double precision,
  geo_lon                double precision,
  geo_municipality       text,
  geo_municipality_key   text,
  geo_district           text,
  geo_state_code         text,
  geo_found_postcode     text,
  geo_flags              text[] not null default '{}',
  geo_candidates         jsonb,
  geo_raw                jsonb
);

create index leads_created_at_idx on public.leads (created_at desc);
create index leads_email_idx      on public.leads (email_normalized);
create index leads_phone_idx      on public.leads (phone_e164)  where phone_e164 is not null;
create index leads_address_idx    on public.leads (address_key) where address_key is not null;
create index leads_dup_idx        on public.leads (duplicate_of) where duplicate_of is not null;
create index leads_email_job_idx  on public.leads (email_status)      where email_status in ('pending','failed');
create index leads_enrich_job_idx on public.leads (enrichment_status) where enrichment_status in ('pending','failed');

create table public.lead_events (
  id         bigint generated always as identity primary key,
  lead_id    uuid not null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  actor_id   uuid references auth.users(id),
  type       text not null,
  data       jsonb not null default '{}'
);
create index lead_events_lead_idx on public.lead_events (lead_id, created_at);
