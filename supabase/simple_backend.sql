-- =====================================================================
-- SmartPle Mobile — SIMPLE backend (5 tables, RLS allow-all, demo rows)
-- Run once in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- NOTE: smartple_profiles may already exist (the web paywall uses it).
-- If it exists, this script EXTENDS it with the new columns instead of
-- recreating it — nothing is dropped, the paywall keeps working.
-- =====================================================================

-- 1) PARENT CODES ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parent_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,              -- e.g. PLE-1001
  parent_name TEXT,
  is_used BOOLEAN NOT NULL DEFAULT false
);

-- 2) PROFILES ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.smartple_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  class_level TEXT CHECK (class_level IN ('P4','P5','P6','P7')),
  is_paid BOOLEAN NOT NULL DEFAULT false,
  parent_code_id UUID REFERENCES public.parent_codes(id)
);
-- If the table already existed (paywall version keyed by user_id),
-- just add whatever is missing:
ALTER TABLE public.smartple_profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS class_level TEXT,
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_code_id UUID REFERENCES public.parent_codes(id);

-- 3) QUESTIONS ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.smartple_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL CHECK (subject IN ('spelling','math','science')),
  class_level TEXT NOT NULL CHECK (class_level IN ('P4','P5','P6','P7')),
  question_text TEXT NOT NULL,
  options JSONB NOT NULL,                 -- ["A","B","C","D"]
  correct_answer TEXT NOT NULL,
  explanation TEXT
);

-- 4) ATTEMPTS ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.smartple_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.smartple_questions(id),
  is_correct BOOLEAN,
  selected_answer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5) MOCK EXAMS --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.smartple_mock_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  class_level TEXT CHECK (class_level IN ('P4','P5','P6','P7')),
  subject TEXT,
  questions JSONB NOT NULL DEFAULT '[]',  -- [{question_id, question_text, options, correct_answer}]
  duration_minutes INT NOT NULL DEFAULT 45
);

-- RLS: enabled, allow-all (as requested, for now) ----------------------
ALTER TABLE public.parent_codes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smartple_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smartple_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smartple_attempts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smartple_mock_exams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all" ON public.parent_codes;
CREATE POLICY "allow all" ON public.parent_codes       FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow all" ON public.smartple_profiles;
CREATE POLICY "allow all" ON public.smartple_profiles  FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow all" ON public.smartple_questions;
CREATE POLICY "allow all" ON public.smartple_questions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow all" ON public.smartple_attempts;
CREATE POLICY "allow all" ON public.smartple_attempts  FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow all" ON public.smartple_mock_exams;
CREATE POLICY "allow all" ON public.smartple_mock_exams FOR ALL USING (true) WITH CHECK (true);

-- DEMO DATA -------------------------------------------------------------
INSERT INTO public.parent_codes (code, parent_name, is_used) VALUES
  ('PLE-1001', 'Demo Parent One',   false),
  ('PLE-1002', 'Demo Parent Two',   false),
  ('PLE-1003', 'Demo Parent Three', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.smartple_questions (subject, class_level, question_text, options, correct_answer, explanation)
SELECT * FROM (VALUES
  ('spelling', 'P4',
   'Which word is spelled correctly?',
   '["Bicycle","Bisycle","Bicycal","Bisicle"]'::jsonb,
   'Bicycle',
   'Bi-cy-cle: remember "cycle" like a tricycle.'),
  ('math', 'P5',
   'What is 3/4 of 20?',
   '["5","10","15","12"]'::jsonb,
   '15',
   '20 ÷ 4 = 5, then 5 × 3 = 15.'),
  ('science', 'P6',
   'Which part of a plant absorbs water from the soil?',
   '["Leaves","Roots","Flower","Stem"]'::jsonb,
   'Roots',
   'Roots take in water and minerals from the soil.')
) AS demo(subject, class_level, question_text, options, correct_answer, explanation)
WHERE NOT EXISTS (SELECT 1 FROM public.smartple_questions);

-- Verify:
-- SELECT * FROM public.parent_codes;
-- SELECT subject, class_level, question_text FROM public.smartple_questions;
