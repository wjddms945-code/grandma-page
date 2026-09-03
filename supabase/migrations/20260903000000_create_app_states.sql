create table if not exists public.app_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{"projects":[],"memos":[],"summaries":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint app_states_payload_is_object check (jsonb_typeof(payload) = 'object')
);

create or replace function public.set_app_state_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_app_state_updated_at on public.app_states;
create trigger set_app_state_updated_at
before update on public.app_states
for each row execute function public.set_app_state_updated_at();

alter table public.app_states enable row level security;

revoke all on table public.app_states from anon;
revoke all on table public.app_states from authenticated;
grant select, insert, update on table public.app_states to authenticated;

drop policy if exists "Users can read their own app state" on public.app_states;
create policy "Users can read their own app state"
on public.app_states
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can insert their own app state" on public.app_states;
create policy "Users can insert their own app state"
on public.app_states
for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can update their own app state" on public.app_states;
create policy "Users can update their own app state"
on public.app_states
for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_states'
  ) then
    alter publication supabase_realtime add table public.app_states;
  end if;
end
$$;
