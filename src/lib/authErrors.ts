const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/wrong-password': 'Invalid email or password.',
  'auth/user-not-found': 'No account found for that email.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password is too weak.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/popup-closed-by-user': 'Sign-in popup was closed before completing login.',
  'auth/popup-blocked': 'Popup was blocked by your browser. Please allow popups and try again.',
};

export function authErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e?.code && MESSAGES[e.code]) return MESSAGES[e.code];
  return e?.message || 'Something went wrong. Please try again.';
}
