import { useEffect, useState } from 'react';

/* =============================================================================
   Theme — light, dark, and "follow the device" until you choose.

   The class is set on <html> by an inline script in index.html before the
   first paint, so there is no white flash on load. This hook only keeps React
   and the persisted value in step after that.
   ========================================================================== */

const KEY = 'sp-theme';
export type Theme = 'light' | 'dark';

export const getTheme = (): Theme =>
  (typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === 'dark') ? 'dark' : 'light';

const apply = (t: Theme) => {
  document.documentElement.classList.toggle('dark', t === 'dark');
  try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
};

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => getTheme());

  useEffect(() => { apply(theme); }, [theme]);

  const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  return [theme, toggle];
}
