-- Existing-install update: let the authorized Q-A admin repeat a completed set
-- or assign next-unused questions, and apply the shared P4→P5→P6→P7 question
-- sequence for every learner, regardless of their SmartPle class.
-- Safe to re-run, including if you applied an earlier copy of this migration.
-- It changes assignment functions/metadata only, not Auth accounts or profile rows.
-- For a fresh install, setup_shared_project.sql already includes these changes.

begin;

do $$
begin
  if to_regclass('public.daily_qa_assignments') is null
     or to_regclass('public.daily_qa_assignment_items') is null
     or to_regclass('public.daily_qa_questions') is null
     or to_regclass('public.daily_qa_profiles') is null then
    raise exception 'Q-A setup tables are missing. Run setup_shared_project.sql before this update.';
  end if;
  if to_regprocedure('public.daily_qa_is_admin()') is null
     or to_regprocedure('public.daily_qa_assignment_payload(uuid,text)') is null
     or to_regprocedure('public.daily_qa_effective_target()') is null
     or to_regprocedure('public.daily_qa_sync_my_profile()') is null then
    raise exception 'Q-A admin, profile-sync, or assignment functions are missing. Run setup_shared_project.sql first.';
  end if;
end;
$$;

alter table public.daily_qa_assignments
  add column if not exists assignment_type text not null default 'daily',
  add column if not exists source_assignment_id uuid,
  add column if not exists assigned_by uuid;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.daily_qa_assignments'::regclass
      and conname = 'daily_qa_assignments_assignment_type_check'
  ) then
    alter table public.daily_qa_assignments
      add constraint daily_qa_assignments_assignment_type_check
      check (assignment_type in ('daily','admin_new','admin_repeat'));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.daily_qa_assignments'::regclass
      and conname = 'daily_qa_assignments_source_assignment_id_fkey'
  ) then
    alter table public.daily_qa_assignments
      add constraint daily_qa_assignments_source_assignment_id_fkey
      foreign key (source_assignment_id)
      references public.daily_qa_assignments(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.daily_qa_assignments'::regclass
      and conname = 'daily_qa_assignments_assigned_by_fkey'
  ) then
    alter table public.daily_qa_assignments
      add constraint daily_qa_assignments_assigned_by_fkey
      foreign key (assigned_by)
      references auth.users(id) on delete set null;
  end if;
end;
$$;

-- Include set origin metadata in the student-facing, checked assignment RPC.
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
    'assignment_type', a.assignment_type,
    'source_assignment_id', a.source_assignment_id,
    'source_set_number', (select source.set_number from public.daily_qa_assignments source where source.id = a.source_assignment_id),
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

-- Update ordinary daily set generation to follow the shared P4→P7 sequence.
create or replace function public.daily_qa_get_or_start_set()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'Africa/Kampala')::date;
  v_target integer;
  v_subject text := 'Science';
  v_profile public.daily_qa_profiles%rowtype;
  v_assignment public.daily_qa_assignments%rowtype;
  v_available integer := 0;
  v_take integer := 0;
  v_set_number integer := 1;
begin
  if v_user is null then
    raise exception using errcode = '28000', message = 'Sign in is required.';
  end if;

  perform public.daily_qa_sync_my_profile();
  select * into v_profile from public.daily_qa_profiles where user_id = v_user;
  if not found or v_profile.role <> 'student' then
    raise exception using errcode = '42501', message = 'A student profile is required.';
  end if;

  v_target := public.daily_qa_effective_target();
  if v_target = 0 then
    return jsonb_build_object(
      'status', 'paused', 'target', 0,
      'message', 'Daily Q&A is paused by your admin.'
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

  -- A completed set counts for its assigned day. Never stack another set that day.
  select * into v_assignment
  from public.daily_qa_assignments
  where user_id = v_user
  order by set_number desc
  limit 1;
  if found and v_assignment.status = 'completed' and v_assignment.assigned_date >= v_today then
    return public.daily_qa_assignment_payload(v_assignment.id, 'complete');
  end if;

  -- Do not repeat a question for the same learner.
  select count(*) into v_available
  from public.daily_qa_questions q
  where q.is_active and q.grade in ('P4','P5','P6','P7') and q.subject = v_subject
    and not exists (
      select 1 from public.daily_qa_assignment_items i
      join public.daily_qa_assignments a on a.id = i.assignment_id
      where a.user_id = v_user and i.question_id = q.id
    );

  if v_available = 0 then
    return jsonb_build_object(
      'status', 'exhausted', 'target', v_target, 'grade_order', 'P4-P7', 'subject', v_subject,
      'message', 'The shared P4-P7 question sequence is exhausted or not yet available.'
    );
  end if;

  v_take := least(v_target, v_available);
  select coalesce(max(set_number), 0) + 1 into v_set_number
  from public.daily_qa_assignments where user_id = v_user;

  insert into public.daily_qa_assignments (
    user_id, set_number, assigned_date, requested_target, target_count, status
  ) values (v_user, v_set_number, v_today, v_target, v_take, 'active')
  returning * into v_assignment;

  insert into public.daily_qa_assignment_items (assignment_id, question_id, position)
  select v_assignment.id, selected.id,
         row_number() over (
           order by case selected.grade when 'P4' then 1 when 'P5' then 2 when 'P6' then 3 when 'P7' then 4 end,
                    selected.sort_order, selected.id
         )::integer
  from (
    select q.id, q.grade, q.sort_order from public.daily_qa_questions q
    where q.is_active and q.grade in ('P4','P5','P6','P7') and q.subject = v_subject
      and not exists (
        select 1 from public.daily_qa_assignment_items i
        join public.daily_qa_assignments a on a.id = i.assignment_id
        where a.user_id = v_user and i.question_id = q.id
      )
    order by case q.grade when 'P4' then 1 when 'P5' then 2 when 'P6' then 3 when 'P7' then 4 end,
             q.sort_order, q.id
    limit v_take
  ) as selected;

  return public.daily_qa_assignment_payload(v_assignment.id, 'active');
end;
$$;
revoke all on function public.daily_qa_get_or_start_set() from public, anon;
grant execute on function public.daily_qa_get_or_start_set() to authenticated;

-- Admin can assign one additional set after the learner's latest set is complete.
-- A source assignment repeats that completed set; NULL means next unused questions
-- from the shared sequence (P4 first, followed by P5, P6, and P7) for every learner.
create or replace function public.daily_qa_admin_assign_set(
  p_user_id uuid,
  p_source_assignment_id uuid default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_today date := (now() at time zone 'Africa/Kampala')::date;
  v_profile public.daily_qa_profiles%rowtype;
  v_latest public.daily_qa_assignments%rowtype;
  v_source public.daily_qa_assignments%rowtype;
  v_assignment public.daily_qa_assignments%rowtype;
  v_subject text := 'Science';
  v_target integer;
  v_available integer := 0;
  v_take integer := 0;
  v_set_number integer := 1;
begin
  if v_admin is null then
    raise exception using errcode = '28000', message = 'Sign in is required.';
  end if;
  if not public.daily_qa_is_admin() then
    raise exception using errcode = '42501', message = 'Q-A administrator access is required.';
  end if;
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Choose a student first.';
  end if;

  -- Require a current student role in both the Q-A map and SmartPle source.
  select p.* into v_profile
  from public.daily_qa_profiles p
  join public.smartple_profiles s on s.user_id = p.user_id
  where p.user_id = p_user_id and p.role = 'student' and s.role = 'student';
  if not found then
    raise exception using errcode = '42501', message = 'A current SmartPle student profile is required.';
  end if;

  -- Resolve the selected student's target (not the signed-in admin's target).
  select coalesce(
    (select s.target_per_day from public.daily_qa_settings s where s.user_id = p_user_id),
    (select c.target_per_day
       from public.daily_qa_profiles p
       join public.daily_qa_class_settings c on c.class_name = p.class
      where p.user_id = p_user_id),
    (select g.target_per_day from public.daily_qa_global_settings g where g.id = true),
    20
  ) into v_target;
  if v_target <= 0 then
    raise exception using errcode = '42501', message = 'This student is paused. Set a positive student, class, or global target before assigning another set.';
  end if;

  -- Serialize against the learner's get-or-start RPC and other admin actions.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  if exists (
    select 1 from public.daily_qa_assignments a
    where a.user_id = p_user_id and a.status = 'active'
  ) then
    raise exception using errcode = '55000', message = 'The student still has an active set. Assign another set after it is complete.';
  end if;

  select * into v_latest
  from public.daily_qa_assignments a
  where a.user_id = p_user_id
  order by a.set_number desc
  limit 1
  for update;
  if not found or v_latest.status <> 'completed' then
    raise exception using errcode = '55000', message = 'The student must finish their current set before another can be assigned.';
  end if;

  select coalesce(max(a.set_number), 0) + 1 into v_set_number
  from public.daily_qa_assignments a
  where a.user_id = p_user_id;

  if p_source_assignment_id is not null then
    select * into v_source
    from public.daily_qa_assignments a
    where a.id = p_source_assignment_id
      and a.user_id = p_user_id
      and a.status = 'completed'
    for update;
    if not found then
      raise exception using errcode = '22023', message = 'Choose one of this student’s completed sets to repeat.';
    end if;

    select count(*)::integer into v_take
    from public.daily_qa_assignment_items i
    where i.assignment_id = v_source.id;
    if v_take = 0 then
      raise exception using errcode = '22023', message = 'The selected completed set has no questions to repeat.';
    end if;
    if exists (
      select 1
      from public.daily_qa_assignment_items i
      join public.daily_qa_questions q on q.id = i.question_id
      where i.assignment_id = v_source.id
        and (q.grade not in ('P4','P5','P6','P7') or q.subject <> v_subject)
    ) then
      raise exception using errcode = '22023', message = 'The selected set contains questions outside the shared P4-P7 Science bank.';
    end if;

    insert into public.daily_qa_assignments (
      user_id, set_number, assigned_date, requested_target, target_count,
      completed_count, status, assignment_type, source_assignment_id, assigned_by
    ) values (
      p_user_id, v_set_number, v_today, v_source.requested_target, v_take,
      0, 'active', 'admin_repeat', v_source.id, v_admin
    ) returning * into v_assignment;

    insert into public.daily_qa_assignment_items (assignment_id, question_id, position)
    select v_assignment.id, i.question_id, i.position
    from public.daily_qa_assignment_items i
    where i.assignment_id = v_source.id
    order by i.position;
  else
    select count(*)::integer into v_available
    from public.daily_qa_questions q
    where q.is_active and q.grade in ('P4','P5','P6','P7') and q.subject = v_subject
      and not exists (
        select 1 from public.daily_qa_assignment_items i
        join public.daily_qa_assignments a on a.id = i.assignment_id
        where a.user_id = p_user_id and i.question_id = q.id
      );
    if v_available = 0 then
      raise exception using errcode = '22023', message = 'No unused questions remain in the shared P4-P7 sequence.';
    end if;

    v_take := least(v_target, v_available);
    insert into public.daily_qa_assignments (
      user_id, set_number, assigned_date, requested_target, target_count,
      completed_count, status, assignment_type, source_assignment_id, assigned_by
    ) values (
      p_user_id, v_set_number, v_today, v_target, v_take,
      0, 'active', 'admin_new', null, v_admin
    ) returning * into v_assignment;

    insert into public.daily_qa_assignment_items (assignment_id, question_id, position)
    select v_assignment.id, selected.id,
           row_number() over (order by case selected.grade when 'P4' then 1 when 'P5' then 2 when 'P6' then 3 when 'P7' then 4 end, selected.sort_order, selected.id)::integer
    from (
      select q.id, q.grade, q.sort_order
      from public.daily_qa_questions q
      where q.is_active and q.grade in ('P4','P5','P6','P7') and q.subject = v_subject
        and not exists (
          select 1 from public.daily_qa_assignment_items i
          join public.daily_qa_assignments a on a.id = i.assignment_id
          where a.user_id = p_user_id and i.question_id = q.id
        )
      order by case q.grade when 'P4' then 1 when 'P5' then 2 when 'P6' then 3 when 'P7' then 4 end,
               q.sort_order, q.id
      limit v_take
    ) as selected;
  end if;

  return public.daily_qa_assignment_payload(v_assignment.id, 'active');
end;
$$;
revoke all on function public.daily_qa_admin_assign_set(uuid, uuid) from public, anon;
grant execute on function public.daily_qa_admin_assign_set(uuid, uuid) to authenticated;

commit;
