/* The Active / Deactivated tabs and one-click renewal.

   The owner's spec: two tabs (green active, red expired), a "Reactivate /
   Renew" button on the expired list, a popup offering 30/60/90, and on confirm
   a new start date of today and an end date of today + N days. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Students from './Students';

const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/* A mutable store, so a renewal is visibly reflected when the list reloads. */
const ROWS = [
  { user_id: 'u-active', display_name: 'Nakato Sarah', full_name: 'Nakato Sarah', class: 'P5',
    role: 'student', student_id_unique: 'SPL-2026-0001',
    subscription_start_date: inDays(-10),
    subscription_end_date: inDays(20), paid_until: inDays(20), status: 'active' },
  { user_id: 'u-lapsed', display_name: 'Okello Denis', full_name: 'Okello Denis', class: 'P6',
    role: 'student', student_id_unique: 'SPL-2026-0002',
    subscription_start_date: inDays(-10),
    subscription_end_date: inDays(-5), paid_until: inDays(-5), status: 'active' }
];

const calls: Array<{ fn: string; args: any }> = [];

function chain(rows: any) {
  const q: any = {
    select: () => q, order: () => q, limit: () => q, eq: () => q,
    /* renewStudent now writes is_paid as well, so the chain needs update() */
    update: () => q,
    then: (onF: any, onR: any) => Promise.resolve({ data: rows, error: null }).then(onF, onR)
  };
  return q;
}

vi.mock('../lib/events', () => ({ fetchEvents: async () => [], eventsFor: () => [] }));
vi.mock('./StudentView', () => ({ default: () => <div /> }));
vi.mock('../components/StudentAnswers', () => ({ default: () => <div /> }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (t: string) => chain(t === 'smartple_profiles' ? ROWS : []),
    rpc: async (fn: string, args: any) => {
      calls.push({ fn, args });
      if (fn === 'admin_renew_student') {
        /* mirror what the database function does */
        const row = ROWS.find(r => r.user_id === args.p_user_id);
        if (row) {
          row.subscription_start_date = new Date().toISOString().slice(0, 10);
          row.subscription_end_date = inDays(args.p_days);
          row.paid_until = row.subscription_end_date;
          row.status = 'active';
        }
        return { data: { ok: true, end_date: inDays(args.p_days) }, error: null };
      }
      return { data: null, error: null };
    }
  }
}));

describe('Students · Active and Deactivated tabs', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    calls.length = 0;
    /* restore the fixture between tests */
    ROWS[1].subscription_end_date = inDays(-5);
    ROWS[1].paid_until = inDays(-5);
    ROWS[1].status = 'active';
  });

  it('opens on the active tab, showing only students who have not run out', async () => {
    render(<Students />);
    expect(await screen.findByText(/Nakato Sarah/)).toBeTruthy();
    expect(screen.queryByText(/Okello Denis/)).toBeNull();
    /* the counts are on the tabs themselves */
    const activeTab = screen.getByRole('button', { name: /Active/ });
    expect(activeTab.textContent).toContain('(1)');
    expect(screen.getByRole('button', { name: /Expired/ }).textContent).toContain('(1)');
  });

  it('the expired tab lists the student whose 30 days are done', async () => {
    const user = userEvent.setup();
    render(<Students />);
    await user.click(await screen.findByRole('button', { name: /Expired/ }));
    expect(await screen.findByText(/Okello Denis/)).toBeTruthy();
    expect(screen.queryByText(/Nakato Sarah/)).toBeNull();
    expect(screen.getByText(/expired/)).toBeTruthy();
  });

  it('renews an expired student for the chosen number of days', async () => {
    const user = userEvent.setup();
    render(<Students />);
    await user.click(await screen.findByRole('button', { name: /Expired/ }));
    await user.click((await screen.findAllByText(/Okello Denis/))[0]);

    /* the expired list offers Reactivate / Renew */
    await user.click(await screen.findByRole('button', { name: /Reactivate \/ Renew/ }));
    expect(await screen.findByText(/Renew for how many days?/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '60' }));
    await user.click(screen.getByRole('button', { name: /Confirm 60 days/ }));

    const renew = calls.find(c => c.fn === 'admin_renew_student');
    expect(renew).toBeTruthy();
    expect(renew!.args).toMatchObject({ p_user_id: 'u-lapsed', p_days: 60 });

    /* and he moves across to the active tab */
    expect(await screen.findByText(/renewed to/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Active/ }));
    /* he is now on the active tab (and still open in the detail pane, hence two) */
    expect((await screen.findAllByText(/Okello Denis/)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Active/ }).textContent).toContain('(2)');
  });

  it('offers Renew for an active student too, so access can be extended early', async () => {
    const user = userEvent.setup();
    render(<Students />);
    await user.click((await screen.findAllByText(/Nakato Sarah/))[0]);
    const btn = await screen.findByRole('button', { name: 'Renew' });
    await user.click(btn);
    expect(await screen.findByText(/Renew for how many days?/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '90' }));
    await user.click(screen.getByRole('button', { name: /Confirm 90 days/ }));

    const renew = calls.find(c => c.fn === 'admin_renew_student');
    expect(renew!.args).toMatchObject({ p_user_id: 'u-active', p_days: 90 });
  });
});
