create or replace function public.lead_root_id(p_lead_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(duplicate_of, id) from public.leads where id = p_lead_id
$$;

create or replace function public.claim_lead(p_lead_id uuid, p_force boolean default false)
returns table(result text, owner_id uuid, owner_name text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_root  uuid;
  v_owner uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_root := public.lead_root_id(p_lead_id);
  if v_root is null then raise exception 'not_found'; end if;

  select l.assigned_to into v_owner from public.leads l where l.id = v_root for update;

  if v_owner is not null and v_owner <> v_uid and not p_force then
    return query select 'conflict'::text, v_owner, (select p.display_name from public.profiles p where p.id = v_owner);
    return;
  end if;

  update public.leads l
     set assigned_to = v_uid,
         assigned_at = now(),
         status = case when l.status = 'neu' then 'in_bearbeitung'::lead_status else l.status end
   where l.id = v_root or l.duplicate_of = v_root;

  insert into public.lead_events(lead_id, actor_id, type, data)
  values (v_root, v_uid,
          case when v_owner is not null and v_owner <> v_uid then 'claim_forced' else 'claimed' end,
          jsonb_build_object('previous_owner', v_owner));

  return query select 'ok'::text, v_uid, (select p.display_name from public.profiles p where p.id = v_uid);
end $$;

create or replace function public.release_lead(p_lead_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_root uuid;
  v_owner uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_root := public.lead_root_id(p_lead_id);
  select l.assigned_to into v_owner from public.leads l where l.id = v_root for update;
  if v_owner is distinct from v_uid then raise exception 'not_owner'; end if;

  update public.leads l
     set assigned_to = null, assigned_at = null,
         status = case when l.status = 'in_bearbeitung' then 'neu'::lead_status else l.status end
   where l.id = v_root or l.duplicate_of = v_root;

  insert into public.lead_events(lead_id, actor_id, type) values (v_root, v_uid, 'released');
end $$;

create or replace function public.set_lead_status(p_lead_id uuid, p_status lead_status, p_reason disqualify_reason default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_root uuid;
  v_owner uuid;
  v_from lead_status;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if (p_status = 'nicht_qualifiziert') <> (p_reason is not null) then raise exception 'reason_mismatch'; end if;
  v_root := public.lead_root_id(p_lead_id);
  select l.assigned_to, l.status into v_owner, v_from from public.leads l where l.id = v_root for update;
  if v_owner is distinct from v_uid then raise exception 'not_owner'; end if;

  update public.leads l
     set status = p_status, disqualify_reason = p_reason, status_changed_at = now()
   where l.id = v_root or l.duplicate_of = v_root;

  insert into public.lead_events(lead_id, actor_id, type, data)
  values (v_root, v_uid, 'status_changed', jsonb_build_object('from', v_from, 'to', p_status, 'reason', p_reason));
end $$;

create or replace function public.set_lead_note(p_lead_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_root uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if char_length(coalesce(p_note, '')) > 2000 then raise exception 'note_too_long'; end if;
  v_root := public.lead_root_id(p_lead_id);
  update public.leads set sales_note = nullif(trim(p_note), '') where id = v_root;
  insert into public.lead_events(lead_id, actor_id, type, data)
  values (v_root, v_uid, 'note_changed', jsonb_build_object('length', char_length(coalesce(p_note, ''))));
end $$;

create or replace function public.leads_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.lead_events(lead_id, type, data)
  values (new.id, 'created', jsonb_build_object('spam', new.spam_suspected, 'test', new.is_test));
  if new.duplicate_of is not null then
    insert into public.lead_events(lead_id, type, data)
    values (new.id, 'duplicate_linked', jsonb_build_object('root', new.duplicate_of, 'reasons', new.duplicate_reason));
  end if;
  return new;
end $$;

create trigger leads_after_insert after insert on public.leads
for each row execute function public.leads_after_insert();

revoke all on function public.lead_root_id(uuid)                                   from public, anon, authenticated;
revoke all on function public.leads_after_insert()                                  from public, anon, authenticated;
revoke all on function public.claim_lead(uuid, boolean)                             from public, anon;
revoke all on function public.release_lead(uuid)                                    from public, anon;
revoke all on function public.set_lead_status(uuid, lead_status, disqualify_reason) from public, anon;
revoke all on function public.set_lead_note(uuid, text)                             from public, anon;
grant execute on function public.claim_lead(uuid, boolean)                             to authenticated;
grant execute on function public.release_lead(uuid)                                    to authenticated;
grant execute on function public.set_lead_status(uuid, lead_status, disqualify_reason) to authenticated;
grant execute on function public.set_lead_note(uuid, text)                             to authenticated;
