/* The owner's exact complaint: tap a student and you land on a scoreboard of
   right and wrong, never on what the learner actually wrote. These tests pin
   the navigation so that cannot come back. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Students from './Students';

const BOLTON = {
  user_id: 'u-bolton', display_name: 'Bolton', class: 'P6', role: 'student'
};

const WROTE = 'East African comunity is a regional organization formed by East African countries';

const EXAM_ROW = {
  id: 14, event_type: 'exam_submitted', user_id: BOLTON.user_id,
  created_at: '2026-09-13T09:06:00+00:00',
  details: {
    auto: false, score: 0, title: 'East African Community', exam_id: 3,
    answers: [
      { q: 'what is East African Community', ok: null, kind: 'short', given: WROTE,
        answer: '', marks: 2 }
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

/* the Progress view's own data source — kept empty so nothing it renders can
   be mistaken for the answers */
vi.mock('../lib/events', () => ({ fetchEvents: async () => [], eventsFor: () => [] }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (t: string) =>
      chain(t === 'smartple_profiles' ? [BOLTON]
        : t === 'learning_events' ? [EXAM_ROW]
        : [])
  }
}));

describe('Students · tapping a student', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('lands on what they wrote, without pressing anything else', async () => {
    const user = userEvent.setup();
    render(<Students />);

    await user.click(await screen.findByText(/Bolton/));

    /* the answers page is what opens */
    expect(await screen.findByText(/Everything Bolton has answered/)).toBeTruthy();
    /* and his own words are already on screen — the newest attempt opens itself */
    expect(screen.getByText(WROTE)).toBeTruthy();
  });

  it('does not land on the right/wrong scoreboard', async () => {
    const user = userEvent.setup();
    render(<Students />);

    await user.click(await screen.findByText(/Bolton/));
    await screen.findByText(/Everything Bolton has answered/);

    expect(screen.queryByText('Weakest subtopics (worst first)')).toBeNull();
  });

  it('still offers the scoreboard, one press away', async () => {
    const user = userEvent.setup();
    render(<Students />);

    await user.click(await screen.findByText(/Bolton/));
    await screen.findByText(/Everything Bolton has answered/);

    await user.click(screen.getByRole('button', { name: /Progress/ }));
    expect(await screen.findByText('Weakest subtopics (worst first)')).toBeTruthy();
  });
});
