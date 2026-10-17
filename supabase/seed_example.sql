-- Example seed: P4 Math — Fractions, all 5 tiers (run after schema.sql).
-- This is the template for every topic: T1 comfort → T5 UNEB level.
INSERT INTO public.smartple_questions (class, subject, topic, subtopic, tier, is_visual, kind, prompt, options, answer, explain) VALUES
-- T1 Comfort (whole numbers, visual)
('P4','Math','Fractions','Sharing whole objects',1,true,'mcq','A cake is cut into 4 equal pieces. How many pieces are there?',['2','3','4','5'],'4','Count the equal pieces: 1, 2, 3, 4.'),
('P4','Math','Fractions','Sharing whole objects',1,true,'mcq','4 children share 8 oranges equally. How many oranges does each child get?',['1','2','3','4'],'2','8 ÷ 4 = 2 oranges each.'),
('P4','Math','Fractions','Sharing whole objects',1,true,'mcq','Which shows equal sharing of a chapati between 2 children?',['One big half and a small bite','Two equal halves','Three unequal parts','One whole chapati'],'Two equal halves','Equal sharing means both parts are the same size.'),
-- T2 Language of Fractions (unit fractions with images)
('P4','Math','Fractions','Naming unit fractions',2,true,'mcq','One part of a circle divided into 3 equal parts is called…',['one half','one third','one quarter','one fifth'],'one third','3 equal parts → each part is 1/3, "one third".'),
('P4','Math','Fractions','Naming unit fractions',2,true,'mcq','A pizza is cut into 4 equal slices. One slice is…',['1/2','1/3','1/4','1/8'],'1/4','4 equal slices → each slice is one quarter, 1/4.'),
('P4','Math','Fractions','Naming unit fractions',2,true,'mcq','What fraction of the flag is shaded if 1 of 5 equal strips is shaded?',['1/4','1/5','5/1','2/5'],'1/5','1 shaded out of 5 equal parts = 1/5.'),
-- T3 Mixed Numbers Bridge
('P4','Math','Fractions','Mixed numbers',3,true,'mcq','One whole pizza and half of another pizza is written as…',['1/2','2 1/2','1 1/2','3/2 cakes'],'1 1/2','1 whole + 1/2 = the mixed number 1 1/2.'),
('P4','Math','Fractions','Mixed numbers',3,true,'mcq','2 whole chapatis and 1/4 of another equals…',['2 1/4','1/4','9/2','2 4/1'],'2 1/4','2 wholes plus one quarter = 2 1/4.'),
('P4','Math','Fractions','Mixed numbers',3,true,'typed','Write as a mixed number: 7 halves of an orange (7/2).','1 1/2, 3 1/2','3 1/2','7/2 = 6/2 + 1/2 = 3 wholes and 1/2.'),
-- T4 Easy Operations
('P4','Math','Fractions','Adding like fractions',4,false,'mcq','1/5 + 2/5 =',['3/10','3/5','2/5','1/5'],'3/5','Same denominator: add the top numbers only.'),
('P4','Math','Fractions','Adding like fractions',4,false,'mcq','3/8 + 4/8 =',['7/16','7/8','1/8','12/8'],'7/8','3 + 4 = 7, denominator stays 8.'),
('P4','Math','Fractions','Subtracting like fractions',4,false,'typed','5/6 − 2/6 = ? (answer like 1/2)','3/6, 1/2','1/2','5 − 2 = 3 → 3/6, which simplifies to 1/2.'),
-- T5 PLE UNEB Level
('P4','Math','Fractions','PLE word problems',5,false,'mcq','A farmer used 1/3 of his garden for maize and 1/6 for beans. What fraction of the garden is used? (PLE style)',['1/9','1/2','2/9','5/6'],'1/2','1/3 = 2/6; 2/6 + 1/6 = 3/6 = 1/2.'),
('P4','Math','Fractions','PLE word problems',5,false,'mcq','Musa ate 2/5 of a cake and gave 1/5 to his sister. What fraction remains? (PLE style)',['3/5','2/5','1/5','4/5'],'2/5','Used 2/5 + 1/5 = 3/5; remaining = 5/5 − 3/5 = 2/5.'),
('P4','Math','Fractions','PLE word problems',5,false,'typed','A tank is 3/4 full. After using 1/4 of the tank, what fraction is left? (answer like 1/2)','2/4, 1/2','1/2','3/4 − 1/4 = 2/4 = 1/2.');
