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
 *   • Owner / staff / admin accounts (lib/internalAccounts), and any
 *     device one of them has signed in on — the Visits report is for
 *     real customers.
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
import { useAuth } from '@/contexts/AuthContext';
import { isInternalDevice, isInternalEmail, markInternalDevice } from '@/lib/internalAccounts';

export function useTrackPageView() {
  const { pathname } = useLocation();
  const { currentUser, isAdmin, loading } = useAuth();
  // Last path logged. Logging once per path change also absorbs React
  // StrictMode double-effects and the re-run when auth resolves or the
  // user signs in on the same page.
  const lastPathRef = useRef<string>('');

  const internal = isAdmin || isInternalEmail(currentUser?.email);

  useEffect(() => {
    // Wait until we know who's signed in, so owner/staff visits on the
    // first page aren't logged before their account is recognised.
    if (loading) return;
    if (internal) markInternalDevice();
    // Skip admin routes and owner/staff browsing — customers only.
    if (pathname.startsWith('/admin') || internal || isInternalDevice()) return;
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;

    // Fire-and-forget — never await.
    logPageView(pathname, null);
  }, [pathname, loading, internal]);
}
