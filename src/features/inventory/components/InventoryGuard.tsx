/**
 * InventoryGuard.tsx — Route-level gate for the inventory page.
 *
 * Three gates, layered:
 *
 *   1. Firebase Auth — must be signed in. Not? → redirect to /login
 *      with returnUrl so they come back here after.
 *   2. Account identity — must be the shared inventory account
 *      (`inventory@elecafe.ca`). A regular customer account doesn't
 *      qualify. Wrong account? → redirect to /login with a hint via
 *      ?error= so LoginPage can render a one-line message.
 *   3. Access-code session — must have validated the 4-digit code in
 *      this browser session. No? → render <InventoryAccessModal />.
 *      The modal owns the validation flow; on success the session
 *      store updates and this guard re-renders with children visible.
 *
 * Auto-clear on sign-out: a separate useEffect watches Firebase auth
 * state and clears the access store the moment currentUser becomes
 * null. Without this, a user who signs out elsewhere could still see
 * cached state on this tab until they navigate.
 *
 * Admins do NOT use this route — they have their own admin path that
 * skips the code (Turn 3). This route is employee-only.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { ROUTES, loginWithReturn } from '@/lib/routes';
import { useInventoryAccess } from '@/features/inventory/hooks/useInventoryAccess';
import { InventoryAccessModal } from '@/features/inventory/components/InventoryAccessModal';
import { isInventoryEmail } from '@/lib/inventoryAccount';
import { AuthBootSplash } from '@/app/components/AuthBootSplash';

interface InventoryGuardProps {
  children: React.ReactNode;
}

export function InventoryGuard({ children }: InventoryGuardProps) {
  const { currentUser, loading, isAdmin } = useAuth();
  const { isValidated } = useInventoryAccess();
  const location = useLocation();

  // Note: access-store cleanup on sign-out is handled globally by
  // <InventorySessionSync /> at the app root (mounted alongside
  // AuthProvider), so it fires even when the user signs out from a
  // page where this guard isn't mounted. We don't duplicate that
  // logic here.

  // Gate 0: auth state still resolving. Show a tiny boot splash
  // instead of bouncing — without this, a freshly-logged-in user
  // momentarily reads as null and gets redirected back to /login
  // during the post-login navigate (~100-300ms window between
  // signInWithEmailAndPassword resolving and onAuthStateChanged
  // committing the user to React state).
  if (loading) {
    return <AuthBootSplash />;
  }

  // Gate 1: not signed in → bounce to login with returnUrl.
  if (!currentUser) {
    return (
      <Navigate
        to={loginWithReturn(location.pathname + location.search)}
        replace
      />
    );
  }

  // Gate 2: signed in, but not as the inventory account → send them
  // where they belong: admins to /admin/inventory, everyone else home.
  // Never back to /login — the login page redirects a signed-in user to
  // its returnUrl, and a returnUrl of /inventory made the two bounce
  // forever (the page "blinked" with an error after switching accounts).
  if (!isInventoryEmail(currentUser.email)) {
    return <Navigate to={isAdmin ? ROUTES.ADMIN_INVENTORY : ROUTES.HOME} replace />;
  }

  // Gate 3: signed in to inventory@, but no access-code session yet.
  // Render the modal as an overlay; children stay unmounted so the
  // inventory data doesn't even subscribe to Firestore until the
  // user is validated.
  if (!isValidated) {
    return <InventoryAccessModal />;
  }

  // All gates passed — render the protected content.
  return <>{children}</>;
}
