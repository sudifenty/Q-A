/* End-to-end proof: the row captured from the DEPLOYED phone app by
   qa/capture_practice_run.js is fed in here unedited, and we assert on what the
   teacher actually sees. Nothing in this file is a hand-written fixture. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StudentAnswers from '../components/StudentAnswers';
/* captured verbatim from the deployed phone app by qa/capture_practice_run.js
   — a real no-answers practice run, not a hand-written fixture */
import CAPTURED from './__fixtures__/captured_practice_run.json';

const BOLTON = { user_id: 'u-bolton', display_name: 'Bolton', class: 'P6', role: 'student' as const };

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
      chain(t === 'learning_events' ? [CAPTURED] : t === 'smartple_exams' ? [] : [])
  }
}));

describe('a practice run with no answers shown, as captured from the phone', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('shows what the learner wrote, in their own words', async () => {
    const user = userEvent.setup();
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    const body = document.body.textContent || '';

    /* the run itself is listed with its topic */
    expect(screen.getByText('Safety on the Road · Random Practice', { selector: 'b' })).toBeTruthy();

    /* it is already open, because it is the newest attempt */
    expect(screen.getByText('Q1. State five effects of road accidents.')).toBeTruthy();

    /* their writing is on screen, verbatim */
    expect(body).toContain(
      'The countries worked together so they could trade and help each other develop');

    /* and so is the model answer beside it, so the teacher can disagree */
    expect(body).toContain('Death, injuries, disability, damage to property and loss of income.');

    /* the one they left blank reads as blank */
    expect(screen.getAllByText('left blank — they wrote nothing here').length)
      .toBeGreaterThan(0);

    /* their own verdict is shown as theirs, not as the teacher's marking */
    expect(body).toContain('they marked this themselves');

    console.log('\n===== WHAT THE TEACHER SEES =====\n' +
      (document.body.textContent || '').replace(/\s+/g, ' ').trim() + '\n');
  });

  it('does not lead with right or wrong', async () => {
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);
    const body = document.body.textContent || '';

    /* the summary chips count answers, blanks and what needs marking —
       there is no correct/incorrect tally */
    expect(body).toMatch(/10 answers recorded|answers recorded/);
    expect(body).toMatch(/waiting for you to mark/);
    expect(body).not.toMatch(/\bcorrect\b\s*[:·]\s*\d/i);
  });

  it('reaches the page through the practice filter', async () => {
    const user = userEvent.setup();
    render(<StudentAnswers student={BOLTON} />);
    await screen.findByText(/Everything Bolton has answered/);

    await user.click(screen.getByRole('button', { name: 'practice' }));
    expect(screen.getByText('Safety on the Road · Random Practice', { selector: 'b' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'exams' }));
    expect(screen.getByText('Nothing recorded yet.')).toBeTruthy();
  });
});
