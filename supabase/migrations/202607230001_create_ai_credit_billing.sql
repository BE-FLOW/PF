create table if not exists public.billing_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id text not null unique,
  original_transaction_id text,
  product_id text not null,
  store text not null check (
    store in ('app_store', 'play_store', 'revenuecat', 'stripe', 'paddle')
  ),
  environment text not null check (environment in ('sandbox', 'production')),
  status text not null default 'active' check (status in ('active', 'refunded')),
  credits_granted integer not null default 1 check (credits_granted between 1 and 100),
  purchased_at timestamptz not null,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  user_id uuid references auth.users(id) on delete set null,
  transaction_id text,
  status text not null check (status in ('processed', 'ignored', 'failed')),
  error_code text,
  received_at timestamptz not null default now()
);

create table if not exists public.ai_credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid unique references public.billing_purchases(id) on delete cascade,
  source text not null check (source in ('complimentary', 'purchase', 'admin')),
  status text not null default 'active' check (status in ('active', 'refunded', 'void')),
  quantity_granted integer not null check (quantity_granted between 1 and 100),
  quantity_remaining integer not null check (quantity_remaining >= 0),
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_credit_grants_remaining_check
    check (quantity_remaining <= quantity_granted),
  constraint ai_credit_grants_purchase_source_check
    check (
      (source = 'purchase' and purchase_id is not null)
      or (source <> 'purchase' and purchase_id is null)
    )
);

create unique index if not exists ai_credit_grants_complimentary_user_key
  on public.ai_credit_grants (user_id)
  where source = 'complimentary';

create table if not exists public.ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  grant_id uuid not null references public.ai_credit_grants(id) on delete cascade,
  usage_id uuid references public.ai_report_usage(id) on delete cascade,
  delta integer not null check (delta <> 0 and delta between -100 and 100),
  reason text not null check (
    reason in (
      'complimentary_grant',
      'purchase',
      'usage',
      'usage_release',
      'refund',
      'refund_reversal',
      'admin'
    )
  ),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists billing_purchases_user_purchased_idx
  on public.billing_purchases (user_id, purchased_at desc);
create index if not exists billing_events_received_idx
  on public.billing_events (received_at desc);
create index if not exists ai_credit_grants_user_active_idx
  on public.ai_credit_grants (user_id, status, granted_at)
  where quantity_remaining > 0;
create index if not exists ai_credit_ledger_user_created_idx
  on public.ai_credit_ledger (user_id, created_at desc);
create unique index if not exists ai_credit_ledger_usage_debit_key
  on public.ai_credit_ledger (usage_id)
  where reason = 'usage';

alter table public.billing_purchases enable row level security;
alter table public.billing_events enable row level security;
alter table public.ai_credit_grants enable row level security;
alter table public.ai_credit_ledger enable row level security;
alter table public.billing_purchases force row level security;
alter table public.billing_events force row level security;
alter table public.ai_credit_grants force row level security;
alter table public.ai_credit_ledger force row level security;

revoke all on table public.billing_purchases from public, anon, authenticated;
revoke all on table public.billing_events from public, anon, authenticated;
revoke all on table public.ai_credit_grants from public, anon, authenticated;
revoke all on table public.ai_credit_ledger from public, anon, authenticated;
grant select, insert, update on table public.billing_purchases to service_role;
grant select, insert, update on table public.billing_events to service_role;
grant select, insert, update on table public.ai_credit_grants to service_role;
grant select, insert on table public.ai_credit_ledger to service_role;

create or replace function public.ensure_ai_complimentary_credit(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target_grant_id uuid;
begin
  if target_user_id is null
    or not exists (select 1 from auth.users where id = target_user_id)
  then
    raise exception 'A valid user is required';
  end if;

  insert into public.ai_credit_grants (
    user_id,
    source,
    quantity_granted,
    quantity_remaining
  )
  values (target_user_id, 'complimentary', 1, 1)
  on conflict (user_id) where source = 'complimentary' do nothing
  returning id into target_grant_id;

  if target_grant_id is null then
    select id
    into target_grant_id
    from public.ai_credit_grants
    where user_id = target_user_id
      and source = 'complimentary';
  else
    insert into public.ai_credit_ledger (
      user_id,
      grant_id,
      delta,
      reason,
      idempotency_key
    )
    values (
      target_user_id,
      target_grant_id,
      1,
      'complimentary_grant',
      'complimentary:' || target_user_id::text
    )
    on conflict (idempotency_key) do nothing;
  end if;

  return target_grant_id;
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

create or replace function public.record_ai_credit_purchase(
  target_user_id uuid,
  target_transaction_id text,
  target_original_transaction_id text,
  target_product_id text,
  target_store text,
  target_environment text,
  target_purchased_at timestamptz,
  target_credits integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target_purchase_id uuid;
  target_grant_id uuid;
  inserted_purchase boolean := false;
begin
  if target_user_id is null
    or btrim(coalesce(target_transaction_id, '')) = ''
    or btrim(coalesce(target_product_id, '')) = ''
    or target_store not in ('app_store', 'play_store', 'revenuecat', 'stripe', 'paddle')
    or target_environment not in ('sandbox', 'production')
    or target_purchased_at is null
    or target_credits not between 1 and 100
  then
    raise exception 'Valid purchase fields are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  insert into public.billing_purchases (
    user_id,
    transaction_id,
    original_transaction_id,
    product_id,
    store,
    environment,
    credits_granted,
    purchased_at
  )
  values (
    target_user_id,
    btrim(target_transaction_id),
    nullif(btrim(coalesce(target_original_transaction_id, '')), ''),
    btrim(target_product_id),
    target_store,
    target_environment,
    target_credits,
    target_purchased_at
  )
  on conflict (transaction_id) do nothing
  returning id into target_purchase_id;

  inserted_purchase := target_purchase_id is not null;

  if not inserted_purchase then
    select id
    into target_purchase_id
    from public.billing_purchases
    where transaction_id = btrim(target_transaction_id)
      and user_id = target_user_id;

    if target_purchase_id is null then
      raise exception 'Purchase belongs to another user';
    end if;
  end if;

  if inserted_purchase then
    insert into public.ai_credit_grants (
      user_id,
      purchase_id,
      source,
      quantity_granted,
      quantity_remaining,
      granted_at
    )
    values (
      target_user_id,
      target_purchase_id,
      'purchase',
      target_credits,
      target_credits,
      target_purchased_at
    )
    returning id into target_grant_id;

    insert into public.ai_credit_ledger (
      user_id,
      grant_id,
      delta,
      reason,
      idempotency_key
    )
    values (
      target_user_id,
      target_grant_id,
      target_credits,
      'purchase',
      'purchase:' || btrim(target_transaction_id)
    );
  end if;

  return target_purchase_id;
end;
$$;

create or replace function public.refund_ai_credit_purchase(
  target_transaction_id text,
  target_event_id text,
  target_refunded_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target_purchase public.billing_purchases%rowtype;
  target_grant public.ai_credit_grants%rowtype;
begin
  select *
  into target_purchase
  from public.billing_purchases
  where transaction_id = btrim(coalesce(target_transaction_id, ''))
     or original_transaction_id = btrim(coalesce(target_transaction_id, ''))
  order by purchased_at desc
  limit 1
  for update;

  if target_purchase.id is null then
    return false;
  end if;

  if target_purchase.status = 'refunded' then
    return true;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_purchase.user_id::text, 0));

  update public.billing_purchases
  set
    status = 'refunded',
    refunded_at = coalesce(target_refunded_at, now()),
    updated_at = now()
  where id = target_purchase.id;

  select *
  into target_grant
  from public.ai_credit_grants
  where purchase_id = target_purchase.id
  for update;

  if target_grant.id is not null then
    update public.ai_credit_grants
    set
      status = 'refunded',
      quantity_remaining = 0,
      updated_at = now()
    where id = target_grant.id;

    if target_grant.quantity_remaining > 0 then
      insert into public.ai_credit_ledger (
        user_id,
        grant_id,
        delta,
        reason,
        idempotency_key
      )
      values (
        target_purchase.user_id,
        target_grant.id,
        -target_grant.quantity_remaining,
        'refund',
        'refund:' || target_purchase.transaction_id || ':' ||
          btrim(coalesce(target_event_id, 'manual'))
      )
      on conflict (idempotency_key) do nothing;
    end if;
  end if;

  return true;
end;
$$;

create or replace function public.reverse_ai_credit_refund(
  target_transaction_id text,
  target_event_id text,
  target_reversed_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target_purchase public.billing_purchases%rowtype;
  target_grant public.ai_credit_grants%rowtype;
  restore_quantity integer := 0;
  reversal_inserted uuid;
begin
  select *
  into target_purchase
  from public.billing_purchases
  where transaction_id = btrim(coalesce(target_transaction_id, ''))
     or original_transaction_id = btrim(coalesce(target_transaction_id, ''))
  order by purchased_at desc
  limit 1
  for update;

  if target_purchase.id is null then
    return false;
  end if;

  if target_purchase.status = 'active' then
    return true;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_purchase.user_id::text, 0));

  select *
  into target_grant
  from public.ai_credit_grants
  where purchase_id = target_purchase.id
  for update;

  if target_grant.id is not null then
    select coalesce(abs(ledger.delta), 0)::integer
    into restore_quantity
    from public.ai_credit_ledger ledger
    where ledger.grant_id = target_grant.id
      and ledger.reason = 'refund'
    order by ledger.created_at desc
    limit 1;

    restore_quantity := least(
      target_grant.quantity_granted,
      coalesce(restore_quantity, 0)
    );

    if restore_quantity > 0 then
      insert into public.ai_credit_ledger (
        user_id,
        grant_id,
        delta,
        reason,
        idempotency_key
      )
      values (
        target_purchase.user_id,
        target_grant.id,
        restore_quantity,
        'refund_reversal',
        'refund-reversal:' || target_purchase.transaction_id || ':' ||
          btrim(coalesce(target_event_id, 'manual'))
      )
      on conflict (idempotency_key) do nothing
      returning id into reversal_inserted;
    end if;

    update public.ai_credit_grants
    set
      status = 'active',
      quantity_remaining = case
        when reversal_inserted is not null then restore_quantity
        else quantity_remaining
      end,
      updated_at = coalesce(target_reversed_at, now())
    where id = target_grant.id;
  end if;

  update public.billing_purchases
  set
    status = 'active',
    refunded_at = null,
    updated_at = coalesce(target_reversed_at, now())
  where id = target_purchase.id;

  return true;
end;
$$;

drop function if exists public.reserve_ai_report_usage(
  uuid,
  uuid,
  uuid,
  text,
  integer
);

create or replace function public.reserve_ai_report_usage(
  target_user_id uuid,
  target_pet_id uuid,
  target_episode_id uuid,
  target_model text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  reserved_usage_id uuid;
  selected_grant_id uuid;
  timed_out record;
  timed_out_grant_id uuid;
begin
  if target_user_id is null
    or target_pet_id is null
    or target_episode_id is null
    or btrim(coalesce(target_model, '')) = ''
  then
    raise exception 'Valid AI report reservation fields are required';
  end if;

  if not exists (
    select 1
    from public.episodes episode
    join public.pets pet
      on pet.id = episode.pet_id
     and pet.user_id = episode.user_id
    where episode.id = target_episode_id
      and episode.pet_id = target_pet_id
      and episode.user_id = target_user_id
  ) then
    raise exception 'AI report ownership could not be verified';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));
  perform public.ensure_ai_complimentary_credit(target_user_id);

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
      on conflict (idempotency_key) do nothing;

      if found then
        update public.ai_credit_grants
        set
          quantity_remaining = least(quantity_granted, quantity_remaining + 1),
          updated_at = now()
        where id = timed_out_grant_id;
      end if;
    end if;
  end loop;

  select grant_row.id
  into selected_grant_id
  from public.ai_credit_grants grant_row
  where grant_row.user_id = target_user_id
    and grant_row.status = 'active'
    and grant_row.quantity_remaining > 0
  order by
    case grant_row.source when 'complimentary' then 0 else 1 end,
    grant_row.granted_at,
    grant_row.id
  limit 1
  for update;

  if selected_grant_id is null then
    return null;
  end if;

  insert into public.ai_report_usage (
    user_id,
    pet_id,
    episode_id,
    status,
    model
  )
  values (
    target_user_id,
    target_pet_id,
    target_episode_id,
    'pending',
    btrim(target_model)
  )
  returning id into reserved_usage_id;

  update public.ai_credit_grants
  set
    quantity_remaining = quantity_remaining - 1,
    updated_at = now()
  where id = selected_grant_id;

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
    selected_grant_id,
    reserved_usage_id,
    -1,
    'usage',
    'usage:' || reserved_usage_id::text
  );

  return reserved_usage_id;
end;
$$;

create or replace function public.complete_ai_report_usage(
  target_usage_id uuid,
  target_user_id uuid,
  target_status text,
  target_model text,
  target_prompt_tokens integer,
  target_completion_tokens integer,
  target_total_tokens integer,
  target_estimated_cost_usd numeric,
  target_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target_usage public.ai_report_usage%rowtype;
  target_grant_id uuid;
  release_inserted uuid;
begin
  if target_status not in ('succeeded', 'failed') then
    raise exception 'AI report completion status is invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  select *
  into target_usage
  from public.ai_report_usage
  where id = target_usage_id
    and user_id = target_user_id
  for update;

  if target_usage.id is null then
    return false;
  end if;

  if target_usage.status <> 'pending' then
    return target_usage.status = target_status;
  end if;

  update public.ai_report_usage
  set
    status = target_status,
    model = nullif(btrim(coalesce(target_model, '')), ''),
    prompt_tokens = target_prompt_tokens,
    completion_tokens = target_completion_tokens,
    total_tokens = target_total_tokens,
    estimated_cost_usd = case
      when target_status = 'succeeded' then target_estimated_cost_usd
      else null
    end,
    error_code = target_error_code
  where id = target_usage_id;

  if target_status = 'failed' then
    select ledger.grant_id
    into target_grant_id
    from public.ai_credit_ledger ledger
    where ledger.usage_id = target_usage_id
      and ledger.reason = 'usage';

    if target_grant_id is not null then
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
        target_grant_id,
        target_usage_id,
        1,
        'usage_release',
        'usage-release:' || target_usage_id::text
      )
      on conflict (idempotency_key) do nothing
      returning id into release_inserted;

      if release_inserted is not null then
        update public.ai_credit_grants
        set
          quantity_remaining = least(quantity_granted, quantity_remaining + 1),
          updated_at = now()
        where id = target_grant_id
          and status = 'active';
      end if;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.ensure_ai_complimentary_credit(uuid)
  from public, anon, authenticated;
revoke all on function public.get_ai_credit_status(uuid)
  from public, anon, authenticated;
revoke all on function public.record_ai_credit_purchase(
  uuid, text, text, text, text, text, timestamptz, integer
) from public, anon, authenticated;
revoke all on function public.refund_ai_credit_purchase(text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.reverse_ai_credit_refund(text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.reserve_ai_report_usage(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.complete_ai_report_usage(
  uuid, uuid, text, text, integer, integer, integer, numeric, text
) from public, anon, authenticated;

grant execute on function public.ensure_ai_complimentary_credit(uuid) to service_role;
grant execute on function public.get_ai_credit_status(uuid) to service_role;
grant execute on function public.record_ai_credit_purchase(
  uuid, text, text, text, text, text, timestamptz, integer
) to service_role;
grant execute on function public.refund_ai_credit_purchase(text, text, timestamptz)
  to service_role;
grant execute on function public.reverse_ai_credit_refund(text, text, timestamptz)
  to service_role;
grant execute on function public.reserve_ai_report_usage(uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.complete_ai_report_usage(
  uuid, uuid, text, text, integer, integer, integer, numeric, text
) to service_role;

comment on table public.billing_purchases is
  'Verified store and web purchases. Each external transaction is recorded once.';
comment on table public.billing_events is
  'Idempotent RevenueCat webhook processing outcomes without raw payment payloads.';
comment on table public.ai_credit_grants is
  'AI summary credits granted by the complimentary allowance, verified purchases, or an administrator.';
comment on table public.ai_credit_ledger is
  'Immutable audit trail for AI summary credit grants, use, release, and refunds.';
