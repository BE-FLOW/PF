do $$
begin
  if exists (
    select 1
    from public.billing_purchases
    where store not in ('app_store', 'play_store')
  ) then
    raise exception 'Non-store billing purchases must be reviewed before migration';
  end if;
end;
$$;

alter table public.billing_purchases
  drop constraint if exists billing_purchases_store_check;

alter table public.billing_purchases
  add constraint billing_purchases_store_check
  check (store in ('app_store', 'play_store'));

comment on column public.billing_purchases.store is
  'Verified Apple App Store or Google Play transaction source.';

comment on table public.billing_purchases is
  'Verified Apple App Store and Google Play purchases. Each external transaction is recorded once.';
