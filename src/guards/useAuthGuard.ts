/**
 * Layer 1 — React hook: useAuthGuard
 * Client-side guard that runs on every protected action
 *
 * Usage in tea profile component:
 * const { requireAuth } = useAuthGuard()
 * onClick={() => requireAuth(() => submitRating())}
 */

import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { loginWithReturn } from '@/lib/routes';

export function useAuthGuard() {
  const { currentUser, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Call this before any protected action (rate, purchase, add to cart, etc.)
   *
   * @param action - The function to execute if user is authenticated
   * @param redirectPath - Optional custom redirect path (defaults to current path)
   */
  const requireAuth = (
    action: () => void | Promise<void>,
    redirectPath?: string
  ) => {
    if (loading) return; // Wait for auth to resolve

    if (!currentUser) {
      // Save intended destination so user lands back after login
      const returnUrl = redirectPath ?? `${location.pathname}${location.search}${location.hash}`;
      navigate(loginWithReturn(returnUrl));
      return;
    }

    // User is authenticated — run the action
    action();
  };

  return {
    user: currentUser,
    loading,
    requireAuth,
    isAuthenticated: !!currentUser
  };
}
