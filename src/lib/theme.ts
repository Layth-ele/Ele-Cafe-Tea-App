export type Theme = 'light' | 'dark';

const KEY = 'ele-cafe-theme';

function normalize(v: unknown): Theme {
  return v === 'dark' ? 'dark' : 'light';
}

export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(KEY);
  if (stored) return normalize(stored);
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const t = normalize(theme);
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.classList.toggle('dark', t === 'dark');
  try { window.localStorage.setItem(KEY, t); } catch (err) {
    console.warn('[theme] Failed to persist theme:', err);
  }
}

export function initTheme(): Theme {
  const t = getTheme();
  setTheme(t);
  return t;
}
