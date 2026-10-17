-- =====================================================================
-- FIX: smartple_questions / smartple_attempts were created by the SIMPLE
-- 5-table script, but the mobile apps need the FULL-schema versions.
-- Both tables hold only demo/empty rows, so we rebuild them cleanly.
-- parent_codes + all other tables are left untouched.
-- Run ONCE in the SQL editor.
-- =====================================================================

DROP TABLE IF EXISTS public.smartple_attempts;
DROP TABLE IF EXISTS public.smartple_questions;

-- FULL question bank (tiered) -----------------------------------------
CREATE TABLE public.smartple_questions (
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
CREATE INDEX q_filter_idx ON public.smartple_questions (class, subject, topic, tier);

-- FULL attempts (monitoring + anti-guessing) --------------------------
CREATE TABLE public.smartple_attempts (
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
CREATE INDEX attempts_user_idx ON public.smartple_attempts (user_id, created_at DESC);

-- RLS + policies (same as schema.sql) ---------------------------------
ALTER TABLE public.smartple_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smartple_attempts  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS questions_read ON public.smartple_questions;
CREATE POLICY questions_read ON public.smartple_questions FOR SELECT USING (true);
DROP POLICY IF EXISTS questions_admin ON public.smartple_questions;
CREATE POLICY questions_admin ON public.smartple_questions FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS attempts_self ON public.smartple_attempts;
CREATE POLICY attempts_self ON public.smartple_attempts FOR ALL
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- Grants (your ALTER DEFAULT PRIVILEGES should cover new tables,
-- these lines make it certain) ----------------------------------------
GRANT ALL ON public.smartple_questions TO anon, authenticated;
GRANT ALL ON public.smartple_attempts  TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.smartple_questions_id_seq TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.smartple_attempts_id_seq  TO anon, authenticated;

-- Demo content: P4 Math Fractions, all 5 tiers -------------------------
INSERT INTO public.smartple_questions (class, subject, topic, subtopic, tier, is_visual, kind, prompt, options, answer, explain) VALUES
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
('P4','Math','Fractions','PLE word problems',5,false,'typed','A tank is 3/4 full. After using 1/4 of the tank, what fraction is left? (answer like 1/2)','','2/4, 1/2','3/4 - 1/4 = 2/4 = 1/2.');

-- Verify:
-- SELECT class, subject, topic, tier, COUNT(*) FROM smartple_questions GROUP BY 1,2,3,4;
