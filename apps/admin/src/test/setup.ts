/* jsdom has no window.matchMedia and logs on every alert; both would bury the
   real output of the component tests. */
import { vi } from 'vitest';

if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false, media: '', onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false
  } as unknown as MediaQueryList);
}

/* alerts are how this admin reports a failed save — capture, never throw */
window.alert = vi.fn();
window.confirm = vi.fn(() => true);
