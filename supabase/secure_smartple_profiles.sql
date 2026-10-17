-- SmartPle profile least-privilege patch.
-- Run in the existing Supabase project only after reviewing the preflight.
-- This preserves all profile rows and existing non-profile tables.
--
-- Target model:
--   * anon/PUBLIC: no direct access to smartple_profiles
--   * student: SELECT their own profile only
--   * SmartPle admin: SELECT and UPDATE profiles for existing admin controls
--   * authenticated students: no direct INSERT, UPDATE, or DELETE
--   * signup/profile-maintenance SECURITY DEFINER functions remain unaffected
--
-- Known legacy policy names are accepted and replaced after the preflight.
-- Any other profile policy name stops the transaction before changes are made.

begin;

do $$
declare
  v_unexpected_policies text;
  v_non_broad_legacy_policies text;
begin
  if to_regclass('public.smartple_profiles') is null then
    raise exception 'Missing public.smartple_profiles; stopped before changes.';
  end if;
  if not exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='smartple_profiles' and column_name='user_id'
     )
     or not exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='smartple_profiles' and column_name='role'
     ) then
    raise exception 'smartple_profiles must have user_id and role columns; stopped before changes.';
  end if;

  select string_agg(policyname, ', ' order by policyname)
    into v_unexpected_policies
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'smartple_profiles'
    and policyname not in (
      'allow all',
      'Allow all',
      'allow all profiles',
      'allow_all_profiles',
      'smartple_allow_all',
      'profiles_self',
      'smartple_profiles_self_select',
      'smartple_profiles_admin_update'
    );

  if v_unexpected_policies is not null then
    raise exception 'Unexpected smartple_profiles policy/policies found (%). No changes made; review them first.', v_unexpected_policies;
  end if;

  -- These two additional names were reported in the project's preflight
  -- error. Accept them only if they really are unconditional ALL policies.
  select string_agg(policyname, ', ' order by policyname)
    into v_non_broad_legacy_policies
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'smartple_profiles'
    and policyname in ('Allow all', 'allow_all_profiles')
    and (
      cmd <> 'ALL'
      or coalesce(qual, '') !~* '^[[:space:]()]*true[[:space:]()]*$'
      or (with_check is not null and with_check !~* '^[[:space:]()]*true[[:space:]()]*$')
    );

  if v_non_broad_legacy_policies is not null then
    raise exception 'Policy/policies (%) have a known legacy name but are not unconditional ALL policies. No changes made; review them first.', v_non_broad_legacy_policies;
  end if;
end;
$$;

-- SECURITY DEFINER avoids RLS recursion when checking an admin's role.
-- It exposes only whether the current Auth user is a SmartPle admin.
create or replace function public.smartple_profiles_admin_for_rls()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.smartple_profiles p
    where p.user_id = (select auth.uid())
      and p.role = 'admin'
  );
$$;
revoke all on function public.smartple_profiles_admin_for_rls() from public, anon, authenticated;
grant execute on function public.smartple_profiles_admin_for_rls() to authenticated;

-- Remove table-level and any column-level browser grants before re-granting
-- only what the policies below require.
do $$
declare
  v_column record;
begin
  for v_column in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'smartple_profiles'
  loop
    execute format(
      'revoke all privileges (%I) on table public.smartple_profiles from public, anon, authenticated',
      v_column.column_name
    );
  end loop;
end;
$$;
revoke all privileges on table public.smartple_profiles from public, anon, authenticated;

-- Remove only known policies; preflight above aborts on an unrecognized name.
drop policy if exists "allow all" on public.smartple_profiles;
drop policy if exists "Allow all" on public.smartple_profiles;
drop policy if exists "allow all profiles" on public.smartple_profiles;
drop policy if exists allow_all_profiles on public.smartple_profiles;
drop policy if exists smartple_allow_all on public.smartple_profiles;
drop policy if exists profiles_self on public.smartple_profiles;
drop policy if exists smartple_profiles_self_select on public.smartple_profiles;
drop policy if exists smartple_profiles_admin_update on public.smartple_profiles;

create policy smartple_profiles_self_select
on public.smartple_profiles
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.smartple_profiles_admin_for_rls()
);

create policy smartple_profiles_admin_update
on public.smartple_profiles
for update to authenticated
using (public.smartple_profiles_admin_for_rls())
with check (public.smartple_profiles_admin_for_rls());

alter table public.smartple_profiles enable row level security;
grant select, update on table public.smartple_profiles to authenticated;

commit;
