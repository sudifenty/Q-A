-- =====================================================================
-- REPAIR: missing functions + policies (allow-all model, "for now").
-- Idempotent — safe to run more than once. Run in the SQL editor.
-- =====================================================================

-- 1) is_admin() (used by admin RPCs) ----------------------------------
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.smartple_profiles
                 WHERE user_id = auth.uid() AND role = 'admin');
$$;

-- 2) auto-create a profile row on signup ------------------------------
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

-- 3) allow-all policies on every app table -----------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'smartple_profiles','smartple_questions','smartple_attempts',
    'smartple_assignments','smartple_usage','smartple_note_events',
    'smartple_exams','smartple_exam_assignments','smartple_nudges',
    'smartple_notes','parent_codes','smartple_mock_exams'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "allow all" ON public.%I', t);
    EXECUTE format('CREATE POLICY "allow all" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- 4) admin dashboard RPCs ----------------------------------------------
CREATE OR REPLACE FUNCTION public.scan_weak_students()
RETURNS TABLE(user_id uuid, display_name text, class text,
              subject text, topic text, avg_score numeric, suggestion text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.user_id, p.display_name, p.class, a.subject, a.topic,
         ROUND(100.0 * AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END), 1) AS avg_score,
         CASE WHEN p.class <> 'P4' THEN 'Force to P4?' ELSE 'Force Tier 1?' END
  FROM public.smartple_attempts a
  JOIN public.smartple_profiles p ON p.user_id = a.user_id
  WHERE a.is_correct IS NOT NULL
  GROUP BY p.user_id, p.display_name, p.class, a.subject, a.topic
  HAVING 100.0 * AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END) < 50;
$$;

CREATE OR REPLACE FUNCTION public.scan_guessers()
RETURNS TABLE(user_id uuid, display_name text, n_questions bigint, total_seconds bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.user_id, p.display_name, COUNT(*), COALESCE(SUM(a.time_spent_seconds),0)
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
      WHEN viewed_answer IS NOT NULL AND started_typing IS NOT NULL AND viewed_answer < started_typing
        THEN 'VIEWED_BEFORE_ATTEMPT'
      WHEN viewed_answer IS NOT NULL AND submitted IS NOT NULL
           AND EXTRACT(EPOCH FROM (submitted - viewed_answer)) < 15
        THEN 'COPIED'
      WHEN submitted IS NOT NULL THEN 'GENUINE'
      ELSE 'IN_PROGRESS'
    END
  FROM ev ORDER BY submitted DESC NULLS LAST;
$$;

-- Verify after running:
-- SELECT public.is_admin();                -- should return false (not signed in)
-- SELECT * FROM public.smartple_attempts;  -- should not error
