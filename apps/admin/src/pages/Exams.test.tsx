import practiceBank from '../data/practiceBank.json';
import revisionBank from '../data/revisionBank.json';
/* Assert against the bank's own totals rather than a hard-coded figure, so the
   tests track the corpus instead of going stale every time the notes grow. */
const PRACTICE_N = new RegExp(practiceBank.counts.questions.toLocaleString('en-US') + ' questions');
const REVISION_N = new RegExp(revisionBank.counts.questions.toLocaleString('en-US') + ' questions');
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/* ------------------------------------------------------------------
   End-to-end for the bit that actually touches the database: pull real
   questions out of the bank, save the exam, and inspect the row that
   would be inserted into smartple_exams.questions.

   supabase is mocked, so this asserts the PAYLOAD, not the network. The
   payload is what has to carry the provenance flags and the answer key.
------------------------------------------------------------------ */

const inserted: { table: string; payload: any }[] = [];

function chain(table: string) {
  const q: any = {
    select: () => q,
    order: () => q,
    limit: () => q,
    eq: () => q,
    delete: () => q,
    insert: (payload: any) => {
      inserted.push({ table, payload });
      return { select: async () => ({ data: [{ id: 4242 }], error: null }) };
    },
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
  };
  return q;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (t: string) => chain(t),
    storage: { from: () => ({ upload: async () => ({ error: null }) }) }
  }
}));

const Exams = (await import('../pages/Exams')).default;

const sel = (label: string) => screen.getByLabelText(label);
const bodyText = () => (document.body.textContent || '').replace(/\s+/g, ' ');
const pickOption = async (user: any, label: string, re: RegExp) =>
  user.selectOptions(sel(label), screen.getByRole('option', { name: re }) as HTMLOptionElement);
const MCQ = 'Which East African country lies between Uganda and the Indian Ocean?';

describe('Create exam → question bank → Save', () => {
  beforeEach(() => { inserted.length = 0; document.body.innerHTML = ''; });

  it('saves a practice MCQ, keyed and flagged, so it marks itself', async () => {
    const user = userEvent.setup();
    render(<Exams />);

    await user.type(screen.getByPlaceholderText(/Exam title/), 'P6 SST · East Africa · Test 1');
    await user.click(screen.getByRole('button', { name: 'Pick from the question bank' }));

    await screen.findByText(PRACTICE_N, {}, { timeout: 20000 });
    /* the bank follows the exam's subject, which starts on SST */
    await user.selectOptions(sel('class'), 'P6');
    await pickOption(user, 'topic', /^East Africa \(8\)$/);
    await screen.findByText(MCQ, {}, { timeout: 5000 });

    await user.click(screen.getByText(MCQ).closest('label')!.querySelector('input[type=checkbox]')!);
    await user.click(screen.getByRole('button', { name: /Add 1 to the exam/ }));

    expect(screen.getByText(/from the app · P6_SST_001/)).toBeTruthy();
    expect(bodyText()).toMatch(/1 questions · 1 marks · 1 from the question bank/);

    await user.click(screen.getByRole('button', { name: 'Save exam' }));
    await vi.waitFor(() => expect(inserted.length).toBe(1));

    const { table, payload } = inserted[0];
    expect(table).toBe('smartple_exams');
    expect(payload.subject, 'the exam subject follows the bank it came from').toBe('SST');
    expect(payload.questions.kind).toBe('topic');

    const saved = payload.questions.questions;
    expect(saved, 'the blank starter question must not be saved').toHaveLength(1);
    expect(saved[0]).toMatchObject({
      q: MCQ,
      kind: 'mcq',
      options: ['Kenya', 'Rwanda', 'South Sudan', 'Burundi'],
      answer: 'A',
      marks: 1,
      is_from_practice_bank: true,
      qid: 'P6_SST_001',
      topic: 'East Africa',
      subtopic: "Uganda's neighbours",
      level: 'P6',
      subject: 'Social Studies'
    });
  });

  it('saves a revision exercise as a written question with the teacher\'s answer', async () => {
    const user = userEvent.setup();
    render(<Exams />);

    await user.type(screen.getByPlaceholderText(/Exam title/), 'P5 Maths · Set Concepts · Test 1');
    await user.click(screen.getByRole('button', { name: 'Pick from the question bank' }));
    await screen.findByText(PRACTICE_N, {}, { timeout: 20000 });

    await user.click(screen.getByRole('button', { name: /Revision exercises/ }));
    await screen.findByText(REVISION_N, {}, { timeout: 20000 });
    await user.selectOptions(sel('subject'), 'Mathematics');
    await user.selectOptions(sel('class'), 'P5');
    await pickOption(user, 'topic', /^Set Concepts/);

    const q = 'Write in set notation: the set of vowels in the English alphabet.';
    await screen.findByText(q, {}, { timeout: 5000 });
    await user.click(screen.getByText(q).closest('label')!.querySelector('input[type=checkbox]')!);
    await user.click(screen.getByRole('button', { name: /Add 1 to the exam/ }));
    await user.click(screen.getByRole('button', { name: 'Save exam' }));

    await vi.waitFor(() => expect(inserted.length).toBe(1));
    const saved = inserted[0].payload.questions.questions;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      q, kind: 'short', answer: '{a, e, i, o, u}',
      is_from_revision_bank: true, qid: 'P5_MATH_T01-Q1', topic: 'Set Concepts'
    });
    expect(inserted[0].payload.subject).toBe('MATH');
  });

  it('still saves a hand-written MCQ, and claims no bank for it', async () => {
    const user = userEvent.setup();
    render(<Exams />);

    await user.type(screen.getByPlaceholderText(/Exam title/), 'Hand written');
    await user.type(screen.getByPlaceholderText('The question…'), 'Which is the capital of Uganda?');
    const opts = screen.getAllByPlaceholderText(/^Option [A-D]$/);
    await user.type(opts[0], 'Kampala');
    await user.type(opts[1], 'Gulu');

    await user.click(screen.getByRole('button', { name: 'Save exam' }));
    await vi.waitFor(() => expect(inserted.length).toBe(1));

    const saved = inserted[0].payload.questions.questions;
    expect(saved).toHaveLength(1);
    expect(saved[0].kind).toBe('mcq');
    expect(saved[0].options).toEqual(['Kampala', 'Gulu']);
    expect(saved[0].is_from_practice_bank).toBeUndefined();
    expect(saved[0].is_from_revision_bank).toBeUndefined();
    expect(saved[0].qid).toBeUndefined();
  });
});
