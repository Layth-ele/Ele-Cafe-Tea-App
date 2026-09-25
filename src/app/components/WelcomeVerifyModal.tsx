/**
 * WelcomeVerifyModal — shows the verification welcome modal once
 * after signup OR on first sign-in for users who never verified.
 *
 * Triggers (in priority order):
 *   1. Post-signup flag from localStorage (set by SignupPage on success)
 *   2. Auto-detect: user signed in, has password provider, NOT
 *      verified, no per-uid "shown" flag yet on this device.
 *
 * Skip when:
 *   • Anonymous (no user)
 *   • Already verified
 *   • Google-only users (OAuth pre-verifies)
 *   • On /signup, /login (would feel disorienting mid-auth)
 *   • On /admin/* (don't interrupt admin work)
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { EmailVerificationModal } from './modals/EmailVerificationModal';
import { isInventoryEmail } from '@/lib/inventoryAccount';

const SIGNUP_FLAG_KEY = 'ele:showWelcomeVerifyOnce';
const SIGNUP_FLAG_TTL = 24 * 60 * 60 * 1000;
const SHOWN_PREFIX    = 'ele:welcomeVerifyShown:';

/** Set the flag — called from SignupPage on success. */
export function markWelcomeVerifyPending(): void {
  try {
    localStorage.setItem(SIGNUP_FLAG_KEY, JSON.stringify({ at: Date.now() }));
  } catch (err) {
    console.warn('[WelcomeVerifyModal] Failed to persist signup flag:', err);
  }
}

function readSignupFlag(): boolean {
  try {
    const raw = localStorage.getItem(SIGNUP_FLAG_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { at?: number };
    if (typeof parsed.at !== 'number') return false;
    if (Date.now() - parsed.at > SIGNUP_FLAG_TTL) {
      // Aged out — clear so we don't show stale.
      localStorage.removeItem(SIGNUP_FLAG_KEY);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[WelcomeVerifyModal] Failed to read signup flag:', err);
    return false;
  }
}

function clearSignupFlag(): void {
  try {
    localStorage.removeItem(SIGNUP_FLAG_KEY);
  } catch (err) {
    console.warn('[WelcomeVerifyModal] Failed to clear signup flag:', err);
  }
}

function readShownFlag(uid: string): boolean {
  try {
    return localStorage.getItem(SHOWN_PREFIX + uid) === '1';
  } catch (err) {
    console.warn('[WelcomeVerifyModal] Failed to read shown flag:', err);
    return false;
  }
}

function writeShownFlag(uid: string): void {
  try {
    localStorage.setItem(SHOWN_PREFIX + uid, '1');
  } catch (err) {
    console.warn('[WelcomeVerifyModal] Failed to persist shown flag:', err);
  }
}

export function WelcomeVerifyModal() {
  const { currentUser } = useAuth();
  const { pathname }    = useLocation();
  const [open, setOpen] = useState(false);
  const shownThisSession = useRef(false);

  useEffect(() => {
    if (!currentUser) return;
    if (isInventoryEmail(currentUser.email)) return;
    if (pathname.startsWith('/admin')) return;
    if (pathname.startsWith('/inventory')) return;
    if (pathname === '/signup' || pathname === '/login') return;

    // Show the welcome verification modal for ANY unverified user,
    // regardless of sign-in provider. Earlier this was gated on
    // hasPasswordProvider on the assumption that Google users are
    // always email-verified — which is true for new Google sign-ups
    // but NOT for users whose Google account itself is unverified,
    // or accounts that started as email/password and later linked
    // Google (Firebase preserves the original email_verified=false).
    // Bypassing the modal for these users meant they couldn't place
    // orders and got a generic "couldn't process" toast with no path
    // forward.
    if (currentUser.emailVerified) return;
    if (shownThisSession.current || open) return;

    if (readShownFlag(currentUser.uid)) {
      // Exception: post-signup flag set very recently — show once
      // even if we marked shown previously (different account on
      // shared device, etc.). The 24h TTL on the signup flag bounds
      // this exception.
      if (!readSignupFlag()) return;
    }

    shownThisSession.current = true;
    writeShownFlag(currentUser.uid);
    clearSignupFlag();
    setOpen(true);
  }, [currentUser, pathname, open]);

  if (!currentUser) return null;

  return (
    <EmailVerificationModal
      open={open}
      onClose={() => setOpen(false)}
      variant="welcome"
      reason="welcome-on-signin"
    />
  );
}
