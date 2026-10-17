/* The subscription rules the owner specified, pinned down.

   "If today > end_date, automatically change status to DEACTIVATED / EXPIRED."
   The stored status column is a cache; these tests prove the app derives the
   truth from the dates, so a student who runs out at midnight shows up red
   even before any scheduled job has run. */
import { describe, it, expect } from 'vitest';
import {
  todayISO, endsOn, isExpired, statusOf, daysLeft, loginFor, makePassword
} from './students';

/** A date offset from today, as the YYYY-MM-DD string the DB stores. */
const inDays = (n: number): string =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe('subscription status is derived, not trusted', () => {
  it('a student whose end date is in the future is active', () => {
    const s = { subscription_end_date: inDays(12), paid_until: inDays(12), status: 'active' };
    expect(statusOf(s)).toBe('active');
    expect(isExpired(s)).toBe(false);
    expect(daysLeft(s)).toBe(12);
  });

  it('a student whose end date has passed is expired', () => {
    const s = { subscription_end_date: inDays(-1), paid_until: inDays(-1), status: 'active' };
    expect(statusOf(s)).toBe('expired');
  });

  it('the LAST day still counts as active — only today > end_date expires', () => {
    const today = todayISO();
    expect(statusOf({ subscription_end_date: today, paid_until: today })).toBe('active');
    expect(daysLeft({ subscription_end_date: today, paid_until: today })).toBe(0);
  });

  it('a stale stored status cannot keep an expired student looking active', () => {
    /* the daily job has not run yet */
    const s = { subscription_end_date: inDays(-3), paid_until: inDays(-3), status: 'active' };
    expect(statusOf(s)).toBe('expired');
  });

  it('a renewed student is active again even if the stored status says expired', () => {
    const s = { subscription_end_date: inDays(30), paid_until: inDays(30), status: 'expired' };
    expect(statusOf(s)).toBe('active');
  });

  it('no end date means permanent — never expires', () => {
    const s = { subscription_end_date: null, paid_until: null, status: 'expired' };
    expect(isExpired(s)).toBe(false);
    expect(daysLeft(s)).toBeNull();
    expect(endsOn(s)).toBeNull();
  });

  it('falls back to paid_until for students registered before the migration', () => {
    const s = { subscription_end_date: null, paid_until: inDays(-2) };
    expect(endsOn(s)).toBe(inDays(-2));
    expect(statusOf(s)).toBe('expired');
  });
});

describe('the generated login', () => {
  it('is derived from the Student ID, lowercased and punctuation-free', () => {
    expect(loginFor('SPL-2026-0007')).toBe('spl20260007@smartple.app');
    expect(loginFor('SPL-2031-0142')).toBe('spl20310142@smartple.app');
  });

  it('passwords are long enough, unique, and free of look-alike characters', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = makePassword();
      expect(p).toHaveLength(10);
      expect(p).not.toMatch(/[0O1lI]/);       // read out over the phone
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });
});
