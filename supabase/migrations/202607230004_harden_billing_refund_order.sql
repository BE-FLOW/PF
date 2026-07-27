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
  normalized_transaction_id text :=
    btrim(coalesce(target_transaction_id, ''));
  target_purchase_id uuid;
  target_user_id uuid;
  target_purchase public.billing_purchases%rowtype;
  target_grant public.ai_credit_grants%rowtype;
begin
  if normalized_transaction_id = '' then
    return false;
  end if;

  select purchase.id, purchase.user_id
  into target_purchase_id, target_user_id
  from public.billing_purchases purchase
  where purchase.transaction_id = normalized_transaction_id
     or purchase.original_transaction_id = normalized_transaction_id
  order by
    (purchase.transaction_id = normalized_transaction_id) desc,
    purchase.purchased_at desc
  limit 1;

  if target_purchase_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  select *
  into target_purchase
  from public.billing_purchases
  where id = target_purchase_id
  for update;

  if target_purchase.id is null then
    return false;
  end if;

  if target_purchase.status = 'refunded' then
    return true;
  end if;

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
  normalized_transaction_id text :=
    btrim(coalesce(target_transaction_id, ''));
  target_purchase_id uuid;
  target_user_id uuid;
  target_purchase public.billing_purchases%rowtype;
  target_grant public.ai_credit_grants%rowtype;
  restore_quantity integer := 0;
  reversal_inserted uuid;
begin
  if normalized_transaction_id = '' then
    return false;
  end if;

  select purchase.id, purchase.user_id
  into target_purchase_id, target_user_id
  from public.billing_purchases purchase
  where purchase.transaction_id = normalized_transaction_id
     or purchase.original_transaction_id = normalized_transaction_id
  order by
    (purchase.transaction_id = normalized_transaction_id) desc,
    purchase.purchased_at desc
  limit 1;

  if target_purchase_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  select *
  into target_purchase
  from public.billing_purchases
  where id = target_purchase_id
  for update;

  if target_purchase.id is null then
    return false;
  end if;

  if target_purchase.status = 'active' then
    return true;
  end if;

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

revoke all on function public.refund_ai_credit_purchase(
  text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.reverse_ai_credit_refund(
  text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.refund_ai_credit_purchase(
  text, text, timestamptz
) to service_role;
grant execute on function public.reverse_ai_credit_refund(
  text, text, timestamptz
) to service_role;

comment on function public.refund_ai_credit_purchase(
  text, text, timestamptz
) is
  'Revokes only unused purchased AI credits, preferring an exact external transaction match.';
comment on function public.reverse_ai_credit_refund(
  text, text, timestamptz
) is
  'Restores only the unused AI credits previously removed by a refunded transaction.';
