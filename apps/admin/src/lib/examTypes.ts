/* ---------------------------------------------------------------
   The shape of an exam paper, as stored in smartple_exams.questions.

   The live table has no pdf_url / answer_boxes columns (adding them needs
   the SQL editor, which only the owner can open), so the WHOLE paper lives
   in the one jsonb column that already exists. Nothing to migrate.

   Coordinates are FRACTIONS of the page (0..1), never pixels: the same
   paper must line up on a phone, a tablet and the admin's laptop.
--------------------------------------------------------------- */

export type Box = {
  id: string;
  page: number;                    // 1-based PDF page
  x: number; y: number;            // top-left corner, 0..1 of the page
  w: number; h: number;            // size, 0..1 of the page
  type: 'text' | 'mcq';
  n: number;                       // question number the student sees
  marks: number;
  label?: string;                  // optional prompt printed beside the box
  options?: string[];              // mcq only
  answer?: string;                 // mcq only: correct letter, auto-marked
};

export type Draft = {
  q: string; options: string[]; answer: string;
  kind: 'mcq' | 'short'; marks: number;
  /* Which bank this wording came from, if any. Written by QuestionBank and kept
     in the saved paper so you can always see where a question came from — and
     so nothing here is ever mistaken for something the admin invented. */
  is_from_revision_bank?: boolean;   // ple-app/data/notes   (end-of-topic exercises)
  is_from_practice_bank?: boolean;   // ple-app/data/practice (the app's own questions)
  qid?: string;      // e.g. P6_SST_001 or P5_MATH_T01-Q3
  topic?: string;    // e.g. East Africa
  subtopic?: string; // e.g. Uganda's neighbours
  level?: string;    // e.g. P6
  subject?: string;  // e.g. Social Studies
  difficulty?: string;
  explanation?: string;
};

export type Paper =
  | { kind: 'topic'; questions: Draft[] }
  | { kind: 'pdf'; pdf_path: string; boxes: Box[] };

export const BUCKET = 'exam-pdfs';

export const newBox = (page: number, x: number, y: number, w: number, h: number, type: Box['type'], n: number): Box => ({
  id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  page, x, y, w, h, type, n, marks: type === 'text' ? 5 : 1,
  label: '', options: type === 'mcq' ? ['', '', '', ''] : undefined,
  answer: type === 'mcq' ? 'A' : undefined
});

export const isPdfPaper = (p: any): p is Extract<Paper, { kind: 'pdf' }> =>
  !!p && p.kind === 'pdf' && typeof p.pdf_path === 'string';

export const boxesOf = (p: any): Box[] => (isPdfPaper(p) && Array.isArray(p.boxes) ? p.boxes : []);

export const questionsOf = (p: any): Draft[] =>
  p && p.kind === 'topic' && Array.isArray(p.questions) ? p.questions
    : Array.isArray(p) ? p : [];
