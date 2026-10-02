alter type job_status add value if not exists 'sending';
alter table public.leads add column if not exists email_claimed_at timestamptz;
