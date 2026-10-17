import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/* ------------------------------------------------------------------
   Fixtures are Bolton's REAL rows, copied from the live database, not
   invented shapes. If the reader drifts from what the phone writes, this
   fails — which matters, because a blank on this page looks exactly like
   a wrong answer.
------------------------------------------------------------------ */

const BOLTON = {
  user_id: '7aa3cc38-915e-4b33-8268-c7fb8dd22ef1',
  display_name: 'Bolton', class: 'P6', role: 'student' as const
};

/* learning_events, as returned by PostgREST: payload inside `details`.
   Mutable so a test can add a practice run to Bolton's history. */
const EXAM_ROW = {
    id: 7, event_type: 'exam_submitted', user_id: BOLTON.user_id,
    created_at: '2026-09-13T09:06:28.345775+00:00',
    details: {
      auto: false, score: 0, title: 'East African Community', exam_id: 3,
      answers: [
        {
          q: 'what is East African Community', ok: null, kind: 'short',
          given: 'East African comunity is a regional organization formed by East African countries to work for the benefit of their people',
          marks: 2, answer: ''
        },
        { q: 'countries that formed East African Community', ok: null, kind: 'short', given: '', marks: 2, answer: '' }
      ]
    }
  };
const SCREEN_ROW =
  { id: 8, event_type: 'screen_view', user_id: BOLTON.user_id, created_at: '2026-09-13T09:09:45+00:00', details: { screen: 'practice' } };

/* exactly what the phone now posts when a practice run is finished: prose
   answers carry the learner's own verdict, because the app cannot mark them */
const PRACTICE_ROW = {
  id: 9, event_type: 'practice_submitted', user_id: BOLTON.user_id,
  created_at: '2026-09-13T11:20:00+00:00',
  details: {
    cls: 'P6', subj: 'SST', tid: 'P6_SST_T01', topic: 'East Africa',
    set: 'Basic Practice', mode: '', got: 3, max: 4, pct: 75,
    answers: [
      {
        qid: 'P6_SST_T01_Q01', q: 'Name two countries that border Uganda.',
        given: 'Kenya and Rwanda',
        answer: 'Any two of: Kenya, Tanzania, Rwanda, South Sudan, DR Congo.',
        kind: 'list', marks: 2, max: 2, ok: true, self: null, state: 'right'
      },
      {
        qid: 'P6_SST_T01_Q02', q: 'Explain why the river Nile is important to Uganda.',
        given: 'It gives water for drinking and fish for food',
        answer: 'It supplies water for homes, farms and industry, gives fish, and is used to generate electricity at Jinja.',
        kind: 'self', marks: 1, max: 2, ok: null, self: 'part', state: 'part'
      }
    ]
  }
};

let EVENTS: any[] = [EXAM_ROW, SCREEN_ROW];

const ASSIGNMENTS = [
  { id: 19, exam_id: 4, user_id: BOLTON.user_id, status: 'locked', score: null },
  { id: 18, exam_id: 3, user_id: BOLTON.user_id, status: 'completed', score: 0 }
];
/* exam 4 exactly as it is stored live: three multiple-choice questions */
const MORNING_PAPER = {
  kind: 'topic',
  questions: [
    { q: 'What is meant by “Regional cooperation”?', kind: 'mcq', marks: 1, answer: 'A',
      options: ['When countries in the same region work together to achieve common goals',
                'Cholera and typhoid from dirty water; malaria from stagnant water; coughs from smoke and dust',
                'The activity of removing minerals from the ground',
                'The sending and receiving of information from one person to another'] },
    { q: 'What is meant by “Trade”?', kind: 'mcq', marks: 1, answer: 'C',
      options: ['The movement of people and goods by using water bodies',
                'The movement of people and goods from one place to another using roads',
                'The buying and selling of goods and services',
                'Ruling a colony through the existing African chiefs'] },
    { q: 'What is meant by “Organ of the EAC”?', kind: 'mcq', marks: 1, answer: 'B',
      options: ['The steps followed in choosing leaders through voting',
                'A body responsible for carrying out particular duties of the Community',
                'Overgrazing, tree cutting and bush burning turn land into semi-desert, as in parts of Karamoja',
                'A country ruled directly by a foreign power'] }
  ]
};
const EXAMS = [
  { id: 3, title: 'East African Community' },
  { id: 4, title: 'Morning paper', questions: MORNING_PAPER }
];

/* Bolton's real submission for that paper: he tapped A, and left two blank */
const MORNING_ROW = {
  id: 17, event_type: 'exam_submitted', user_id: BOLTON.user_id,
  created_at: '2026-09-13T12:00:00+00:00',
  details: {
    auto: true, score: 33, title: 'Morning paper', exam_id: 4,
    answers: [
      { q: 'What is meant by “Regional cooperation”?', ok: true, kind: 'mcq', given: 'A', marks: 1, answer: 'A' },
      { q: 'What is meant by “Trade”?', ok: false, kind: 'mcq', given: '', marks: 1, answer: 'C' },
      { q: 'What is meant by “Organ of the EAC”?', ok: false, kind: 'mcq', given: '', marks: 1, answer: 'B' }
    ]
  }
};

function chain(rows: any) {
  const q: any = {
    select: () => q, order: () => q, limit: () => q, eq: () => q,
    then: (onF: any, onR: any) => Promise.resolve({ data: rows, error: null }).then(onF, onR)
  };
  return q;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (t: string) =>
      chain(t === 'learning_events' ? EVENTS : t === 'smartple_exam_assignments' ? ASSIGNMENTS : EXAMS)
  }
}));

const StudentAnswers = (await import('../components/StudentAnswers')).default;
const bodyText = () => (document.body.textContent || '').replace(/\s+/g, ' ');

describe('StudentAnswers', () => {
  beforeEach(() => { document.body.innerHTML = ''; EVENTS = [EXAM_ROW, SCREEN_ROW]; });

  it('shows exactly what Bolton wrote, word for word', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    /* his real wording, including the spelling he used */
    expect(bodyText()).toContain(
      'East African comunity is a regional organization formed by East African countries to work for the benefit of their people');
    expect(screen.getByText('Q1. what is East African Community')).toBeTruthy();
    expect(screen.getByText('Q2. countries that formed East African Community')).toBeTruthy();
  });

  it('marks written answers as needing the teacher, and shows a blank as blank', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    const needs = screen.getAllByText('needs your marking');
    expect(needs, 'both of his answers were written, so neither marked itself').toHaveLength(2);
    expect(screen.getByText('left blank — they wrote nothing here')).toBeTruthy();
    expect(screen.getAllByText(/no model answer was saved with this question/),
      'neither question was saved with a model answer').toHaveLength(2);
    expect(bodyText()).toMatch(/2 answers recorded/);
    expect(bodyText()).toMatch(/2 waiting for you/);
    /* nothing has been marked yet, so both marked counters are honestly zero */
    expect(bodyText(), 'one of his two answers was blank').toMatch(/1 left blank/);
    expect(bodyText()).not.toMatch(/not correct/);
  });

  it('names the paper and says the score covered only the auto-marked part', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);
    /* this is the newest attempt, so it is already open */
    expect(screen.getByText('East African Community', { selector: 'b' })).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
    expect(bodyText()).toMatch(/written answers still need you/);
  });

  it('lists the exam he was given but never opened', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);
    expect(screen.getByText('Given but not attempted')).toBeTruthy();
    expect(screen.getByText('Morning paper')).toBeTruthy();
    expect(screen.getByText('locked — not opened')).toBeTruthy();
  });

  it('a screen_view is not an answer and must not appear as one', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);
    expect(bodyText(), 'only the two real answers count').toMatch(/2 answers recorded/);
    /* one attempt badge, and it is the exam — the screen_view made no attempt card.
       ('practice' also appears on the filter button, so match the badge text.) */
    expect(screen.getAllByText('exam')).toHaveLength(1);
    expect(screen.queryAllByText('practice').length, 'only the filter button, no practice attempt').toBe(1);
  });

  it('filters to practice, where there is nothing, and says why', async () => {
    const user = userEvent.setup();
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    await user.click(screen.getByRole('button', { name: 'practice' }));
    expect(screen.getByText('Nothing recorded yet.')).toBeTruthy();
    /* the honest gap: practice before this update stayed on the phone */
    expect(bodyText()).toMatch(/only\s+from runs finished after this update/);
  });
});


describe('StudentAnswers · practice runs', () => {
  beforeEach(() => { document.body.innerHTML = ''; EVENTS = [PRACTICE_ROW]; });

  it('shows what the learner wrote in a practice run', async () => {
    const user = userEvent.setup();
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    /* this is the newest attempt, so it is already open and showing the writing */
    expect(screen.getByText('East Africa · Basic Practice', { selector: 'b' })).toBeTruthy();
    expect(screen.getByText('Q1. Name two countries that border Uganda.')).toBeTruthy();
    expect(bodyText()).toContain('Kenya and Rwanda');
    expect(screen.getByText('75%')).toBeTruthy();
    expect(bodyText()).toMatch(/2 answers recorded/);
  });

  it('shows the model answer next to a prose answer they marked themselves', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    expect(bodyText()).toContain('It gives water for drinking and fish for food');
    expect(bodyText()).toContain('It supplies water for homes, farms and industry');
    /* the learner's own verdict, with what they awarded themselves */
    expect(screen.getByText(/they marked this themselves: partly correct · gave themselves 1\/2/)).toBeTruthy();
    expect(bodyText()).toMatch(/marked on the phone — prose answers were marked by the learner/);
  });

  it('counts a self-marked prose answer as waiting for the teacher', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);
    expect(bodyText(), 'the prose answer was only self-marked').toMatch(/1 waiting for you to mark/);
  });

  it('appears under the practice filter and not under exams', async () => {
    const user = userEvent.setup();
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    await user.click(screen.getByRole('button', { name: 'exams' }));
    expect(screen.getByText('Nothing recorded yet.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'practice' }));
    expect(screen.getByText('Q1. Name two countries that border Uganda.')).toBeTruthy();
  });
});


describe('StudentAnswers · a multiple-choice answer shown as words', () => {
  beforeEach(() => { document.body.innerHTML = ''; EVENTS = [MORNING_ROW]; });

  it('turns the letter they tapped into the option they chose', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    /* the bare letter is useless to read — the words are what the teacher wants */
    expect(screen.getByText(
      'A. When countries in the same region work together to achieve common goals')).toBeTruthy();
    const bare = screen.queryAllByText('A');
    expect(bare, 'the letter must never appear on its own').toHaveLength(0);
  });

  it('shows the two he left blank as blank, not as wrong answers', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);
    expect(screen.getAllByText('left blank — they wrote nothing here')).toHaveLength(2);
    expect(bodyText()).toMatch(/2 left blank/);
  });

  it('still names the question above what they wrote', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);
    expect(screen.getByText('Q1. What is meant by “Regional cooperation”?')).toBeTruthy();
    expect(screen.getByText('Q2. What is meant by “Trade”?')).toBeTruthy();
  });
});


/* The phone now records the option text itself, so the teacher's view no longer
   depends on the paper still existing in smartple_exams. These rows are exactly
   what a current build of the app sends. */
const WORDS_ROW = {
  id: 21, event_type: 'exam_submitted', user_id: BOLTON.user_id,
  created_at: '2026-09-13T14:00:00+00:00',
  details: {
    auto: true, score: 50, title: 'Words paper', exam_id: 99,   /* a paper the admin has never loaded */
    answers: [
      { q: 'What is meant by “Trade”?', ok: true, kind: 'mcq', given: 'B', marks: 1, answer: 'B',
        given_text: 'B. The buying and selling of goods and services',
        answer_text: 'B. The buying and selling of goods and services' },
      { q: 'State one country in the East African Community.', ok: null, kind: 'short',
        given: 'Countries in one region working together', answer: 'Kenya', marks: 2,
        given_text: 'Countries in one region working together', answer_text: 'Kenya' },
      { q: 'Name the currency used in Kenya.', ok: false, kind: 'short', given: '', answer: '',
        marks: 1, given_text: '', answer_text: '' }
    ]
  }
};

describe('StudentAnswers · the words stored by the phone itself', () => {
  beforeEach(() => { document.body.innerHTML = ''; EVENTS = [WORDS_ROW]; });

  it('shows the option they chose in words, without needing the paper', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    expect(screen.getByText(
      'B. The buying and selling of goods and services')).toBeTruthy();
    expect(screen.queryAllByText('B'), 'the letter must never appear on its own').toHaveLength(0);
  });

  it('shows their written answer exactly as they typed it', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    expect(screen.getByText('Countries in one region working together')).toBeTruthy();
    expect(screen.getByText('model answer: Kenya')).toBeTruthy();
  });

  it('still reads a blank as a blank', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    expect(screen.getAllByText('left blank — they wrote nothing here')).toHaveLength(1);
    expect(bodyText()).toMatch(/1 left blank/);
    expect(bodyText()).toMatch(/1 waiting for you to mark/);
  });
});


/* The owner's requirement in one flow: tap the student, see their attempts and
   topics, press one, read exactly what they wrote. */
describe('StudentAnswers · press an attempt to read what they wrote', () => {
  beforeEach(() => { document.body.innerHTML = ''; EVENTS = [MORNING_ROW, EXAM_ROW]; });

  it('opens the newest attempt on its own, so the writing is the first thing seen', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    /* no clicking needed: the newest paper is already showing what he chose */
    expect(screen.getByText(
      'A. When countries in the same region work together to achieve common goals')).toBeTruthy();
    expect(screen.getByText('▾ hide')).toBeTruthy();
  });

  it('lists every attempt with its topic and how much they wrote', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    expect(screen.getByText('Morning paper', { selector: 'b' })).toBeTruthy();
    expect(screen.getByText('East African Community', { selector: 'b' })).toBeTruthy();
    expect(screen.getAllByText('▸ read what they wrote').length).toBeGreaterThanOrEqual(1);
  });

  it('pressing a closed attempt reveals the questions underneath', async () => {
    const user = userEvent.setup();
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    /* closed: the question list is not on screen yet */
    expect(screen.queryByText(/what is East African Community/i)).toBeNull();
    await user.click(screen.getByText('East African Community', { selector: 'b' }));
    expect(screen.getByText('Q1. what is East African Community')).toBeTruthy();
  });

  it('pressing the open attempt again puts it away', async () => {
    const user = userEvent.setup();
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    await user.click(screen.getByText('Morning paper', { selector: 'b' }));
    expect(screen.queryByText(
      'A. When countries in the same region work together to achieve common goals')).toBeNull();
  });
});
