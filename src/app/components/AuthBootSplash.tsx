
import { useT } from '@/i18n/useT';/**
 * AuthBootSplash.tsx — Minimal branded loading screen shown while
 * Firebase Auth is resolving the initial state on app boot.
 *
 * Rationale: every route guard (ProtectedRoute, InventoryGuard) used
 * to read `currentUser` immediately on mount, treating `null` as
 * "logged out". But `null` ALSO means "auth state hasn't resolved
 * yet" (the first ~100-300ms of any session, while
 * onAuthStateChanged is fetching the user object + ID token). Guards
 * that bounce to /login during that window create the "blank flash"
 * the user reported, since they're already signed in but the React
 * state hasn't caught up.
 *
 * This component renders during that window — visible briefly only
 * on the very first guarded route per session.
 *
 * No-text-flash policy: we intentionally do NOT render copy here
 * ("Loading…", "Please wait…") because the splash should be
 * imperceptible on a fast connection. A spinner alone is enough
 * signal if the network is slow.
 */


export function AuthBootSplash() {
  const t = useT();
  return (
    <div className="auth-boot" role="status" aria-live="polite" aria-busy="true">
      <span className="auth-boot-spinner" aria-hidden="true" />
      <span className="sr-only">{t('Loading your session…')}</span>
    </div>
  );
}
