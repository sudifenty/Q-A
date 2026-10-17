-- =====================================================================
-- SmartPle Mobile — full schema for BOTH apps (student + admin)
-- Run ONCE, top-to-bottom, in the Supabase SQL editor of the EXISTING
-- project (the one the web paywall uses). Everything is additive:
-- smartple_profiles is EXTENDED (paywall columns are preserved).
-- =====================================================================

-- ---------- 1. PROFILES (extend existing table; create if missing) ----------
CREATE TABLE IF NOT EXISTS public.smartple_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.smartple_profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS class TEXT CHECK (class IN ('P4','P5','P6','P7')),
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  -- paywall columns (already exist from the web app — kept)
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS payment_phone TEXT,
  ADD COLUMN IF NOT EXISTS payment_txn TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_until TIMESTAMPTZ;

-- new profiles get a row automatically on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.smartple_profiles (user_id, display_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), 'student')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- 2. QUESTION BANK (tiered, visual flag) ----------
CREATE TABLE IF NOT EXISTS public.smartple_questions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class TEXT NOT NULL CHECK (class IN ('P4','P5','P6','P7')),
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  subtopic TEXT,
  tier INT NOT NULL DEFAULT 1 CHECK (tier BETWEEN 1 AND 5),
  is_visual BOOLEAN NOT NULL DEFAULT false,
  kind TEXT NOT NULL DEFAULT 'mcq' CHECK (kind IN ('mcq','typed')),
  prompt TEXT NOT NULL,
  options JSONB,              -- ["A","B","C","D"] for mcq
  answer TEXT NOT NULL,       -- correct option text, or accepted typed answer(s) comma-separated
  explain TEXT,
  image_url TEXT,             -- optional diagram URL (kept remote: app stays light)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS q_filter_idx ON public.smartple_questions (class, subject, topic, tier);

-- ---------- 3. ATTEMPTS (monitoring + anti-guessing) ----------
CREATE TABLE IF NOT EXISTS public.smartple_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  subtopic TEXT,
  tier INT,
  question_id BIGINT REFERENCES public.smartple_questions(id),
  given_answer TEXT,
  is_correct BOOLEAN,
  skipped BOOLEAN NOT NULL DEFAULT false,
  time_spent_seconds INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attempts_user_idx ON public.smartple_attempts (user_id, created_at DESC);

-- ---------- 4. ASSIGNMENTS (individual remote control; one row per student) ----------
CREATE TABLE IF NOT EXISTS public.smartple_assignments (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  forced_class TEXT CHECK (forced_class IN ('P4','P5','P6','P7')),
  forced_subject TEXT,
  forced_topic TEXT,
  forced_tier INT CHECK (forced_tier BETWEEN 1 AND 5),
  allow_notes BOOLEAN NOT NULL DEFAULT true,
  allow_practice_with_answers BOOLEAN NOT NULL DEFAULT true,
  allow_practice_no_answers BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 5. USAGE (offline-first, <50KB client logs) ----------
CREATE TABLE IF NOT EXISTS public.smartple_usage (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  minutes_used NUMERIC(6,2) NOT NULL DEFAULT 0,
  topic TEXT,
  is_offline BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_user_date_idx ON public.smartple_usage (user_id, date DESC);

-- ---------- 6. NOTE EVENTS (cheating detection timeline) ----------
CREATE TABLE IF NOT EXISTS public.smartple_note_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subtopic TEXT NOT NULL,
  question_id BIGINT,
  event_type TEXT NOT NULL CHECK (event_type IN ('viewed_answer','started_typing','submitted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS note_events_user_idx ON public.smartple_note_events (user_id, created_at DESC);

-- ---------- 7. EXAMS + ASSIGNMENTS (lock system) ----------
CREATE TABLE IF NOT EXISTS public.smartple_exams (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT,
  questions JSONB NOT NULL,       -- [{question_id, prompt, options, answer, tier}]
  duration_minutes INT NOT NULL DEFAULT 45,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.smartple_exam_assignments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES public.smartple_exams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked','in_progress','completed')),
  score NUMERIC(5,2),
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_assign_user_idx ON public.smartple_exam_assignments (user_id, status);

-- ---------- 8. NUDGES (admin → student popup) ----------
CREATE TABLE IF NOT EXISTS public.smartple_nudges (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  seen BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
ALTER TABLE public.smartple_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smartple_questions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smartple_attempts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smartple_assignments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smartple_usage           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smartple_note_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smartple_exams           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smartple_exam_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smartple_nudges          ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.smartple_profiles
                 WHERE user_id = auth.uid() AND role = 'admin');
$$;

-- students: own rows only. admins: everything.
DROP POLICY IF EXISTS profiles_self   ON public.smartple_profiles;
CREATE POLICY profiles_self ON public.smartple_profiles FOR ALL
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS questions_read ON public.smartple_questions;
CREATE POLICY questions_read ON public.smartple_questions FOR SELECT
  USING (true);                                   -- bank is readable by signed-in users
DROP POLICY IF EXISTS questions_admin ON public.smartple_questions;
CREATE POLICY questions_admin ON public.smartple_questions FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS attempts_self ON public.smartple_attempts;
CREATE POLICY attempts_self ON public.smartple_attempts FOR ALL
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS assignments_self ON public.smartple_assignments;
CREATE POLICY assignments_self ON public.smartple_assignments FOR ALL
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS usage_self ON public.smartple_usage;
CREATE POLICY usage_self ON public.smartple_usage FOR ALL
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS note_events_self ON public.smartple_note_events;
CREATE POLICY note_events_self ON public.smartple_note_events FOR ALL
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS exams_read ON public.smartple_exams;
CREATE POLICY exams_read ON public.smartple_exams FOR SELECT USING (true);
DROP POLICY IF EXISTS exams_admin ON public.smartple_exams;
CREATE POLICY exams_admin ON public.smartple_exams FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS exam_assign_self ON public.smartple_exam_assignments;
CREATE POLICY exam_assign_self ON public.smartple_exam_assignments FOR ALL
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS nudges_self ON public.smartple_nudges;
CREATE POLICY nudges_self ON public.smartple_nudges FOR ALL
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- =====================================================================
-- AUTOMATIONS
-- =====================================================================

-- A) Scan weak students: avg < 50% per topic + suggestion
CREATE OR REPLACE FUNCTION public.scan_weak_students()
RETURNS TABLE(user_id uuid, display_name text, class text,
              subject text, topic text, avg_score numeric, suggestion text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.user_id, p.display_name, p.class, a.subject, a.topic,
         ROUND(100.0 * AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END), 1) AS avg_score,
         CASE
           WHEN p.class <> 'P4' THEN 'Force to P4?'
           ELSE 'Force Tier 1?'
         END AS suggestion
  FROM public.smartple_attempts a
  JOIN public.smartple_profiles p ON p.user_id = a.user_id
  WHERE a.is_correct IS NOT NULL
  GROUP BY p.user_id, p.display_name, p.class, a.subject, a.topic
  HAVING 100.0 * AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END) < 50;
$$;

-- B) Anti-guessing flag: 5 MCQs in under 15 seconds total → 'Guessing'
CREATE OR REPLACE FUNCTION public.scan_guessers()
RETURNS TABLE(user_id uuid, display_name text, n_questions bigint, total_seconds bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.user_id, p.display_name, COUNT(*) AS n_questions,
         COALESCE(SUM(a.time_spent_seconds),0) AS total_seconds
  FROM public.smartple_attempts a
  JOIN public.smartple_profiles p ON p.user_id = a.user_id
  WHERE a.created_at > now() - INTERVAL '1 day' AND a.skipped = false
  GROUP BY p.user_id, p.display_name, date_trunc('hour', a.created_at)
  HAVING COUNT(*) >= 5 AND COALESCE(SUM(a.time_spent_seconds),0) < 15;
$$;

-- C) Cheating timeline classifier for one student (admin C view)
CREATE OR REPLACE FUNCTION public.note_cheat_timeline(p_user uuid)
RETURNS TABLE(subtopic text, question_id bigint,
              viewed_answer timestamptz, started_typing timestamptz,
              submitted timestamptz, flag text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH ev AS (
    SELECT n.subtopic, n.question_id,
           MAX(CASE WHEN n.event_type='viewed_answer'  THEN n.created_at END) AS viewed_answer,
           MAX(CASE WHEN n.event_type='started_typing' THEN n.created_at END) AS started_typing,
           MAX(CASE WHEN n.event_type='submitted'      THEN n.created_at END) AS submitted
    FROM public.smartple_note_events n
    WHERE n.user_id = p_user
    GROUP BY n.subtopic, n.question_id
  )
  SELECT subtopic, question_id, viewed_answer, started_typing, submitted,
    CASE
      WHEN viewed_answer IS NOT NULL AND started_typing IS NOT NULL
           AND viewed_answer < started_typing
        THEN 'VIEWED_BEFORE_ATTEMPT'
      WHEN viewed_answer IS NOT NULL AND submitted IS NOT NULL
           AND EXTRACT(EPOCH FROM (submitted - viewed_answer)) < 15
        THEN 'COPIED'
      WHEN submitted IS NOT NULL THEN 'GENUINE'
      ELSE 'IN_PROGRESS'
    END AS flag
  FROM ev ORDER BY submitted DESC NULLS LAST;
$$;

-- ---------- MAKE YOURSELF ADMIN (run once, with YOUR email) ----------
-- UPDATE public.smartple_profiles SET role='admin'
--  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'you@example.com');

-- ---------- 9. PARENT SHARE VIEW (read-only, code-protected) ----------
ALTER TABLE public.smartple_profiles ADD COLUMN IF NOT EXISTS parent_code TEXT;

CREATE OR REPLACE FUNCTION public.parent_report(p_user uuid, p_code text)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE out JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.smartple_profiles
                 WHERE user_id = p_user AND parent_code = p_code AND p_code <> '') THEN
    RAISE EXCEPTION 'Wrong parent code';
  END IF;
  SELECT jsonb_build_object(
    'display_name', (SELECT display_name FROM public.smartple_profiles WHERE user_id = p_user),
    'class',        (SELECT class FROM public.smartple_profiles WHERE user_id = p_user),
    'total_minutes_today', COALESCE((SELECT ROUND(SUM(minutes_used),1) FROM public.smartple_usage
                                     WHERE user_id = p_user AND date = CURRENT_DATE), 0),
    'weakest', COALESCE((SELECT jsonb_agg(w) FROM (
        SELECT a.subject, a.topic,
               ROUND(100.0*AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END),1) AS avg_score
        FROM public.smartple_attempts a
        WHERE a.user_id = p_user AND a.is_correct IS NOT NULL
        GROUP BY a.subject, a.topic
        HAVING 100.0*AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END) < 60
        ORDER BY avg_score ASC LIMIT 5) w), '[]'::jsonb)
  ) INTO out;
  RETURN out;
END $$;

-- ---------- 10. NOTES TEXT (fetched on demand + cached locally; keeps app <50KB assets) ----------
CREATE TABLE IF NOT EXISTS public.smartple_notes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class TEXT NOT NULL, subject TEXT NOT NULL, topic TEXT NOT NULL,
  subtopic TEXT NOT NULL, tier INT NOT NULL DEFAULT 1,
  body TEXT NOT NULL,                 -- plain text lesson
  questions JSONB NOT NULL DEFAULT '[]',  -- 2-3 questions: [{q, answer}]
  UNIQUE (class, subject, topic, subtopic)
);
ALTER TABLE public.smartple_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notes_read ON public.smartple_notes;
CREATE POLICY notes_read ON public.smartple_notes FOR SELECT USING (true);
DROP POLICY IF EXISTS notes_admin ON public.smartple_notes;
CREATE POLICY notes_admin ON public.smartple_notes FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
