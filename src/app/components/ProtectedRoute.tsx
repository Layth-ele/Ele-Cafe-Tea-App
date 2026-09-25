import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { ROUTES, loginWithReturn } from '@/lib/routes';
import { AuthBootSplash } from './AuthBootSplash';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { currentUser, isAdmin, loading } = useAuth();
  const location = useLocation();

  // Critical: don't redirect while auth is still resolving on boot.
  // Without this gate, a logged-in user landing on a protected route
  // (e.g. /admin/inventory via deep link or bookmark) gets bounced to
  // /login during the brief window between page-load and the first
  // onAuthStateChanged callback firing. That bounce manifests as a
  // blank flash followed by the login form rendering — the user
  // appears unauthenticated even though they are.
  if (loading) {
    return <AuthBootSplash />;
  }

  if (!currentUser) {
    // Preserve the page the user was trying to reach so LoginPage
    // can redirect back to it after a successful login.
    return <Navigate to={loginWithReturn(location.pathname + location.search)} replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return <>{children}</>;
}
