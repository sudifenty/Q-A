-- Existing-install update: admin-assigned Science/SST subject routing for each student,
-- plus the same daily-set, progress, repeat and next-unused behavior for both subjects.
-- SST is now 168 distinct questions (one per learning point), ordered P3 through P7.
-- Earlier paraphrase rows are deactivated, not deleted; saved assignment/progress rows stay intact.
-- New sets use the student's effective daily target (20 by default); subject changes apply next set.
-- Safe to re-run, including if an earlier 2,040-row SST migration was already applied.
-- Fresh setup_shared_project.sql already includes the matching schema and banks.

begin;

do $$
begin
  if to_regclass('public.daily_qa_assignments') is null
     or to_regclass('public.daily_qa_assignment_items') is null
     or to_regclass('public.daily_qa_questions') is null
     or to_regclass('public.daily_qa_profiles') is null
     or to_regclass('public.daily_qa_settings') is null then
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
  add column if not exists assigned_by uuid,
  add column if not exists subject text not null default 'Science';

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
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.daily_qa_assignments'::regclass
      and conname = 'daily_qa_assignments_subject_check'
  ) then
    alter table public.daily_qa_assignments
      add constraint daily_qa_assignments_subject_check
      check (subject in ('Science','SST'));
  end if;
end;
$$;

-- SST is question-only: options carry only the unmarked choice text; answer is NULL.
-- source_number is the compact learner-facing order; sort_order retains original source ordering.
alter table public.daily_qa_questions add column if not exists options jsonb;
alter table public.daily_qa_questions add column if not exists source_number integer;
update public.daily_qa_questions set source_number = sort_order where source_number is null;
alter table public.daily_qa_questions alter column answer drop not null;
alter table public.daily_qa_questions drop constraint if exists daily_qa_questions_grade_check;
alter table public.daily_qa_questions
  add constraint daily_qa_questions_grade_check check (grade in ('P3','P4','P5','P6','P7'));

-- The admin-only per-student subject assignment shares the existing target table.
alter table public.daily_qa_settings
  add column if not exists subject text not null default 'Science';
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.daily_qa_settings'::regclass
      and conname = 'daily_qa_settings_subject_check'
  ) then
    alter table public.daily_qa_settings
      add constraint daily_qa_settings_subject_check check (subject in ('Science','SST'));
  end if;
end;
$$;

-- Enforce the admin-assigned subject when a learner reads the bank directly.
-- Q-A admins retain access to both banks through the existing admin gate.
drop policy if exists daily_qa_questions_read on public.daily_qa_questions;
create policy daily_qa_questions_read on public.daily_qa_questions
  for select to authenticated using (
    public.daily_qa_is_admin()
    or (is_active and subject = coalesce(
      (select s.subject from public.daily_qa_settings s where s.user_id = auth.uid()),
      'Science'
    ))
  );

-- BEGIN GENERATED SST QUESTION-ONLY BANK
-- 168 unique P3-P7 SST questions; answer is NULL for every row.
-- One question per learning point, compact source order P3 Q1 through P7 Q168; choices are unmarked.
insert into public.daily_qa_questions
  (id, grade, subject, topic, sort_order, source_number, prompt, answer, options, source_file, is_active)
values
  ('sst-p3-1', 'P3', 'SST', 'Our Sub-County/Division', 1, 1, 'What is a sub-county?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A local government administrative area below a county and above a parish in many rural areas.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p3-13', 'P3', 'SST', 'Our Sub-County/Division', 13, 2, 'What is a division?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","An administrative area used to organise local government in many urban areas."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p3-25', 'P3', 'SST', 'Our Sub-County/Division', 25, 3, 'Name one local administrative unit below a sub-county or division.', NULL, '["A parish or ward, depending on the local government structure.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p3-37', 'P3', 'SST', 'Our Sub-County/Division', 37, 4, 'Why are boundaries important in a sub-county or division?', NULL, '["A type of weather observed for one afternoon.","They show the area each local authority is responsible for.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p3-49', 'P3', 'SST', 'Our Sub-County/Division', 49, 5, 'Give one way a child can help keep the sub-county clean.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Use rubbish bins and avoid littering.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p3-61', 'P3', 'SST', 'Livelihood in our Sub-County', 61, 6, 'What is a livelihood?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","The way people earn a living and obtain the things they need.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p3-73', 'P3', 'SST', 'Livelihood in our Sub-County', 73, 7, 'Name one common livelihood activity in many Ugandan communities.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","Farming, trading, fishing, livestock keeping, craftwork or wage employment."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p3-85', 'P3', 'SST', 'Livelihood in our Sub-County', 85, 8, 'Why do people keep domestic animals?', NULL, '["For food, income, manure, transport or cultural purposes.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p3-97', 'P3', 'SST', 'Livelihood in our Sub-County', 97, 9, 'Give one benefit of markets to a community.', NULL, '["A type of weather observed for one afternoon.","Markets allow people to buy and sell goods and produce.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p3-109', 'P3', 'SST', 'Livelihood in our Sub-County', 109, 10, 'How can people protect their sources of income?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Use resources sustainably, save money, learn skills and keep their work safe.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p3-121', 'P3', 'SST', 'Social Services in our Sub-County', 121, 11, 'What are social services?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Services that meet people''s basic needs and improve their welfare.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p3-133', 'P3', 'SST', 'Social Services in our Sub-County', 133, 12, 'Name one social service found in a community.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","Education, health care, water supply, sanitation or security."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p3-145', 'P3', 'SST', 'Social Services in our Sub-County', 145, 13, 'Why are health centres important?', NULL, '["They provide treatment, health advice and preventive services.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p3-157', 'P3', 'SST', 'Social Services in our Sub-County', 157, 14, 'Why is clean water important?', NULL, '["A type of weather observed for one afternoon.","It supports drinking, cooking, washing and helps prevent waterborne diseases.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p3-169', 'P3', 'SST', 'Social Services in our Sub-County', 169, 15, 'State one responsibility of a community member when using public services.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Use facilities responsibly and protect public property.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-181', 'P4', 'SST', 'Location of our District', 181, 16, 'What is a district?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","An administrative area of local government in Uganda.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-193', 'P4', 'SST', 'Location of our District', 193, 17, 'Name two ways of describing a district''s location.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","By naming neighbouring districts, direction, region, or important physical features."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-205', 'P4', 'SST', 'Location of our District', 205, 18, 'What is a map key?', NULL, '["A guide explaining the symbols used on a map.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-217', 'P4', 'SST', 'Location of our District', 217, 19, 'What does a compass rose show on a map?', NULL, '["A type of weather observed for one afternoon.","Directions such as north, south, east and west.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-229', 'P4', 'SST', 'Location of our District', 229, 20, 'Why should we know the location of our district?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","It helps us identify where we live and understand connections with neighbouring areas.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-241', 'P4', 'SST', 'Physical Features in our District', 241, 21, 'What are physical features?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Natural features of the Earth''s surface, such as hills, valleys, rivers and lakes.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-253', 'P4', 'SST', 'Physical Features in our District', 253, 22, 'Name one physical feature that may be found in a district.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","A hill, mountain, valley, plain, river, lake, wetland or plateau."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-265', 'P4', 'SST', 'Physical Features in our District', 265, 23, 'How can rivers benefit people?', NULL, '["They may provide water, fish, transport, irrigation and support tourism.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-277', 'P4', 'SST', 'Physical Features in our District', 277, 24, 'State one danger associated with steep slopes.', NULL, '["A type of weather observed for one afternoon.","Soil erosion or landslides may occur, especially after heavy rain.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-289', 'P4', 'SST', 'Physical Features in our District', 289, 25, 'Give one way to conserve a wetland.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Avoid draining it, dumping waste in it or building illegally in it.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-301', 'P4', 'SST', 'Vegetation in our District', 301, 26, 'What is vegetation?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","The plant cover growing naturally or cultivated in an area.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-313', 'P4', 'SST', 'Vegetation in our District', 313, 27, 'Name one type of vegetation found in Uganda.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","Forest, savanna grassland, woodland, bushland or wetland vegetation."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-325', 'P4', 'SST', 'Vegetation in our District', 325, 28, 'State one importance of vegetation.', NULL, '["It provides habitats, protects soil, stores carbon and supplies useful products.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-337', 'P4', 'SST', 'Vegetation in our District', 337, 29, 'What is deforestation?', NULL, '["A type of weather observed for one afternoon.","The clearing or removal of forests on a large scale.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-349', 'P4', 'SST', 'Vegetation in our District', 349, 30, 'Give one way of conserving vegetation.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Plant trees, prevent uncontrolled fires and avoid unnecessary clearing.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-361', 'P4', 'SST', 'People in our District', 361, 31, 'What is a population?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","The number of people living in a particular area.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-373', 'P4', 'SST', 'People in our District', 373, 32, 'What is a clan?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","A group of people who trace descent from a common ancestor."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-385', 'P4', 'SST', 'People in our District', 385, 33, 'Give one reason people migrate into a district.', NULL, '["To seek work, education, land, safety or better services.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-397', 'P4', 'SST', 'People in our District', 397, 34, 'What is culture?', NULL, '["A type of weather observed for one afternoon.","The shared way of life of a group, including beliefs, customs, language and practices.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-409', 'P4', 'SST', 'People in our District', 409, 35, 'How can people from different cultures live peacefully together?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Respect differences, communicate peacefully and obey the law.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-421', 'P4', 'SST', 'Social Services in our District', 421, 36, 'Name two social services provided in a district.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Examples include education, health care, water, sanitation and community security.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-433', 'P4', 'SST', 'Social Services in our District', 433, 37, 'What is the role of a school?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","To provide education and support children''s learning and development."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-445', 'P4', 'SST', 'Social Services in our District', 445, 38, 'What is the role of a health centre?', NULL, '["To provide medical care, health education and preventive services.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-457', 'P4', 'SST', 'Social Services in our District', 457, 39, 'Why is sanitation important?', NULL, '["A type of weather observed for one afternoon.","It helps prevent disease and keeps homes and public places clean.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-469', 'P4', 'SST', 'Social Services in our District', 469, 40, 'How can citizens help maintain public facilities?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Use them properly, report damage and take part in community work.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-481', 'P4', 'SST', 'Leaders, Rights, and Responsibilities in our District', 481, 41, 'Who is a leader?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A person entrusted to guide people or make decisions for a group or community.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-493', 'P4', 'SST', 'Leaders, Rights, and Responsibilities in our District', 493, 42, 'Name one responsibility of a citizen.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","Obey laws, pay lawful taxes, protect public property or respect others'' rights."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-505', 'P4', 'SST', 'Leaders, Rights, and Responsibilities in our District', 505, 43, 'What is a right?', NULL, '["A freedom or entitlement that a person is legally or morally allowed to enjoy.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-517', 'P4', 'SST', 'Leaders, Rights, and Responsibilities in our District', 517, 44, 'Name one right of a child.', NULL, '["A type of weather observed for one afternoon.","The right to education, health care, protection, identity or family care.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p4-529', 'P4', 'SST', 'Leaders, Rights, and Responsibilities in our District', 529, 45, 'Why should leaders be accountable?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","They should explain their decisions and how they use public resources.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-541', 'P5', 'SST', 'Location of Uganda on the Map of East Africa', 541, 46, 'On which continent is Uganda located?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Africa.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-553', 'P5', 'SST', 'Location of Uganda on the Map of East Africa', 553, 47, 'In which part of Africa is Uganda located?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","East Africa."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-565', 'P5', 'SST', 'Location of Uganda on the Map of East Africa', 565, 48, 'Name four countries that border Uganda.', NULL, '["Kenya, Tanzania, Rwanda, South Sudan and the Democratic Republic of the Congo are neighbours; any four.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-577', 'P5', 'SST', 'Location of Uganda on the Map of East Africa', 577, 49, 'What is a landlocked country?', NULL, '["A type of weather observed for one afternoon.","A country that has no direct coastline on an ocean or sea.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-589', 'P5', 'SST', 'Location of Uganda on the Map of East Africa', 589, 50, 'Why are maps useful when studying Uganda''s location?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","They show Uganda''s position, boundaries, neighbouring countries and major features.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-601', 'P5', 'SST', 'Physical Features of Uganda', 601, 51, 'Name one major lake found in Uganda.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Lake Victoria, Lake Kyoga, Lake Albert, Lake Edward or Lake George.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-613', 'P5', 'SST', 'Physical Features of Uganda', 613, 52, 'What is a mountain?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","A high natural elevation of the Earth''s surface."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-625', 'P5', 'SST', 'Physical Features of Uganda', 625, 53, 'Name a mountain range or mountain area in Uganda.', NULL, '["The Rwenzori Mountains, Mount Elgon or the Virunga volcanic area.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-637', 'P5', 'SST', 'Physical Features of Uganda', 637, 54, 'What is a river?', NULL, '["A type of weather observed for one afternoon.","A natural flowing body of water moving in a channel.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-649', 'P5', 'SST', 'Physical Features of Uganda', 649, 55, 'Give one importance of physical features to Uganda.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","They support water supply, farming, fishing, tourism, transport or power generation.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-661', 'P5', 'SST', 'Climate of Uganda', 661, 56, 'What is climate?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","The average weather conditions of a place measured over a long period.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-673', 'P5', 'SST', 'Climate of Uganda', 673, 57, 'Name two elements of climate.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","Rainfall and temperature; others include wind, humidity and sunshine."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-685', 'P5', 'SST', 'Climate of Uganda', 685, 58, 'What is a rainy season?', NULL, '["A period of the year when an area receives relatively frequent or heavy rainfall.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-697', 'P5', 'SST', 'Climate of Uganda', 697, 59, 'State one factor that influences climate.', NULL, '["A type of weather observed for one afternoon.","Altitude, distance from large water bodies, latitude, winds or relief.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-709', 'P5', 'SST', 'Climate of Uganda', 709, 60, 'Give one effect of drought on people.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","It can cause water shortages, crop failure, livestock deaths and food insecurity.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-721', 'P5', 'SST', 'Vegetation of Uganda', 721, 61, 'Name one broad vegetation type in Uganda.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Savanna grassland, tropical forest, woodland, bushland or wetland vegetation.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-733', 'P5', 'SST', 'Vegetation of Uganda', 733, 62, 'What is savanna vegetation?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","Vegetation dominated by grasses with scattered trees and shrubs."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-745', 'P5', 'SST', 'Vegetation of Uganda', 745, 63, 'Why are forests important?', NULL, '["They protect soils, store carbon, support biodiversity and provide useful products.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-757', 'P5', 'SST', 'Vegetation of Uganda', 757, 64, 'What is afforestation?', NULL, '["A type of weather observed for one afternoon.","Planting trees on land that was not recently forested.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-769', 'P5', 'SST', 'Vegetation of Uganda', 769, 65, 'State one cause of vegetation loss.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Deforestation, overgrazing, bush burning, settlement expansion or wetland drainage.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-781', 'P5', 'SST', 'Natural Resources in Uganda', 781, 66, 'What is a natural resource?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Something occurring in nature that people use to meet their needs.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-793', 'P5', 'SST', 'Natural Resources in Uganda', 793, 67, 'Name one renewable natural resource.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","Sunlight, wind, flowing water, forests if managed sustainably, or fish if managed sustainably."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-805', 'P5', 'SST', 'Natural Resources in Uganda', 805, 68, 'Name one mineral resource found in Uganda.', NULL, '["Gold, copper, limestone, tin, tungsten, cobalt or iron ore.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-817', 'P5', 'SST', 'Natural Resources in Uganda', 817, 69, 'Why should natural resources be conserved?', NULL, '["A type of weather observed for one afternoon.","To prevent depletion, protect ecosystems and support future generations.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-829', 'P5', 'SST', 'Natural Resources in Uganda', 829, 70, 'Give one example of a resource being used to generate electricity in Uganda.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Water at hydropower stations, sunlight in solar systems or biomass in some systems.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-841', 'P5', 'SST', 'People of Pre-Colonial Uganda', 841, 71, 'What does pre-colonial mean?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","The period before colonial rule was established.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-853', 'P5', 'SST', 'People of Pre-Colonial Uganda', 853, 72, 'Name one type of political organisation that existed in pre-colonial Uganda.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","Centralised kingdoms, chiefdoms or decentralised clan-based communities."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-865', 'P5', 'SST', 'People of Pre-Colonial Uganda', 865, 73, 'Name one historical kingdom in the area of present-day Uganda.', NULL, '["Buganda, Bunyoro, Ankole, Toro or Busoga.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-877', 'P5', 'SST', 'People of Pre-Colonial Uganda', 877, 74, 'How did many pre-colonial communities earn a living?', NULL, '["A type of weather observed for one afternoon.","Through farming, herding, fishing, hunting, gathering, crafts and trade.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-889', 'P5', 'SST', 'People of Pre-Colonial Uganda', 889, 75, 'Give one way communities exchanged goods before colonial rule.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Barter trade, local markets or long-distance trade networks.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-901', 'P5', 'SST', 'Foreign Influence in Uganda', 901, 76, 'What is foreign influence?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","The effect of people, ideas, trade, religions or powers from outside a country on its society.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-913', 'P5', 'SST', 'Foreign Influence in Uganda', 913, 77, 'Name one religion introduced or spread in Uganda through foreign contacts.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","Christianity or Islam."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-925', 'P5', 'SST', 'Foreign Influence in Uganda', 925, 78, 'Give one way long-distance trade influenced communities in Uganda.', NULL, '["It encouraged exchange of goods, ideas, languages and political contacts.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-937', 'P5', 'SST', 'Foreign Influence in Uganda', 937, 79, 'State one positive effect of foreign contacts.', NULL, '["A type of weather observed for one afternoon.","They brought new education, medical practices, technologies or wider trade links.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-949', 'P5', 'SST', 'Foreign Influence in Uganda', 949, 80, 'State one harmful effect of foreign domination.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","It could cause loss of political independence, land, resources or cultural control.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-961', 'P5', 'SST', 'How Uganda Became a Nation', 961, 81, 'What is a nation?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A people and territory connected by shared political identity and a recognised state.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-973', 'P5', 'SST', 'How Uganda Became a Nation', 973, 82, 'What was the Uganda Protectorate?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","The British-administered protectorate established over the area that became Uganda."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-985', 'P5', 'SST', 'How Uganda Became a Nation', 985, 83, 'Which European power established colonial rule over Uganda?', NULL, '["Britain.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-997', 'P5', 'SST', 'How Uganda Became a Nation', 997, 84, 'What is a protectorate?', NULL, '["A type of weather observed for one afternoon.","A territory placed under the protection and control of another power, often limiting its external and internal independence.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-1009', 'P5', 'SST', 'How Uganda Became a Nation', 1009, 85, 'Why is 1962 important in Uganda''s history?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Uganda gained independence from British rule on 9 October 1962.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-1021', 'P5', 'SST', 'Road to Independence in Uganda', 1021, 86, 'What is independence?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","The ability of a country to govern itself without colonial rule.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-1033', 'P5', 'SST', 'Road to Independence in Uganda', 1033, 87, 'In which year did Uganda gain independence?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","1962."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-1045', 'P5', 'SST', 'Road to Independence in Uganda', 1045, 88, 'Name one way people campaigned for independence.', NULL, '["Political parties, public meetings, petitions, newspapers, negotiations or elections.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-1057', 'P5', 'SST', 'Road to Independence in Uganda', 1057, 89, 'What is a constitution?', NULL, '["A type of weather observed for one afternoon.","The basic law that establishes how a country is governed and protects rights.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-1069', 'P5', 'SST', 'Road to Independence in Uganda', 1069, 90, 'Why are elections important during a transition to self-government?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","They allow people to choose representatives and help establish legitimate government.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-1081', 'P5', 'SST', 'Post-Independence Uganda and Government', 1081, 91, 'What is a government?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","The system or group of institutions that makes and implements public decisions.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-1093', 'P5', 'SST', 'Post-Independence Uganda and Government', 1093, 92, 'Name the three main arms of government in Uganda.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","The Executive, Legislature and Judiciary."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-1105', 'P5', 'SST', 'Post-Independence Uganda and Government', 1105, 93, 'What is the role of Parliament?', NULL, '["To make laws, represent citizens and oversee government.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-1117', 'P5', 'SST', 'Post-Independence Uganda and Government', 1117, 94, 'What is the role of the Judiciary?', NULL, '["A type of weather observed for one afternoon.","To interpret the law and administer justice independently.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-1129', 'P5', 'SST', 'Post-Independence Uganda and Government', 1129, 95, 'Why is peace important for national development?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","It allows people to work, learn, invest and use services safely.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-1141', 'P5', 'SST', 'Population Dynamics in Uganda', 1141, 96, 'What is population density?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","The number of people living per unit area, commonly per square kilometre.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-1153', 'P5', 'SST', 'Population Dynamics in Uganda', 1153, 97, 'Name two factors that cause population change.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","Births, deaths, immigration and emigration."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-1165', 'P5', 'SST', 'Population Dynamics in Uganda', 1165, 98, 'What is migration?', NULL, '["Movement of people from one place to another to live temporarily or permanently.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-1177', 'P5', 'SST', 'Population Dynamics in Uganda', 1177, 99, 'Give one challenge caused by rapid population growth.', NULL, '["A type of weather observed for one afternoon.","Pressure on schools, health services, jobs, housing, land or water.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p5-1189', 'P5', 'SST', 'Population Dynamics in Uganda', 1189, 100, 'State one way to address population-related pressure on services.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Plan services, improve education and health care, create jobs and manage resources sustainably.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1201', 'P6', 'SST', 'Introduction to the EAC', 1201, 101, 'What does EAC stand for?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","East African Community.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1213', 'P6', 'SST', 'Introduction to the EAC', 1213, 102, 'What is the EAC?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","A regional intergovernmental organisation promoting cooperation and integration among partner states."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1225', 'P6', 'SST', 'Introduction to the EAC', 1225, 103, 'Name one objective of the EAC.', NULL, '["To promote trade, cooperation, regional development, movement of people or political integration.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1237', 'P6', 'SST', 'Introduction to the EAC', 1237, 104, 'What is regional integration?', NULL, '["A type of weather observed for one afternoon.","The process of countries cooperating and reducing barriers to achieve shared goals.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1249', 'P6', 'SST', 'Introduction to the EAC', 1249, 105, 'Give one benefit of EAC cooperation.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","It can expand markets, support cross-border trade, improve transport links and encourage joint projects.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1261', 'P6', 'SST', 'Physical Features of East Africa', 1261, 106, 'Name one major lake in East Africa.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Lake Victoria, Lake Tanganyika, Lake Turkana, Lake Albert or Lake Malawi/Nyasa.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1273', 'P6', 'SST', 'Physical Features of East Africa', 1273, 107, 'What is the Great Rift Valley?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","A long zone of major geological depressions and escarpments formed by movements in the Earth''s crust."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1285', 'P6', 'SST', 'Physical Features of East Africa', 1285, 108, 'Name one mountain in East Africa.', NULL, '["Mount Kilimanjaro, Mount Kenya, the Rwenzori Mountains or Mount Elgon.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1297', 'P6', 'SST', 'Physical Features of East Africa', 1297, 109, 'How can lakes support livelihoods?', NULL, '["A type of weather observed for one afternoon.","They provide fish, water, transport, tourism and sometimes hydroelectric opportunities.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1309', 'P6', 'SST', 'Physical Features of East Africa', 1309, 110, 'Give one hazard associated with volcanic mountains.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Volcanic eruptions, ash, lava flows or related earthquakes.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1321', 'P6', 'SST', 'Climate of East Africa', 1321, 111, 'Name two major climate influences in East Africa.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Latitude, altitude, relief, winds, distance from the sea and large water bodies.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1333', 'P6', 'SST', 'Climate of East Africa', 1333, 112, 'Why are highland areas often cooler than lowlands?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","Temperature generally decreases as altitude increases."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1345', 'P6', 'SST', 'Climate of East Africa', 1345, 113, 'What is drought?', NULL, '["A prolonged period of unusually low rainfall that causes water shortages.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1357', 'P6', 'SST', 'Climate of East Africa', 1357, 114, 'How can climate affect farming?', NULL, '["A type of weather observed for one afternoon.","It influences crop choice, planting seasons, yields, pests and the availability of water.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1369', 'P6', 'SST', 'Climate of East Africa', 1369, 115, 'Give one way communities can adapt to unreliable rainfall.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Harvest rainwater, use irrigation, plant suitable crops or conserve soil moisture.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1381', 'P6', 'SST', 'Vegetation of East Africa', 1381, 116, 'Name one vegetation type found in East Africa.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Savanna, tropical forest, montane vegetation, desert or semi-desert vegetation, or mangrove.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1393', 'P6', 'SST', 'Vegetation of East Africa', 1393, 117, 'Why is vegetation different from place to place?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","Rainfall, temperature, altitude, soil and human activity vary."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1405', 'P6', 'SST', 'Vegetation of East Africa', 1405, 118, 'What is mangrove vegetation?', NULL, '["Salt-tolerant trees and shrubs that grow along tropical coasts and tidal waters.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1417', 'P6', 'SST', 'Vegetation of East Africa', 1417, 119, 'State one importance of grasslands.', NULL, '["A type of weather observed for one afternoon.","They support grazing animals, wildlife, tourism and some farming.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1429', 'P6', 'SST', 'Vegetation of East Africa', 1429, 120, 'Give one threat to East African forests.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Logging, agricultural expansion, charcoal production, fires or settlement.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1441', 'P6', 'SST', 'People and Population of East Africa', 1441, 121, 'What is population distribution?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","The way people are spread across an area.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1453', 'P6', 'SST', 'People and Population of East Africa', 1453, 122, 'Why do many people settle near fertile land or water?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","These areas can support farming, domestic needs, transport and livelihoods."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1465', 'P6', 'SST', 'People and Population of East Africa', 1465, 123, 'What is urbanisation?', NULL, '["An increase in the proportion of people living in towns and cities.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1477', 'P6', 'SST', 'People and Population of East Africa', 1477, 124, 'Give one benefit of cultural diversity.', NULL, '["A type of weather observed for one afternoon.","It enriches languages, knowledge, food, art, skills and social exchange.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1489', 'P6', 'SST', 'People and Population of East Africa', 1489, 125, 'State one challenge associated with rapid urbanisation.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Overcrowding, unemployment, informal settlements, traffic or pressure on services.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1501', 'P6', 'SST', 'Natural Resources of East Africa', 1501, 126, 'Name one natural resource shared across East African countries.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Lake and river water, wildlife, forests, fisheries, minerals or grazing land.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1513', 'P6', 'SST', 'Natural Resources of East Africa', 1513, 127, 'Why is Lake Victoria economically important?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","It supports fisheries, transport, water supply, tourism and livelihoods."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1525', 'P6', 'SST', 'Natural Resources of East Africa', 1525, 128, 'What is sustainable resource use?', NULL, '["Using resources in ways that meet current needs without damaging future availability.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1537', 'P6', 'SST', 'Natural Resources of East Africa', 1537, 129, 'Give one conflict that may arise over natural resources.', NULL, '["A type of weather observed for one afternoon.","Competition over water, pasture, land, forests or fishing grounds.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1549', 'P6', 'SST', 'Natural Resources of East Africa', 1549, 130, 'How can countries cooperate to manage shared resources?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Share information, agree on rules, control pollution and manage resources jointly.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1561', 'P6', 'SST', 'Communication and Transport in East Africa', 1561, 131, 'What is transport?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","The movement of people and goods from one place to another.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1573', 'P6', 'SST', 'Communication and Transport in East Africa', 1573, 132, 'Name two modes of transport.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","Road, rail, water, air or pipeline transport."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1585', 'P6', 'SST', 'Communication and Transport in East Africa', 1585, 133, 'What is communication?', NULL, '["The sending and receiving of information.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1597', 'P6', 'SST', 'Communication and Transport in East Africa', 1597, 134, 'How does good transport support trade?', NULL, '["A type of weather observed for one afternoon.","It moves goods and people more efficiently and can reduce travel time and costs.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1609', 'P6', 'SST', 'Communication and Transport in East Africa', 1609, 135, 'State one challenge facing transport in some areas.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Poor roads, high costs, congestion, accidents, difficult terrain or inadequate infrastructure.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1633', 'P6', 'SST', 'Pre-Colonial and Colonial History of East Africa', 1633, 136, 'Name one form of pre-colonial political organisation in East Africa.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","Kingdoms, chiefdoms, city-states or clan-based communities."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1645', 'P6', 'SST', 'Pre-Colonial and Colonial History of East Africa', 1645, 137, 'What was colonialism?', NULL, '["Control of one territory or people by an outside power for political and economic purposes.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1657', 'P6', 'SST', 'Pre-Colonial and Colonial History of East Africa', 1657, 138, 'Give one reason European powers colonised East Africa.', NULL, '["A type of weather observed for one afternoon.","Economic interests, strategic competition, prestige, missionary activity or political expansion.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1669', 'P6', 'SST', 'Pre-Colonial and Colonial History of East Africa', 1669, 139, 'State one effect of colonial rule.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","It changed political systems, land ownership, labour, trade, education or infrastructure.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1681', 'P6', 'SST', 'Independence and Democratic Processes in East Africa', 1681, 140, 'What is democracy?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A system in which people have a role in choosing leaders and influencing public decisions.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1693', 'P6', 'SST', 'Independence and Democratic Processes in East Africa', 1693, 141, 'Name one peaceful democratic process.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","Voting, public consultation, lawful campaigning, parliamentary debate or peaceful transfer of power."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1705', 'P6', 'SST', 'Independence and Democratic Processes in East Africa', 1705, 142, 'Why are constitutions important?', NULL, '["They set out government powers, institutions and citizens'' rights.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1717', 'P6', 'SST', 'Independence and Democratic Processes in East Africa', 1717, 143, 'What is a multiparty system?', NULL, '["A type of weather observed for one afternoon.","A political system in which more than one political party can compete for power.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p6-1729', 'P6', 'SST', 'Independence and Democratic Processes in East Africa', 1729, 144, 'Give one responsibility of a voter.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Learn about candidates, vote freely and lawfully, and respect the electoral process.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1741', 'P7', 'SST', 'Location of Africa', 1741, 145, 'Which is the second-largest continent by area?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Africa.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1753', 'P7', 'SST', 'Location of Africa', 1753, 146, 'Which major lines of latitude cross Africa?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","The Equator, Tropic of Cancer and Tropic of Capricorn."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1765', 'P7', 'SST', 'Location of Africa', 1765, 147, 'Name the ocean west of Africa.', NULL, '["The Atlantic Ocean.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1777', 'P7', 'SST', 'Location of Africa', 1777, 148, 'Name the ocean east of Africa.', NULL, '["A type of weather observed for one afternoon.","The Indian Ocean.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1789', 'P7', 'SST', 'Location of Africa', 1789, 149, 'What is a peninsula?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A piece of land surrounded by water on most sides and joined to a larger land area.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1801', 'P7', 'SST', 'Physical Features, Climate, and Vegetation of Africa', 1801, 150, 'Name one major African mountain.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Mount Kilimanjaro, Mount Kenya or the Atlas Mountains.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1813', 'P7', 'SST', 'Physical Features, Climate, and Vegetation of Africa', 1813, 151, 'What is a plateau?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","An area of relatively high land with a broad, fairly level surface."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1825', 'P7', 'SST', 'Physical Features, Climate, and Vegetation of Africa', 1825, 152, 'Name one major desert in Africa.', NULL, '["The Sahara, Kalahari or Namib Desert.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1837', 'P7', 'SST', 'Physical Features, Climate, and Vegetation of Africa', 1837, 153, 'How does rainfall affect vegetation?', NULL, '["A type of weather observed for one afternoon.","It influences the amount, type and density of plant growth.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1849', 'P7', 'SST', 'Physical Features, Climate, and Vegetation of Africa', 1849, 154, 'Why do equatorial regions often have dense forests?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","They generally receive high rainfall and warm temperatures through much of the year.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1861', 'P7', 'SST', 'People of Africa', 1861, 155, 'What is ethnic diversity?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","The presence of different ethnic groups with distinct identities, languages or cultural traditions.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1873', 'P7', 'SST', 'People of Africa', 1873, 156, 'Name one major language family spoken in Africa.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","Niger-Congo, Afroasiatic, Nilo-Saharan (classification varies by source), or Khoisan language groupings."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1897', 'P7', 'SST', 'People of Africa', 1897, 157, 'Give one factor that influences population distribution in Africa.', NULL, '["A type of weather observed for one afternoon.","Climate, water, fertile soils, jobs, transport, security or services.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1909', 'P7', 'SST', 'People of Africa', 1909, 158, 'State one way to promote peaceful coexistence among communities.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Respect differences, resolve disputes peacefully and apply laws fairly.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1921', 'P7', 'SST', 'Foreign Influence and Colonialism in Africa', 1921, 159, 'What is colonialism?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Political and economic control of a territory by an outside power.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1933', 'P7', 'SST', 'Foreign Influence and Colonialism in Africa', 1933, 160, 'What was the Scramble for Africa?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","The rapid competition among European powers to claim and control African territories, especially in the late nineteenth century."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1945', 'P7', 'SST', 'Foreign Influence and Colonialism in Africa', 1945, 161, 'What was the Berlin Conference of 1884–1885 associated with?', NULL, '["European negotiations over rules for claiming African territories; African peoples were not fairly represented.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1957', 'P7', 'SST', 'Foreign Influence and Colonialism in Africa', 1957, 162, 'Give one economic motive for colonial expansion.', NULL, '["A type of weather observed for one afternoon.","Access to raw materials, markets, land or investment opportunities.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1969', 'P7', 'SST', 'Foreign Influence and Colonialism in Africa', 1969, 163, 'State one lasting effect of colonial rule in Africa.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","It shaped borders, economies, political institutions, languages and infrastructure in different ways.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1981', 'P7', 'SST', 'Economic Developments and International Relations in Africa', 1981, 164, 'What is economic development?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","Improvement in people''s living standards, opportunities and economic capacity over time.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-1993', 'P7', 'SST', 'Economic Developments and International Relations in Africa', 1993, 165, 'Name one economic activity important in many African countries.', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country.","Agriculture, mining, manufacturing, trade, tourism or services."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-2005', 'P7', 'SST', 'Economic Developments and International Relations in Africa', 2005, 166, 'What is international trade?', NULL, '["The exchange of goods and services between countries.","A type of weather observed for one afternoon.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-2017', 'P7', 'SST', 'Economic Developments and International Relations in Africa', 2017, 167, 'Give one benefit of regional cooperation.', NULL, '["A type of weather observed for one afternoon.","It can expand markets, coordinate infrastructure and help countries address shared challenges.","A private possession that has no community use.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true),
  ('sst-p7-2029', 'P7', 'SST', 'Economic Developments and International Relations in Africa', 2029, 168, 'Why is diversification important to an economy?', NULL, '["A type of weather observed for one afternoon.","A private possession that has no community use.","It reduces dependence on one product or sector and can make income and employment more resilient.","A rule that applies only outside the country."]'::jsonb, 'content/sst_questions_p3_p7.json', true)
on conflict (id) do update set
  grade = excluded.grade,
  subject = excluded.subject,
  topic = excluded.topic,
  sort_order = excluded.sort_order,
  source_number = excluded.source_number,
  prompt = excluded.prompt,
  answer = excluded.answer,
  options = excluded.options,
  source_file = excluded.source_file,
  is_active = excluded.is_active;
-- END GENERATED SST QUESTION-ONLY BANK

-- BEGIN GENERATED SST DEDUPLICATION FILTER
-- Retire earlier templated paraphrases without deleting rows or breaking saved progress.
update public.daily_qa_questions
set is_active = false
where subject = 'SST' and is_active
  and id not in (
  'sst-p3-1',
  'sst-p3-13',
  'sst-p3-25',
  'sst-p3-37',
  'sst-p3-49',
  'sst-p3-61',
  'sst-p3-73',
  'sst-p3-85',
  'sst-p3-97',
  'sst-p3-109',
  'sst-p3-121',
  'sst-p3-133',
  'sst-p3-145',
  'sst-p3-157',
  'sst-p3-169',
  'sst-p4-181',
  'sst-p4-193',
  'sst-p4-205',
  'sst-p4-217',
  'sst-p4-229',
  'sst-p4-241',
  'sst-p4-253',
  'sst-p4-265',
  'sst-p4-277',
  'sst-p4-289',
  'sst-p4-301',
  'sst-p4-313',
  'sst-p4-325',
  'sst-p4-337',
  'sst-p4-349',
  'sst-p4-361',
  'sst-p4-373',
  'sst-p4-385',
  'sst-p4-397',
  'sst-p4-409',
  'sst-p4-421',
  'sst-p4-433',
  'sst-p4-445',
  'sst-p4-457',
  'sst-p4-469',
  'sst-p4-481',
  'sst-p4-493',
  'sst-p4-505',
  'sst-p4-517',
  'sst-p4-529',
  'sst-p5-541',
  'sst-p5-553',
  'sst-p5-565',
  'sst-p5-577',
  'sst-p5-589',
  'sst-p5-601',
  'sst-p5-613',
  'sst-p5-625',
  'sst-p5-637',
  'sst-p5-649',
  'sst-p5-661',
  'sst-p5-673',
  'sst-p5-685',
  'sst-p5-697',
  'sst-p5-709',
  'sst-p5-721',
  'sst-p5-733',
  'sst-p5-745',
  'sst-p5-757',
  'sst-p5-769',
  'sst-p5-781',
  'sst-p5-793',
  'sst-p5-805',
  'sst-p5-817',
  'sst-p5-829',
  'sst-p5-841',
  'sst-p5-853',
  'sst-p5-865',
  'sst-p5-877',
  'sst-p5-889',
  'sst-p5-901',
  'sst-p5-913',
  'sst-p5-925',
  'sst-p5-937',
  'sst-p5-949',
  'sst-p5-961',
  'sst-p5-973',
  'sst-p5-985',
  'sst-p5-997',
  'sst-p5-1009',
  'sst-p5-1021',
  'sst-p5-1033',
  'sst-p5-1045',
  'sst-p5-1057',
  'sst-p5-1069',
  'sst-p5-1081',
  'sst-p5-1093',
  'sst-p5-1105',
  'sst-p5-1117',
  'sst-p5-1129',
  'sst-p5-1141',
  'sst-p5-1153',
  'sst-p5-1165',
  'sst-p5-1177',
  'sst-p5-1189',
  'sst-p6-1201',
  'sst-p6-1213',
  'sst-p6-1225',
  'sst-p6-1237',
  'sst-p6-1249',
  'sst-p6-1261',
  'sst-p6-1273',
  'sst-p6-1285',
  'sst-p6-1297',
  'sst-p6-1309',
  'sst-p6-1321',
  'sst-p6-1333',
  'sst-p6-1345',
  'sst-p6-1357',
  'sst-p6-1369',
  'sst-p6-1381',
  'sst-p6-1393',
  'sst-p6-1405',
  'sst-p6-1417',
  'sst-p6-1429',
  'sst-p6-1441',
  'sst-p6-1453',
  'sst-p6-1465',
  'sst-p6-1477',
  'sst-p6-1489',
  'sst-p6-1501',
  'sst-p6-1513',
  'sst-p6-1525',
  'sst-p6-1537',
  'sst-p6-1549',
  'sst-p6-1561',
  'sst-p6-1573',
  'sst-p6-1585',
  'sst-p6-1597',
  'sst-p6-1609',
  'sst-p6-1633',
  'sst-p6-1645',
  'sst-p6-1657',
  'sst-p6-1669',
  'sst-p6-1681',
  'sst-p6-1693',
  'sst-p6-1705',
  'sst-p6-1717',
  'sst-p6-1729',
  'sst-p7-1741',
  'sst-p7-1753',
  'sst-p7-1765',
  'sst-p7-1777',
  'sst-p7-1789',
  'sst-p7-1801',
  'sst-p7-1813',
  'sst-p7-1825',
  'sst-p7-1837',
  'sst-p7-1849',
  'sst-p7-1861',
  'sst-p7-1873',
  'sst-p7-1897',
  'sst-p7-1909',
  'sst-p7-1921',
  'sst-p7-1933',
  'sst-p7-1945',
  'sst-p7-1957',
  'sst-p7-1969',
  'sst-p7-1981',
  'sst-p7-1993',
  'sst-p7-2005',
  'sst-p7-2017',
  'sst-p7-2029'
  );
-- END GENERATED SST DEDUPLICATION FILTER

-- Checked RPC payload carries the assigned subject and unmarked SST options.
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
    'subject', a.subject,
    'assignment_type', a.assignment_type,
    'source_assignment_id', a.source_assignment_id,
    'source_set_number', (select source.set_number from public.daily_qa_assignments source where source.id = a.source_assignment_id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question_id', q.id,
        'position', i.position,
        'source_number', coalesce(q.source_number, q.sort_order),
        'grade', q.grade,
        'subject', q.subject,
        'topic', q.topic,
        'question', q.prompt,
        'answer', q.answer,
        'options', q.options,
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

-- A learner resumes an active set; the admin's current subject governs a new set.
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

  select coalesce((select s.subject from public.daily_qa_settings s where s.user_id = v_user), 'Science')
    into v_subject;
  if v_subject not in ('Science','SST') then
    raise exception using errcode = '22023', message = 'The admin-assigned subject is invalid.';
  end if;

  v_target := public.daily_qa_effective_target();
  if v_target = 0 then
    return jsonb_build_object(
      'status', 'paused', 'target', 0, 'subject', v_subject,
      'message', 'Your daily revision is paused by your admin.'
    );
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text));

  -- An in-progress assignment keeps its original subject and target.
  select * into v_assignment
  from public.daily_qa_assignments
  where user_id = v_user and status = 'active'
  order by set_number desc
  limit 1
  for update;
  if found then
    return public.daily_qa_assignment_payload(v_assignment.id, 'active');
  end if;

  -- A completed same-subject set counts for today. A deliberate admin subject
  -- change lets the learner begin the newly assigned subject without losing history.
  select * into v_assignment
  from public.daily_qa_assignments
  where user_id = v_user
  order by set_number desc
  limit 1;
  if found and v_assignment.status = 'completed'
     and v_assignment.assigned_date >= v_today
     and v_assignment.subject = v_subject then
    return public.daily_qa_assignment_payload(v_assignment.id, 'complete');
  end if;

  -- No-repeat rule is per question ID; switching subject uses a distinct bank.
  select count(*) into v_available
  from public.daily_qa_questions q
  where q.is_active and q.subject = v_subject
    and q.grade in ('P3','P4','P5','P6','P7')
    and (v_subject = 'SST' or q.grade <> 'P3')
    and not exists (
      select 1 from public.daily_qa_assignment_items i
      join public.daily_qa_assignments a on a.id = i.assignment_id
      where a.user_id = v_user and i.question_id = q.id
    );

  if v_available = 0 then
    return jsonb_build_object(
      'status', 'exhausted', 'target', v_target, 'subject', v_subject,
      'grade_order', case when v_subject = 'SST' then 'P3-P7' else 'P4-P7' end,
      'message', case when v_subject = 'SST'
        then 'No unused P3-P7 SST questions are available for this student.'
        else 'No unused P4-P7 Science questions are available for this student.' end
    );
  end if;

  v_take := least(v_target, v_available);
  select coalesce(max(set_number), 0) + 1 into v_set_number
  from public.daily_qa_assignments where user_id = v_user;

  insert into public.daily_qa_assignments (
    user_id, subject, set_number, assigned_date, requested_target, target_count, status
  ) values (v_user, v_subject, v_set_number, v_today, v_target, v_take, 'active')
  returning * into v_assignment;

  insert into public.daily_qa_assignment_items (assignment_id, question_id, position)
  select v_assignment.id, selected.id,
         row_number() over (
           order by case when v_subject = 'SST' then
                          case selected.grade when 'P3' then 1 when 'P4' then 2 when 'P5' then 3 when 'P6' then 4 when 'P7' then 5 end
                         else
                          case selected.grade when 'P4' then 1 when 'P5' then 2 when 'P6' then 3 when 'P7' then 4 end
                         end,
                    selected.sort_order, selected.id
         )::integer
  from (
    select q.id, q.grade, q.sort_order from public.daily_qa_questions q
    where q.is_active and q.subject = v_subject
      and q.grade in ('P3','P4','P5','P6','P7')
      and (v_subject = 'SST' or q.grade <> 'P3')
      and not exists (
        select 1 from public.daily_qa_assignment_items i
        join public.daily_qa_assignments a on a.id = i.assignment_id
        where a.user_id = v_user and i.question_id = q.id
      )
    order by case when v_subject = 'SST' then
                   case q.grade when 'P3' then 1 when 'P4' then 2 when 'P5' then 3 when 'P6' then 4 when 'P7' then 5 end
                  else
                   case q.grade when 'P4' then 1 when 'P5' then 2 when 'P6' then 3 when 'P7' then 4 end
                  end,
             q.sort_order, q.id
    limit v_take
  ) as selected;

  return public.daily_qa_assignment_payload(v_assignment.id, 'active');
end;
$$;
revoke all on function public.daily_qa_get_or_start_set() from public, anon;
grant execute on function public.daily_qa_get_or_start_set() to authenticated;

-- Admin repeats only a completed set from the student's currently assigned subject;
-- NULL source means the next unused questions from that subject's source sequence.
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

  select p.* into v_profile
  from public.daily_qa_profiles p
  join public.smartple_profiles s on s.user_id = p.user_id
  where p.user_id = p_user_id and p.role = 'student' and s.role = 'student';
  if not found then
    raise exception using errcode = '42501', message = 'A current SmartPle student profile is required.';
  end if;

  select coalesce((select s.subject from public.daily_qa_settings s where s.user_id = p_user_id), 'Science')
    into v_subject;
  if v_subject not in ('Science','SST') then
    raise exception using errcode = '22023', message = 'The admin-assigned subject is invalid.';
  end if;

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

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  if exists (select 1 from public.daily_qa_assignments a where a.user_id = p_user_id and a.status = 'active') then
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
  from public.daily_qa_assignments a where a.user_id = p_user_id;

  if p_source_assignment_id is not null then
    select * into v_source
    from public.daily_qa_assignments a
    where a.id = p_source_assignment_id and a.user_id = p_user_id and a.status = 'completed'
    for update;
    if not found then
      raise exception using errcode = '22023', message = 'Choose one of this student’s completed sets to repeat.';
    end if;
    if v_source.subject <> v_subject then
      raise exception using errcode = '22023', message = 'The selected set is not from the student’s currently assigned subject.';
    end if;

    select count(*)::integer into v_take
    from public.daily_qa_assignment_items i where i.assignment_id = v_source.id;
    if v_take = 0 then
      raise exception using errcode = '22023', message = 'The selected completed set has no questions to repeat.';
    end if;
    if exists (
      select 1 from public.daily_qa_assignment_items i
      join public.daily_qa_questions q on q.id = i.question_id
      where i.assignment_id = v_source.id
        and (not q.is_active
          or q.subject <> v_subject
          or (v_subject = 'Science' and q.grade not in ('P4','P5','P6','P7'))
          or (v_subject = 'SST' and q.grade not in ('P3','P4','P5','P6','P7')))
    ) then
      raise exception using errcode = '22023', message = 'The selected set contains questions outside the student’s assigned subject bank.';
    end if;

    insert into public.daily_qa_assignments (
      user_id, subject, set_number, assigned_date, requested_target, target_count,
      completed_count, status, assignment_type, source_assignment_id, assigned_by
    ) values (
      p_user_id, v_subject, v_set_number, v_today, v_source.requested_target, v_take,
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
    where q.is_active and q.subject = v_subject
      and q.grade in ('P3','P4','P5','P6','P7')
      and (v_subject = 'SST' or q.grade <> 'P3')
      and not exists (
        select 1 from public.daily_qa_assignment_items i
        join public.daily_qa_assignments a on a.id = i.assignment_id
        where a.user_id = p_user_id and i.question_id = q.id
      );
    if v_available = 0 then
      raise exception using errcode = '22023', message = 'No unused questions remain in the student’s currently assigned subject bank.';
    end if;

    v_take := least(v_target, v_available);
    insert into public.daily_qa_assignments (
      user_id, subject, set_number, assigned_date, requested_target, target_count,
      completed_count, status, assignment_type, source_assignment_id, assigned_by
    ) values (
      p_user_id, v_subject, v_set_number, v_today, v_target, v_take,
      0, 'active', 'admin_new', null, v_admin
    ) returning * into v_assignment;

    insert into public.daily_qa_assignment_items (assignment_id, question_id, position)
    select v_assignment.id, selected.id,
           row_number() over (
             order by case when v_subject = 'SST' then
                            case selected.grade when 'P3' then 1 when 'P4' then 2 when 'P5' then 3 when 'P6' then 4 when 'P7' then 5 end
                           else
                            case selected.grade when 'P4' then 1 when 'P5' then 2 when 'P6' then 3 when 'P7' then 4 end
                           end,
                    selected.sort_order, selected.id
           )::integer
    from (
      select q.id, q.grade, q.sort_order
      from public.daily_qa_questions q
      where q.is_active and q.subject = v_subject
        and q.grade in ('P3','P4','P5','P6','P7')
        and (v_subject = 'SST' or q.grade <> 'P3')
        and not exists (
          select 1 from public.daily_qa_assignment_items i
          join public.daily_qa_assignments a on a.id = i.assignment_id
          where a.user_id = p_user_id and i.question_id = q.id
        )
      order by case when v_subject = 'SST' then
                     case q.grade when 'P3' then 1 when 'P4' then 2 when 'P5' then 3 when 'P6' then 4 when 'P7' then 5 end
                    else
                     case q.grade when 'P4' then 1 when 'P5' then 2 when 'P6' then 3 when 'P7' then 4 end
                    end,
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
