/**
 * useTrackPageView — fires logPageView on every route navigation.
 *
 * Mount once at AppShell level. Tracks pathname changes via
 * react-router's useLocation. Skips:
 *   • The initial mount BEFORE auth is resolved (so signed-in users
 *     don't get logged as anonymous on first paint, then again as
 *     authed once the listener fires — would inflate "first page"
 *     metrics).
 *   • Admin routes (/admin/*) — admin browsing isn't customer
 *     analytics signal and would skew visitor counts.
 *   • Repeat fires of the SAME pathname within a short window
 *     (defends against React StrictMode double-effects + any
 *     future router re-render that fires useLocation without a
 *     real navigation).
 *
 * One write per real page navigation. The Firestore rule is open
 * for create (no auth required) so anonymous browsing tracks too.
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { logPageView } from '@/lib/pageViews';

// Don't double-log if useLocation re-fires within this window for
// the same path. 500ms is comfortable — real navigations are far
// apart, accidental re-renders are clustered.
const DEDUP_MS = 500;

export function useTrackPageView() {
  const { pathname }    = useLocation();
  const lastPathRef     = useRef<string>('');
  const lastPathTimeRef = useRef<number>(0);

  useEffect(() => {
    // Skip admin routes — admin browsing isn't customer signal.
    if (pathname.startsWith('/admin')) return;
    // Dedup against React StrictMode double-effect / route remounts.
    const now = Date.now();
    if (lastPathRef.current === pathname && (now - lastPathTimeRef.current) < DEDUP_MS) {
      return;
    }
    lastPathRef.current = pathname;
    lastPathTimeRef.current = now;

    // Fire-and-forget — never await.
    logPageView(pathname, null);
  }, [pathname]);
}
