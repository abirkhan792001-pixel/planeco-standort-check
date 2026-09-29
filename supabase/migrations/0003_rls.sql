alter table public.leads       enable row level security;
alter table public.lead_events enable row level security;
alter table public.profiles    enable row level security;

create policy leads_select    on public.leads       for select to authenticated using (true);
create policy events_select   on public.lead_events for select to authenticated using (true);
create policy profiles_select on public.profiles    for select to authenticated using (true);

revoke insert, update, delete on public.leads, public.lead_events, public.profiles from anon, authenticated;
revoke select on public.leads, public.lead_events, public.profiles from anon;
