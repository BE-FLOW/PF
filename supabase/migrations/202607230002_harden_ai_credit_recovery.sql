alter table public.ai_credit_grants
  drop constraint if exists ai_credit_grants_purchase_id_fkey;
alter table public.ai_credit_grants
  add constraint ai_credit_grants_purchase_id_fkey
    foreign key (purchase_id)
    references public.billing_purchases(id)
    on delete cascade;

alter table public.ai_credit_ledger
  drop constraint if exists ai_credit_ledger_grant_id_fkey;
alter table public.ai_credit_ledger
  add constraint ai_credit_ledger_grant_id_fkey
    foreign key (grant_id)
    references public.ai_credit_grants(id)
    on delete cascade;

alter table public.ai_credit_ledger
  drop constraint if exists ai_credit_ledger_usage_id_fkey;
alter table public.ai_credit_ledger
  add constraint ai_credit_ledger_usage_id_fkey
    foreign key (usage_id)
    references public.ai_report_usage(id)
    on delete cascade;

create or replace function public.release_stale_ai_report_reservations(
  target_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  timed_out record;
  timed_out_grant_id uuid;
  release_inserted uuid;
  released_count integer := 0;
begin
  if target_user_id is null then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  for timed_out in
    update public.ai_report_usage usage
    set
      status = 'failed',
      error_code = 'reservation_timeout'
    where usage.user_id = target_user_id
      and usage.status = 'pending'
      and usage.created_at < now() - interval '5 minutes'
    returning usage.id
  loop
    timed_out_grant_id := null;
    release_inserted := null;

    select ledger.grant_id
    into timed_out_grant_id
    from public.ai_credit_ledger ledger
    where ledger.usage_id = timed_out.id
      and ledger.reason = 'usage';

    if timed_out_grant_id is not null then
      insert into public.ai_credit_ledger (
        user_id,
        grant_id,
        usage_id,
        delta,
        reason,
        idempotency_key
      )
      values (
        target_user_id,
        timed_out_grant_id,
        timed_out.id,
        1,
        'usage_release',
        'usage-release:' || timed_out.id::text
      )
      on conflict (idempotency_key) do nothing
      returning id into release_inserted;

      if release_inserted is not null then
        update public.ai_credit_grants
        set
          quantity_remaining = least(quantity_granted, quantity_remaining + 1),
          updated_at = now()
        where id = timed_out_grant_id
          and status = 'active';

        if found then
          released_count := released_count + 1;
        end if;
      end if;
    end if;
  end loop;

  return released_count;
end;
$$;

create or replace function public.get_ai_credit_status(target_user_id uuid)
returns table (
  available_credits integer,
  complimentary_credits integer,
  purchased_credits integer,
  used_total integer
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public.release_stale_ai_report_reservations(target_user_id);
  perform public.ensure_ai_complimentary_credit(target_user_id);

  return query
  select
    coalesce(sum(grant_row.quantity_remaining), 0)::integer,
    coalesce(sum(grant_row.quantity_remaining) filter (
      where grant_row.source = 'complimentary'
    ), 0)::integer,
    coalesce(sum(grant_row.quantity_remaining) filter (
      where grant_row.source in ('purchase', 'admin')
    ), 0)::integer,
    (
      select count(*)::integer
      from public.ai_report_usage usage
      where usage.user_id = target_user_id
        and usage.status = 'succeeded'
    )
  from public.ai_credit_grants grant_row
  where grant_row.user_id = target_user_id
    and grant_row.status = 'active';
end;
$$;

revoke all on function public.release_stale_ai_report_reservations(uuid)
  from public, anon, authenticated;
grant execute on function public.release_stale_ai_report_reservations(uuid)
  to service_role;

comment on function public.release_stale_ai_report_reservations(uuid) is
  'Returns credits held by AI report reservations that did not finish within five minutes.';
