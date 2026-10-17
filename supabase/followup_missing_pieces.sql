-- =====================================================================
-- SmartPLE FOLLOW-UP: only the pieces that didn't land the first time.
-- Run in the OLD project (ftykmafgfyqvniacguyi) SQL Editor, top to
-- bottom. Everything is idempotent — safe to run twice.
-- If ANY statement shows an error, copy the exact error text and send it.
-- =====================================================================

-- ---- 1. THE NINE MISSING TABLES ----
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
  options JSONB,
  answer TEXT NOT NULL,
  explain TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS q_filter_idx ON public.smartple_questions (class, subject, topic, tier);

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

CREATE TABLE IF NOT EXISTS public.smartple_note_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subtopic TEXT NOT NULL,
  question_id BIGINT,
  event_type TEXT NOT NULL CHECK (event_type IN ('viewed_answer','started_typing','submitted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS note_events_user_idx ON public.smartple_note_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.smartple_exams (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT,
  questions JSONB NOT NULL,
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

CREATE TABLE IF NOT EXISTS public.smartple_nudges (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  seen BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.smartple_notes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  class TEXT NOT NULL, subject TEXT NOT NULL, topic TEXT NOT NULL,
  subtopic TEXT NOT NULL, tier INT NOT NULL DEFAULT 1,
  body TEXT NOT NULL,
  questions JSONB NOT NULL DEFAULT '[]',
  UNIQUE (class, subject, topic, subtopic)
);

-- ---- 2. GRANTS + ALLOW-ALL POLICIES (your "simple for now" spec) ----
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['smartple_profiles','smartple_questions','smartple_attempts',
    'smartple_assignments','smartple_usage','smartple_note_events','smartple_exams',
    'smartple_exam_assignments','smartple_nudges','smartple_notes']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS smartple_allow_all ON public.%I', t);
    EXECUTE format('CREATE POLICY smartple_allow_all ON public.%I FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- ---- 3. SIGNUP TRIGGER (new name — old app's triggers untouched) ----
CREATE OR REPLACE FUNCTION public.handle_new_user_smartple()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.smartple_profiles
    (id, user_id, display_name, full_name, class, role, is_paid)
  VALUES (
    NEW.id, NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'class_level',
             NEW.raw_user_meta_data->>'class', 'P4'),
    'student', false)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created_smartple ON auth.users;
CREATE TRIGGER on_auth_user_created_smartple AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_smartple();

-- ---- 4. ADMIN FUNCTIONS (is_admin already exists; the other four don't) ----
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.smartple_profiles
                 WHERE user_id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.scan_weak_students()
RETURNS TABLE(user_id uuid, display_name text, class text,
              subject text, topic text, avg_score numeric, suggestion text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.user_id, p.display_name, p.class, a.subject, a.topic,
         ROUND(100.0 * AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END), 1) AS avg_score,
         CASE WHEN p.class <> 'P4' THEN 'Force to P4?' ELSE 'Force Tier 1?' END AS suggestion
  FROM public.smartple_attempts a
  JOIN public.smartple_profiles p ON p.user_id = a.user_id
  WHERE a.is_correct IS NOT NULL
  GROUP BY p.user_id, p.display_name, p.class, a.subject, a.topic
  HAVING 100.0 * AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END) < 50;
$$;

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
           AND viewed_answer < started_typing THEN 'VIEWED_BEFORE_ATTEMPT'
      WHEN viewed_answer IS NOT NULL AND submitted IS NOT NULL
           AND EXTRACT(EPOCH FROM (submitted - viewed_answer)) < 15 THEN 'COPIED'
      WHEN submitted IS NOT NULL THEN 'GENUINE'
      ELSE 'IN_PROGRESS'
    END AS flag
  FROM ev ORDER BY submitted DESC NULLS LAST;
$$;

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

-- ---- 5. DEMO QUESTIONS (only if bank is empty) ----
INSERT INTO public.smartple_questions
  (class, subject, topic, subtopic, tier, is_visual, kind, prompt, options, answer, explain)
SELECT v.class, v.subject, v.topic, v.subtopic, v.tier, v.is_visual, v.kind,
       v.prompt, v.options::jsonb, v.answer, v.explain
FROM (VALUES
('P4','Math','Fractions','Sharing whole objects',1,true,'mcq','A cake is cut into 4 equal pieces. How many pieces are there?','["2","3","4","5"]','4','Count the equal pieces: 1, 2, 3, 4.'),
('P4','Math','Fractions','Sharing whole objects',1,true,'mcq','4 children share 8 oranges equally. How many oranges does each child get?','["1","2","3","4"]','2','8 ÷ 4 = 2 oranges each.'),
('P4','Math','Fractions','Sharing whole objects',1,true,'mcq','Which shows equal sharing of a chapati between 2 children?','["One big half and a small bite","Two equal halves","Three unequal parts","One whole chapati"]','Two equal halves','Equal sharing means both parts are the same size.'),
('P4','Math','Fractions','Naming unit fractions',2,true,'mcq','One part of a circle divided into 3 equal parts is called…','["one half","one third","one quarter","one fifth"]','one third','3 equal parts → each part is 1/3, "one third".'),
('P4','Math','Fractions','Naming unit fractions',2,true,'mcq','A pizza is cut into 4 equal slices. One slice is…','["1/2","1/3","1/4","1/8"]','1/4','4 equal slices → each slice is one quarter, 1/4.'),
('P4','Math','Fractions','Naming unit fractions',2,true,'mcq','What fraction of the flag is shaded if 1 of 5 equal strips is shaded?','["1/4","1/5","5/1","2/5"]','1/5','1 shaded out of 5 equal parts = 1/5.'),
('P4','Math','Fractions','Mixed numbers',3,true,'mcq','One whole pizza and half of another pizza is written as…','["1/2","2 1/2","1 1/2","3 cakes"]','1 1/2','1 whole + 1/2 = the mixed number 1 1/2.'),
('P4','Math','Fractions','Mixed numbers',3,true,'mcq','2 whole chapatis and 1/4 of another equals…','["2 1/4","1/4","9/2","2 4"]','2 1/4','2 wholes plus one quarter = 2 1/4.'),
('P4','Math','Fractions','Mixed numbers',3,true,'typed','Write as a mixed number: 7 halves of an orange (7/2).','','3 1/2','7/2 = 6/2 + 1/2 = 3 wholes and 1/2.'),
('P4','Math','Fractions','Adding like fractions',4,false,'mcq','1/5 + 2/5 =','["3/10","3/5","2/5","1/5"]','3/5','Same denominator: add the top numbers only.'),
('P4','Math','Fractions','Adding like fractions',4,false,'mcq','3/8 + 4/8 =','["7/16","7/8","1/8","12/8"]','7/8','3 + 4 = 7, denominator stays 8.'),
('P4','Math','Fractions','Subtracting like fractions',4,false,'typed','5/6 - 2/6 = ? (answer like 1/2)','','3/6, 1/2','5 - 2 = 3 → 3/6, which simplifies to 1/2.'),
('P4','Math','Fractions','PLE word problems',5,false,'mcq','A farmer used 1/3 of his garden for maize and 1/6 for beans. What fraction of the garden is used? (PLE style)','["1/9","1/2","2/9","5/6"]','1/2','1/3 = 2/6; 2/6 + 1/6 = 3/6 = 1/2.'),
('P4','Math','Fractions','PLE word problems',5,false,'mcq','Musa ate 2/5 of a cake and gave 1/5 to his sister. What fraction remains? (PLE style)','["3/5","2/5","1/5","4/5"]','2/5','Used 2/5 + 1/5 = 3/5; remaining = 5/5 - 3/5 = 2/5.'),
('P4','Math','Fractions','PLE word problems',5,false,'typed','A tank is 3/4 full. After using 1/4 of the tank, what fraction is left? (answer like 1/2)','','2/4, 1/2','3/4 - 1/4 = 2/4 = 1/2.')
) AS v(class, subject, topic, subtopic, tier, is_visual, kind, prompt, options, answer, explain)
WHERE NOT EXISTS (SELECT 1 FROM public.smartple_questions);

-- ---- 6. Make sure the API sees everything new ----
NOTIFY pgrst, 'reload schema';
