-- Standalone Daily Q&A schema for its own Supabase project.
-- Run this migration before seed_daily_qa.sql. It does not depend on the SmartPle admin schema.

create extension if not exists pgcrypto;

-- Standalone identity/profile table. Auth users are students by default; admin roles
-- must be assigned manually by the project owner in the Supabase SQL Editor.
create table if not exists public.daily_qa_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Student',
  class text,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now()
);

-- Create a least-privilege student profile whenever a new Auth user is created.
create or replace function public.daily_qa_handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.daily_qa_profiles (user_id, display_name, class, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Student'
    ),
    nullif(new.raw_user_meta_data ->> 'class', ''),
    'student'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.daily_qa_handle_new_user() from public, anon, authenticated;
drop trigger if exists daily_qa_auth_user_created on auth.users;
create trigger daily_qa_auth_user_created
  after insert on auth.users
  for each row execute function public.daily_qa_handle_new_user();

-- Backfill Auth users that existed before this migration; never overwrite an assigned role.
insert into public.daily_qa_profiles (user_id, display_name, class, role)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'display_name', ''),
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Student'
  ),
  nullif(u.raw_user_meta_data ->> 'class', ''),
  'student'
from auth.users u
on conflict (user_id) do nothing;

-- Q&A records imported from the guide. Question text and answer are displayed together.
create table if not exists public.daily_qa_questions (
  id text primary key,
  grade text not null check (grade in ('P4','P5','P6','P7')),
  subject text not null,
  topic text not null,
  sort_order integer not null,
  prompt text not null,
  answer text not null,
  source_file text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (grade, subject, sort_order)
);
create index if not exists daily_qa_question_bank_idx
  on public.daily_qa_questions (grade, subject, is_active, sort_order);

-- Per-student admin controls. Changes to target apply to the next set;
-- an already-started set retains its original target.
create table if not exists public.daily_qa_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  target_per_day integer not null default 20 check (target_per_day between 1 and 500),
  grade text not null default 'P4' check (grade in ('P4','P5','P6','P7')),
  subject text not null default 'Science',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- One set per student at a time. The active set is resumed across days;
-- a new set is made only after the active set has been cleared.
create table if not exists public.daily_qa_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  set_number integer not null,
  assigned_date date not null,
  requested_target integer not null check (requested_target between 1 and 500),
  target_count integer not null check (target_count between 1 and 500),
  completed_count integer not null default 0 check (completed_count between 0 and 500),
  status text not null default 'active' check (status in ('active','completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, set_number)
);
create index if not exists daily_qa_assignment_user_idx
  on public.daily_qa_assignments (user_id, set_number desc);
create unique index if not exists daily_qa_one_active_set_per_student_idx
  on public.daily_qa_assignments (user_id) where status = 'active';

-- Snapshot of the assigned question order, plus a server timestamp when studied.
create table if not exists public.daily_qa_assignment_items (
  assignment_id uuid not null references public.daily_qa_assignments(id) on delete cascade,
  question_id text not null references public.daily_qa_questions(id) on delete restrict,
  position integer not null,
  completed_at timestamptz,
  primary key (assignment_id, question_id),
  unique (assignment_id, position)
);
create index if not exists daily_qa_items_assignment_idx
  on public.daily_qa_assignment_items (assignment_id, position);

-- Only this project's assigned admins can manage settings or read all student progress.
create or replace function public.daily_qa_is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.daily_qa_profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;
revoke all on function public.daily_qa_is_admin() from public, anon;
grant execute on function public.daily_qa_is_admin() to authenticated;

alter table public.daily_qa_profiles enable row level security;
revoke all on public.daily_qa_profiles from anon, authenticated;
grant select on public.daily_qa_profiles to authenticated;
drop policy if exists daily_qa_profiles_self_or_admin_read on public.daily_qa_profiles;
create policy daily_qa_profiles_self_or_admin_read on public.daily_qa_profiles
  for select to authenticated using (user_id = auth.uid() or public.daily_qa_is_admin());

alter table public.daily_qa_questions enable row level security;
alter table public.daily_qa_settings enable row level security;
alter table public.daily_qa_assignments enable row level security;
alter table public.daily_qa_assignment_items enable row level security;

grant select, insert, update, delete on public.daily_qa_questions to authenticated;
grant select, insert, update, delete on public.daily_qa_settings to authenticated;
grant select on public.daily_qa_assignments to authenticated;
grant select on public.daily_qa_assignment_items to authenticated;

-- Signed-in learners can read the guide. Only admins can manage its content.
drop policy if exists daily_qa_questions_read on public.daily_qa_questions;
create policy daily_qa_questions_read on public.daily_qa_questions
  for select to authenticated using (is_active or public.daily_qa_is_admin());
drop policy if exists daily_qa_questions_admin on public.daily_qa_questions;
create policy daily_qa_questions_admin on public.daily_qa_questions
  for all to authenticated using (public.daily_qa_is_admin())
  with check (public.daily_qa_is_admin());

-- A learner can read only their own daily settings; admins can read/write all.
drop policy if exists daily_qa_settings_self_read on public.daily_qa_settings;
create policy daily_qa_settings_self_read on public.daily_qa_settings
  for select to authenticated using (user_id = auth.uid() or public.daily_qa_is_admin());
drop policy if exists daily_qa_settings_admin_write on public.daily_qa_settings;
create policy daily_qa_settings_admin_write on public.daily_qa_settings
  for all to authenticated using (public.daily_qa_is_admin())
  with check (public.daily_qa_is_admin());

-- Progress rows are read-only from clients; the completion RPC writes them.
drop policy if exists daily_qa_assignments_self_read on public.daily_qa_assignments;
create policy daily_qa_assignments_self_read on public.daily_qa_assignments
  for select to authenticated using (user_id = auth.uid() or public.daily_qa_is_admin());
drop policy if exists daily_qa_assignments_admin_all on public.daily_qa_assignments;
create policy daily_qa_assignments_admin_all on public.daily_qa_assignments
  for all to authenticated using (public.daily_qa_is_admin())
  with check (public.daily_qa_is_admin());

drop policy if exists daily_qa_items_self_read on public.daily_qa_assignment_items;
create policy daily_qa_items_self_read on public.daily_qa_assignment_items
  for select to authenticated using (
    exists (
      select 1 from public.daily_qa_assignments a
      where a.id = assignment_id and (a.user_id = auth.uid() or public.daily_qa_is_admin())
    )
  );
drop policy if exists daily_qa_items_admin_all on public.daily_qa_assignment_items;
create policy daily_qa_items_admin_all on public.daily_qa_assignment_items
  for all to authenticated using (public.daily_qa_is_admin())
  with check (public.daily_qa_is_admin());

-- Return a payload containing one set's items, in order. Internal helper:
-- direct execution is revoked below; learner access is through the checked RPCs.
create or replace function public.daily_qa_assignment_payload(p_assignment_id uuid, p_status text default null)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'status', coalesce(p_status, a.status),
    'assignment_id', a.id,
    'set_number', a.set_number,
    'assigned_date', a.assigned_date,
    'target', a.target_count,
    'requested_target', a.requested_target,
    'completed_count', a.completed_count,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question_id', q.id,
        'position', i.position,
        'grade', q.grade,
        'subject', q.subject,
        'topic', q.topic,
        'question', q.prompt,
        'answer', q.answer,
        'completed_at', i.completed_at
      ) order by i.position)
      from public.daily_qa_assignment_items i
      join public.daily_qa_questions q on q.id = i.question_id
      where i.assignment_id = a.id
    ), '[]'::jsonb)
  )
  from public.daily_qa_assignments a
  where a.id = p_assignment_id;
$$;
revoke all on function public.daily_qa_assignment_payload(uuid, text) from public, anon, authenticated;

-- Get the active set or make today's set, serializing concurrent app opens.
-- If a student is behind, the same active set is returned until it is complete.
-- After a set is finished, no further set is generated on that same calendar day.
create or replace function public.daily_qa_get_or_start_set()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_setting public.daily_qa_settings%rowtype;
  v_assignment public.daily_qa_assignments%rowtype;
  v_available integer := 0;
  v_take integer := 0;
  v_set_number integer := 1;
begin
  if v_user is null then
    raise exception using errcode = '28000', message = 'Sign in is required.';
  end if;

  select * into v_setting
  from public.daily_qa_settings
  where user_id = v_user;

  if not found then
    return jsonb_build_object(
      'status', 'paused',
      'target', 20,
      'message', 'Daily Q&A is not currently enabled by your admin.'
    );
  end if;
  if not v_setting.enabled then
    return jsonb_build_object(
      'status', 'paused',
      'target', v_setting.target_per_day,
      'message', 'Daily Q&A is not currently enabled by your admin.'
    );
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text));

  -- Always resume an unfinished set, even if its assigned date has passed.
  select * into v_assignment
  from public.daily_qa_assignments
  where user_id = v_user and status = 'active'
  order by set_number desc
  limit 1
  for update;

  if found then
    return public.daily_qa_assignment_payload(v_assignment.id, 'active');
  end if;

  -- A completed set counts for its assigned day. Do not create a second set
  -- for the same student on that day, even if it was completed early.
  select * into v_assignment
  from public.daily_qa_assignments
  where user_id = v_user
  order by set_number desc
  limit 1;

  if found and v_assignment.status = 'completed' and v_assignment.assigned_date >= v_today then
    return public.daily_qa_assignment_payload(v_assignment.id, 'complete');
  end if;

  -- Never reuse a question for the same student. Stop cleanly when the bank is exhausted.
  select count(*) into v_available
  from public.daily_qa_questions q
  where q.is_active
    and q.grade = v_setting.grade
    and q.subject = v_setting.subject
    and not exists (
      select 1
      from public.daily_qa_assignment_items i
      join public.daily_qa_assignments a on a.id = i.assignment_id
      where a.user_id = v_user and i.question_id = q.id
    );

  if v_available = 0 then
    return jsonb_build_object(
      'status', 'exhausted',
      'target', v_setting.target_per_day,
      'grade', v_setting.grade,
      'subject', v_setting.subject,
      'message', 'The question bank is exhausted. Ask your admin to add more Q&A items.'
    );
  end if;

  v_take := least(v_setting.target_per_day, v_available);
  select coalesce(max(set_number), 0) + 1 into v_set_number
  from public.daily_qa_assignments where user_id = v_user;

  insert into public.daily_qa_assignments (
    user_id, set_number, assigned_date, requested_target, target_count, status
  ) values (
    v_user, v_set_number, v_today, v_setting.target_per_day, v_take, 'active'
  ) returning * into v_assignment;

  insert into public.daily_qa_assignment_items (assignment_id, question_id, position)
  select v_assignment.id, selected.id,
         row_number() over (order by selected.sort_order, selected.id)::integer
  from (
    select q.id, q.sort_order
    from public.daily_qa_questions q
    where q.is_active
      and q.grade = v_setting.grade
      and q.subject = v_setting.subject
      and not exists (
        select 1
        from public.daily_qa_assignment_items i
        join public.daily_qa_assignments a on a.id = i.assignment_id
        where a.user_id = v_user and i.question_id = q.id
      )
    order by q.sort_order, q.id
    limit v_take
  ) as selected;

  return public.daily_qa_assignment_payload(v_assignment.id, 'active');
end;
$$;

-- Mark one assigned item as studied. Idempotent: repeated taps never add twice.
-- When every item is marked, the set completion timestamp is written in the same transaction.
create or replace function public.daily_qa_complete_item(
  p_assignment_id uuid,
  p_question_id text
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_enabled boolean;
  v_assignment public.daily_qa_assignments%rowtype;
  v_done integer;
begin
  if v_user is null then
    raise exception using errcode = '28000', message = 'Sign in is required.';
  end if;

  select enabled into v_enabled
  from public.daily_qa_settings
  where user_id = v_user;
  if coalesce(v_enabled, false) = false then
    raise exception using errcode = '42501', message = 'Daily Q&A is paused by your admin.';
  end if;

  select * into v_assignment
  from public.daily_qa_assignments
  where id = p_assignment_id and user_id = v_user and status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'This question set is no longer active.';
  end if;

  update public.daily_qa_assignment_items
  set completed_at = coalesce(completed_at, now())
  where assignment_id = p_assignment_id and question_id = p_question_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Question does not belong to this set.';
  end if;

  select (count(*) filter (where completed_at is not null))::integer
  into v_done
  from public.daily_qa_assignment_items
  where assignment_id = p_assignment_id;

  update public.daily_qa_assignments
  set completed_count = v_done,
      status = case when v_done >= target_count then 'completed' else 'active' end,
      completed_at = case when v_done >= target_count then coalesce(completed_at, now()) else null end
  where id = p_assignment_id
  returning * into v_assignment;

  return public.daily_qa_assignment_payload(
    p_assignment_id,
    case when v_assignment.status = 'completed' then 'complete' else 'active' end
  );
end;
$$;

revoke all on function public.daily_qa_get_or_start_set() from public, anon;
revoke all on function public.daily_qa_complete_item(uuid, text) from public, anon;
grant execute on function public.daily_qa_get_or_start_set() to authenticated;
grant execute on function public.daily_qa_complete_item(uuid, text) to authenticated;

-- Bootstrap the administrator after creating that user in Supabase Auth. Replace the email:
-- update public.daily_qa_profiles
-- set role = 'admin'
-- where user_id = (select id from auth.users where email = 'admin@example.com');
-- Verify: select user_id, display_name, class, role from public.daily_qa_profiles;
-- Verify bank: select grade, subject, count(*) from public.daily_qa_questions group by grade, subject;
