import practiceBank from '../data/practiceBank.json';
import revisionBank from '../data/revisionBank.json';
/* Assert against the bank's own totals rather than a hard-coded figure, so the
   tests track the corpus instead of going stale every time the notes grow. */
const PRACTICE_N = new RegExp(practiceBank.counts.questions.toLocaleString('en-US') + ' questions');
const REVISION_N = new RegExp(revisionBank.counts.questions.toLocaleString('en-US') + ' questions');
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuestionBank from './QuestionBank';

/* Drives the real component against both real banks. The point of these tests
   is the hand-off: what the picker returns must be a complete, correctly keyed
   question, because that object becomes a row in smartple_exams. */

const rows = () => Array.from(document.querySelectorAll('[data-qid]'));
/* the counters are built from several text nodes, so match the rendered text
   as a whole — and if this fails, the diff shows what was really rendered */
const bodyText = () => (document.body.textContent || '').replace(/\s+/g, ' ');
const rowOf = (text: string) => {
  const label = screen.getByText(text).closest('label');
  if (!label) throw new Error(`no row for "${text}"`);
  return {
    label,
    tick: label.querySelector('input[type=checkbox]') as HTMLInputElement,
    marks: label.querySelector('input[type=number]') as HTMLInputElement
  };
};
const sel = (label: string) => screen.getByLabelText(label);
const pickOption = async (user: any, label: string, re: RegExp) =>
  user.selectOptions(sel(label), screen.getByRole('option', { name: re }) as HTMLOptionElement);

const MCQ = 'Which East African country lies between Uganda and the Indian Ocean?';

describe('QuestionBank · practice questions (the student app\'s own)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('opens on the practice bank and shows options with the right one marked', async () => {
    const user = userEvent.setup();
    render(<QuestionBank onAdd={vi.fn()} onClose={vi.fn()} />);

    await screen.findByText(PRACTICE_N, {}, { timeout: 20000 });
    await user.selectOptions(sel('subject'), 'Social Studies');
    await user.selectOptions(sel('class'), 'P6');
    await pickOption(user, 'topic', /^East Africa \(8\)$/);

    await screen.findByText(MCQ, {}, { timeout: 5000 });
    const row = rowOf(MCQ);
    /* the four options are shown, and the correct one is the bold green one */
    expect(row.label.textContent).toContain('A. Kenya');
    expect(row.label.textContent).toContain('D. Burundi');
    const correct = Array.from(row.label.querySelectorAll('span')).find(s => s.className.includes('text-emerald-700'));
    expect(correct?.textContent).toContain('Kenya');
    expect(row.label.textContent, 'the subtopic is shown as context').toContain("Uganda's neighbours");
  });

  it('returns MCQs fully keyed, so they will mark themselves on the phone', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<QuestionBank onAdd={onAdd} onClose={vi.fn()} />);
    await screen.findByText(PRACTICE_N, {}, { timeout: 20000 });
    await user.selectOptions(sel('subject'), 'Social Studies');
    await user.selectOptions(sel('class'), 'P6');
    await pickOption(user, 'topic', /^East Africa \(8\)$/);
    await screen.findByText(MCQ, {}, { timeout: 5000 });

    const all = rows().length;
    expect(all).toBeGreaterThan(1);
    /* one MCQ and one matching question: the counter must report honestly that
       only the MCQ will mark itself */
    const MATCHING = 'Match each East African country with its capital city.';
    await user.click(rowOf(MCQ).tick);
    await user.click(rowOf(MATCHING).tick);
    expect(bodyText(), "the MCQ is 1 mark, the matching question 1 per pair").toMatch(/2 selected · 5 marks · 1 will mark themselves/);

    await user.click(screen.getByRole('button', { name: /Add 2 to the exam/ }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    const [drafts, meta] = onAdd.mock.calls[0];
    expect(drafts).toHaveLength(2);
    const written = drafts.find((d: any) => d.kind === 'short');
    expect(written).toMatchObject({
      kind: 'short', is_from_practice_bank: true, topic: 'East Africa',
      answer: 'Kenya → Nairobi; Rwanda → Kigali; South Sudan → Juba; Uganda → Kampala'
    });
    expect(drafts[0]).toMatchObject({
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
    expect(drafts[0].explanation).toMatch(/Kenya lies between/);
    expect(drafts.filter((d: any) => d.kind === 'mcq')).toHaveLength(1);
    expect(meta).toMatchObject({ subject_code: 'SST', topic: 'East Africa', level: 'P6', source: 'practice' });
  });

  it('narrows by subtopic, and by search text', async () => {
    const user = userEvent.setup();
    render(<QuestionBank onAdd={vi.fn()} onClose={vi.fn()} />);
    await screen.findByText(PRACTICE_N, {}, { timeout: 20000 });
    await user.selectOptions(sel('subject'), 'Social Studies');
    await user.selectOptions(sel('class'), 'P6');
    await pickOption(user, 'topic', /^East Africa \(8\)$/);
    await screen.findByText(MCQ, {}, { timeout: 5000 });

    const all = rows().length;
    await user.selectOptions(sel('subtopic'), "Uganda's neighbours");
    await vi.waitFor(() => expect(rows().length).toBeLessThan(all));
    expect(rows().length).toBeGreaterThan(0);
    rows().forEach(r => expect(r.textContent).toContain("Uganda's neighbours"));

    await user.selectOptions(sel('subtopic'), 'all');
    await vi.waitFor(() => expect(rows().length).toBe(all));
    await user.type(screen.getByPlaceholderText('search these questions…'), 'zzzzqqq');
    await screen.findByText('No question matches those filters.');
    expect(rows()).toHaveLength(0);
  });

  it('lets you change the marks before adding', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<QuestionBank onAdd={onAdd} onClose={vi.fn()} />);
    await screen.findByText(PRACTICE_N, {}, { timeout: 20000 });
    await user.selectOptions(sel('subject'), 'Social Studies');
    await user.selectOptions(sel('class'), 'P6');
    await pickOption(user, 'topic', /^East Africa \(8\)$/);
    await screen.findByText(MCQ, {}, { timeout: 5000 });

    const row = rowOf(MCQ);
    expect(row.marks.value, 'an MCQ is worth one mark to start with').toBe('1');
    await user.clear(row.marks);
    await user.type(row.marks, '3');
    await user.click(row.tick);
    await user.click(screen.getByRole('button', { name: /Add 1 to the exam/ }));
    expect(onAdd.mock.calls[0][0][0].marks).toBe(3);
  });
});

describe('QuestionBank · revision exercises (from the notes)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('switches bank and carries the teacher\'s written answer', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<QuestionBank onAdd={onAdd} onClose={vi.fn()} />);
    await screen.findByText(PRACTICE_N, {}, { timeout: 20000 });

    await user.click(screen.getByRole('button', { name: /Revision exercises/ }));
    await screen.findByText(REVISION_N, {}, { timeout: 20000 });

    await user.selectOptions(sel('subject'), 'Mathematics');
    await user.selectOptions(sel('class'), 'P5');
    await pickOption(user, 'topic', /^Set Concepts/);

    const q = 'Write in set notation: the set of vowels in the English alphabet.';
    await screen.findByText(q, {}, { timeout: 5000 });
    expect(screen.getByText('answer: {a, e, i, o, u}')).toBeTruthy();
    expect(sel('subtopic'), 'the notes do not attach questions to subtopics, so the filter is off')
      .toHaveProperty('disabled', true);

    await user.click(rowOf(q).tick);
    await user.click(screen.getByRole('button', { name: /Add 1 to the exam/ }));
    const [drafts, meta] = onAdd.mock.calls[0];
    expect(drafts[0]).toMatchObject({
      q, kind: 'short', answer: '{a, e, i, o, u}', options: [],
      is_from_revision_bank: true, qid: 'P5_MATH_T01-Q1', topic: 'Set Concepts', level: 'P5'
    });
    expect(drafts[0].is_from_practice_bank).toBeUndefined();
    expect(meta.source).toBe('revision');
  });
});
