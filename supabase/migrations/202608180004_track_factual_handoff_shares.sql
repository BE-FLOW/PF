alter table public.monetization_events
  drop constraint if exists monetization_events_event_name_check;

alter table public.monetization_events
  add constraint monetization_events_event_name_check
  check (
    event_name in (
      'paywall_viewed',
      'paywall_closed',
      'purchase_started',
      'purchase_cancelled',
      'purchase_failed',
      'purchase_sync_delayed',
      'purchase_history_checked',
      'ai_summary_shared',
      'factual_summary_shared'
    )
  );

comment on table public.monetization_events is
  'Service-role-only product events. The free release records AI and factual handoff share completion without copying health content.';

-- The server health check uses this marker to require the complete free-release
-- schema contract, rather than inferring readiness from one early migration.
create or replace function public.get_free_release_schema_version()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select '202608180004'::text;
$$;

revoke all on function public.get_free_release_schema_version()
  from public, anon, authenticated, service_role;
grant execute on function public.get_free_release_schema_version()
  to service_role;

comment on function public.get_free_release_schema_version() is
  'Service-role-only marker proving all 2026-08-18 free-release migrations were applied.';
