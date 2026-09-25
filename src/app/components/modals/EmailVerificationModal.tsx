/**
 * EmailVerificationModal — reusable modal for the email-verification UX.
 *
 * Two variants:
 *   • welcome — shown on signup or first sign-in for unverified users.
 *               Friendly tone, dismissible ("Skip for now").
 *   • blocked — shown when an unverified user tries to order or review.
 *               Firm tone, but X close still works (the action is the
 *               gate, not the modal).
 *
 * Resend flow inside the modal:
 *   1. Click "Resend" → sendEmailVerification with continueUrl pinned
 *      to /account?verified=1 (so the link in the email goes to a
 *      working hostname regardless of VITE_FIREBASE_AUTH_DOMAIN).
 *   2. Button enters 30s cooldown, persisted to localStorage so a
 *      refresh / remount doesn't reset it (would burn quota).
 *   3. "I've verified — check now" reload()s the user from Firebase
 *      servers, force-refreshes the ID token, closes on success.
 *
 * Analytics: every interaction (modal_shown / resend_clicked /
 * verified) logs to /verificationEvents.
 */
import { useEffect, useRef, useState } from 'react';
import { Mail, MailCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Modal, ModalBtn } from './Modal';
import { useAuth, ensureAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { logVerificationEvent } from '@/lib/verificationEvents';
import { isInventoryEmail } from '@/lib/inventoryAccount';

import { useT, useTx, tNow } from '@/i18n/useT';
export type VerificationModalVariant = 'welcome' | 'blocked';

interface Props {
  open:       boolean;
  onClose:    () => void;
  variant:    VerificationModalVariant;
  /** Optional context string for analytics (e.g. "checkout-blocked"). */
  reason?:    string;
  /** Called when the user successfully verifies inside the modal. */
  onVerified?: () => void;
}

const RESEND_COOLDOWN_SEC = 30;
const RESEND_LS_KEY = 'ele:verifyModalCooldownUntil';

function readCooldownRemaining(): number {
  try {
    const raw = localStorage.getItem(RESEND_LS_KEY);
    if (!raw) return 0;
    const expiry = Number(raw);
    if (!Number.isFinite(expiry)) return 0;
    return Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
  } catch (err) {
    console.warn('[EmailVerificationModal] Failed to read resend cooldown:', err);
    return 0;
  }
}

function writeCooldownExpiry(seconds: number) {
  try {
    localStorage.setItem(RESEND_LS_KEY, String(Date.now() + seconds * 1000));
  } catch (err) {
    console.warn('[EmailVerificationModal] Failed to persist resend cooldown:', err);
  }
}

export function EmailVerificationModal({
  open, onClose, variant, reason, onVerified,
}: Props) {
  const tr = useT();
  const tx = useTx();
  const { currentUser } = useAuth();

  // Inventory account has its own auth flow and never needs the
  // customer email-verification modal. We compute this flag here but
  // do NOT early-return yet — that would violate the Rules of Hooks
  // since hooks below must run on every render. Instead, every effect
  // gates on `!isInventoryUser` and the render bottom-of-component
  // returns null when this is an inventory session.
  const isInventoryUser = isInventoryEmail(currentUser?.email);

  const [cooldown,  setCooldown]  = useState<number>(() => readCooldownRemaining());
  const [resending, setResending] = useState(false);
  const [checking,  setChecking]  = useState(false);
  // Log modal_shown once per open. Without this, React StrictMode
  // double-effect or any re-render would log duplicates.
  const loggedShown = useRef(false);

  useEffect(() => {
    if (isInventoryUser) return;
    if (!open) { loggedShown.current = false; return; }
    if (loggedShown.current) return;
    loggedShown.current = true;
    if (!currentUser) return;
    // Blocked-variant opens are also action_blocked events — log both
    // so the dashboard can show "X actions blocked" separately from
    // "X welcome modals shown" without query-time joins.
    if (variant === 'blocked') {
      logVerificationEvent(currentUser.uid, 'action_blocked', {
        reason, isVerified: currentUser.emailVerified,
      });
    }
    logVerificationEvent(currentUser.uid, 'modal_shown', {
      reason: reason ?? variant,
      isVerified: currentUser.emailVerified,
    });
  }, [open, currentUser, variant, reason, isInventoryUser]);

  useEffect(() => {
    if (isInventoryUser) return;
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown, isInventoryUser]);

  // Re-read on open in case the resend was clicked elsewhere (e.g.
  // navbar banner) between mounts.
  useEffect(() => {
    if (isInventoryUser) return;
    if (open) setCooldown(readCooldownRemaining());
  }, [open, isInventoryUser]);

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    if (!currentUser) { toast.error(tNow('Please sign in first.')); return; }
    setResending(true);
    try {
      const { auth, mod } = await ensureAuth();
      if (!auth.currentUser) { toast.error(tNow('Please sign in first.')); return; }
      const continueUrl = (typeof window !== 'undefined' && window.location?.origin)
        ? `${window.location.origin}/account?verified=1` : undefined;
      await mod.sendEmailVerification(
        auth.currentUser,
        continueUrl ? { url: continueUrl, handleCodeInApp: false } : undefined,
      );
      // Apply cooldown only on success — failure shouldn't lock
      // the user out for 30s.
      setCooldown(RESEND_COOLDOWN_SEC);
      writeCooldownExpiry(RESEND_COOLDOWN_SEC);
      logVerificationEvent(currentUser.uid, 'resend_clicked', {
        reason: reason ?? variant, isVerified: currentUser.emailVerified,
      });
      toast.success(
        tNow('Verification email sent! It can take up to 5 minutes — check your inbox and spam folder.'),
        { duration: 6000 },
      );
    } catch (err) {
      console.error('[EmailVerificationModal] resend failed:', err);
      const code = (err as { code?: string })?.code ?? '';
      const friendlyMsg = code === 'auth/too-many-requests'
        ? 'Too many requests — please wait a few minutes before trying again.'
        : 'Could not send the email — please try again shortly. If the problem persists, contact support.';
      toast.error(friendlyMsg);
    } finally {
      setResending(false);
    }
  };

  const handleCheck = async () => {
    if (checking || !currentUser) return;
    setChecking(true);
    try {
      const { auth, mod } = await ensureAuth();
      if (!auth.currentUser) return;
      // reload() pulls fresh User state from Firebase servers
      // (picks up emailVerified=true after the link is clicked).
      // getIdToken(true) mints a fresh token so Firestore rules
      // see the new claim immediately.
      await mod.reload(auth.currentUser);
      await auth.currentUser.getIdToken(true);
      if (auth.currentUser.emailVerified) {
        // Sync to Firestore /users/{uid}.emailVerified=true so that
        // the onUserVerifiedGrantBonus trigger fires and grants the
        // welcome bonus. This is best-effort — if it fails, the bonus
        // simply won't fire (nothing else is impacted), and the next
        // sign-in's ensureUserDoc syncs it. We catch silently.
        try {
          await updateDoc(doc(db, 'users', auth.currentUser.uid), {
            emailVerified: true,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          console.warn('[EmailVerificationModal] /users emailVerified sync failed:', err);
        }
        logVerificationEvent(auth.currentUser.uid, 'verified', {
          reason: reason ?? variant, isVerified: true,
        });
        toast.success(tNow('Email verified — thanks!'));
        onVerified?.();
        onClose();
      } else {
        toast.info(
          tNow('Looks like you haven\'t verified yet — check your inbox (and spam folder) for the link.'),
          { duration: 6000 },
        );
      }
    } catch (err) {
      console.error('[EmailVerificationModal] verification check failed:', err);
      toast.error(tNow('Could not check verification status — please try again.'));
    } finally {
      setChecking(false);
    }
  };

  const heading  = variant === 'blocked'
    ? 'Verify your email to continue'
    : 'Welcome — please verify your email';
  const subtitle = variant === 'blocked'
    ? 'A quick step to secure your account'
    : "We've sent you a verification link";
  const HeadIcon = variant === 'blocked' ? MailCheck : Mail;
  const showSkip = variant === 'welcome';
  const emailDisplay = currentUser?.email ?? 'your email address';

  // Inventory employees use a separate auth flow — never show them
  // the customer email-verification modal. Render guard sits AFTER
  // every hook so the hook order stays stable; the effects above
  // already early-return for inventory accounts.
  if (isInventoryUser) return null;

  return (
    <Modal open={open} onClose={onClose} title={heading} subtitle={subtitle} size="sm">
      {/* Phase 3: 14 inline styles → .evm-* classes in design.css.
          Body shape: icon + lead | info card | resend cluster | footer. */}
      <div className="evm-body">
        <div className="evm-icon-cluster">
          <div className="evm-icon-circle">
            <HeadIcon size={28} aria-hidden="true" />
          </div>
          <p className="evm-lead">
            {tx('We sent a verification link to {email}', { email: <strong className="evm-email-strong">{emailDisplay}</strong> })}
          </p>
        </div>

        <div className="evm-info-card">
          {variant === 'blocked' ? (
            <>
              <p className="evm-info-heading">{tr('Why we\'re asking:')}</p>
              <p className="evm-info-body">
                {tr('We need a verified email to send you order confirmations, payment receipts, and delivery updates. Once you click the link in your email, you can place your order.')}
              </p>
            </>
          ) : (
            <>
              <p className="evm-info-heading">{tr('Quick steps:')}</p>
              <ol className="evm-info-list">
                <li>{tr('Open your email inbox')}</li>
                <li>{tr('Find our message and click the verification link')}</li>
                <li>{tr('Come back and click "I\'ve verified" below')}</li>
              </ol>
            </>
          )}
        </div>

        <div className="evm-resend-cluster">
          <p className="evm-resend-help">
            {tr('Didn\'t get the email? Check your spam folder, or')}
          </p>
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || resending}
            className="evm-resend-btn"
          >
            <RefreshCw size={14} className={resending ? 'icon-spin' : ''} aria-hidden="true" />
            {resending
              ? tr('Sending…')
              : cooldown > 0 ? tr('Resend in {n}s', { n: cooldown })
              : tr('Resend verification email')}
          </button>
        </div>
      </div>

      <div className="evm-footer">
        {showSkip && (
          <ModalBtn variant="outline" onClick={onClose} disabled={checking}>
            {tr('Skip for now')}
          </ModalBtn>
        )}
        <ModalBtn variant="primary" onClick={handleCheck} loading={checking}>
          {tr('I\'ve verified — check now')}
        </ModalBtn>
      </div>
    </Modal>
  );
}

export default EmailVerificationModal;
