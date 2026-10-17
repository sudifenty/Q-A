-- Enable the Postgres Changes publication needed by the SmartPle mobile app.
-- Run only AFTER secure_smartple_profiles.sql succeeds.
-- This script does not alter grants or RLS policies. It stops unless the
-- profile table already matches the selected least-privilege security model.
-- Safe to run again: already-published tables are skipped.

begin;

do $$
declare
  v_table text;
  v_relkind text;
  v_policy_count integer;
  v_required_tables text[] := array[
    'smartple_assignments',
    'smartple_exam_assignments',
    'smartple_profiles',
    'smartple_nudges',
    'learning_events'
  ];
begin
  if not exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Missing supabase_realtime publication; stopped before changes.';
  end if;

  -- All expected tables must exist as physical/partitioned tables before any
  -- publication changes are made. learning_events powers the existing Admin Live page.
  foreach v_table in array v_required_tables loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'Missing public.%; stopped before publication changes.', v_table;
    end if;
    select c.relkind::text into v_relkind
    from pg_catalog.pg_class c
    where c.oid = to_regclass(format('public.%I', v_table));
    if v_relkind not in ('r', 'p') then
      raise exception 'public.% is not a publishable table; stopped before changes.', v_table;
    end if;
  end loop;

  -- Profile Realtime must remain private to each student and available to
  -- authenticated SmartPle admins. Require exactly the two scoped policies
  -- installed by secure_smartple_profiles.sql; reject legacy/broad policies.
  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = to_regclass('public.smartple_profiles')
  ) then
    raise exception 'RLS is not enabled on smartple_profiles; run the profile security patch first.';
  end if;

  select count(*) into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public' and tablename = 'smartple_profiles';

  if v_policy_count <> 2
     or exists (
       select 1 from pg_catalog.pg_policies
       where schemaname = 'public' and tablename = 'smartple_profiles'
         and policyname not in ('smartple_profiles_self_select', 'smartple_profiles_admin_update')
     )
     or not exists (
       select 1 from pg_catalog.pg_policies
       where schemaname = 'public' and tablename = 'smartple_profiles'
         and policyname = 'smartple_profiles_self_select'
         and cmd = 'SELECT'
         and array_to_string(roles, ',') = 'authenticated'
         and qual ilike '%user_id%'
         and qual ilike '%auth.uid%'
         and qual ilike '%smartple_profiles_admin_for_rls%'
     )
     or not exists (
       select 1 from pg_catalog.pg_policies
       where schemaname = 'public' and tablename = 'smartple_profiles'
         and policyname = 'smartple_profiles_admin_update'
         and cmd = 'UPDATE'
         and array_to_string(roles, ',') = 'authenticated'
         and qual ilike '%smartple_profiles_admin_for_rls%'
         and with_check ilike '%smartple_profiles_admin_for_rls%'
     ) then
    raise exception 'smartple_profiles policies are not the expected self/admin-only policies; stopped before publication changes.';
  end if;

  if to_regprocedure('public.smartple_profiles_admin_for_rls()') is null then
    raise exception 'Missing smartple_profiles_admin_for_rls(); run secure_smartple_profiles.sql first.';
  end if;

  -- Reject any direct anon/PUBLIC profile privileges (including column grants).
  if has_any_column_privilege('anon', 'public.smartple_profiles', 'SELECT')
     or has_any_column_privilege('anon', 'public.smartple_profiles', 'INSERT')
     or has_any_column_privilege('anon', 'public.smartple_profiles', 'UPDATE')
     or has_table_privilege('anon', 'public.smartple_profiles', 'DELETE') then
    raise exception 'anon/PUBLIC still has direct smartple_profiles privileges; stopped before publication changes.';
  end if;

  if not has_any_column_privilege('authenticated', 'public.smartple_profiles', 'SELECT')
     or not has_any_column_privilege('authenticated', 'public.smartple_profiles', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.smartple_profiles', 'INSERT')
     or has_table_privilege('authenticated', 'public.smartple_profiles', 'DELETE') then
    raise exception 'smartple_profiles grants do not match the selected model; stopped before publication changes.';
  end if;

  -- Only after all preflights pass, add the tables used by student controls,
  -- exam results, targeted announcements, and Admin Live Activity.
  foreach v_table in array v_required_tables loop
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

commit;
