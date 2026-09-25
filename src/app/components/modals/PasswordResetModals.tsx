/**
 * PasswordResetModals.tsx — Two modals for the forgot-password flow
 *
 * Replaces the previous vague toast ("If that email is registered we
 * sent a reset link…") with explicit, helpful UX:
 *
 *   • PasswordResetSentModal — shown when the email IS registered.
 *     Confirms the send, names the inbox, sets the 1-hour expectation,
 *     and gently nudges the user to check spam if needed.
 *
 *   • NoAccountFoundModal — shown when the email is NOT registered.
 *     States the situation plainly, offers to start signup with the
 *     email pre-filled (so the user doesn't have to retype), and
 *     keeps "try a different email" as the alternative path.
 *
 * Why two modals instead of one with conditional copy:
 *   The icons, button shapes, primary action, and emotional tone are
 *   completely different. Trying to share them produced a Frankenstein
 *   modal where neither path felt clean. Two ~60-line components are
 *   simpler than one 100-line conditional.
 *
 * Security note (account enumeration):
 *   Showing a "no account found" message DOES leak whether an email
 *   is registered. We accept this trade-off — see the long comment on
 *   sendBrandedPasswordReset in functions/src/authEmails.ts for the
 *   full rationale. Short version: Firebase's signup flow already
 *   leaks the same information via auth/email-already-in-use, so
 *   matching that behaviour here just makes the UX consistent.
 */

import { CheckCircle2, MailQuestion, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Modal, ModalBtn } from './Modal';
import { ROUTES } from '@/lib/routes';

import { useT, useTx } from '@/i18n/useT';
// ─────────────────────────────────────────────────────────────────────────────
// Modal 1 — Reset link sent
// ─────────────────────────────────────────────────────────────────────────────

interface PasswordResetSentModalProps {
  open:    boolean;
  onClose: () => void;
  email:   string;
}

export function PasswordResetSentModal({ open, onClose, email }: PasswordResetSentModalProps) {
  const t = useT();
  const tx = useTx();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Check your inbox')}
      size="sm"
      footer={
        <ModalBtn variant="primary" onClick={onClose} fullWidth>
          {t('Got it')}
        </ModalBtn>
      }
    >
      <div className="prm-body">
        {/* Success icon — gold-tinted circle to match brand accent */}
        <div className="prm-icon-circle prm-icon-success">
          <CheckCircle2 size={28} strokeWidth={1.6} color="var(--gold)" />
        </div>

        <p className="prm-msg">
          {tx('We sent a password reset link to {email}.', { email: <strong className="prm-em">{email}</strong> })}
        </p>

        <p className="prm-foot">
          {tx("The link expires in {time}. Didn't receive it? Check your spam folder or wait a minute and try again.", { time: <strong className="prm-strong">{t('1 hour')}</strong> })}
        </p>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal 2 — No account found
// ─────────────────────────────────────────────────────────────────────────────

interface NoAccountFoundModalProps {
  open:           boolean;
  onClose:        () => void;
  email:          string;
  /** Called when the user wants to try a different email — closes this
      modal and re-opens the reset form so they can edit. */
  onTryDifferent: () => void;
}

export function NoAccountFoundModal({
  open, onClose, email, onTryDifferent,
}: NoAccountFoundModalProps) {
  const t = useT();
  const tx = useTx();
  const navigate = useNavigate();

  const handleCreateAccount = () => {
    onClose();
    // Pre-fill the email on the signup page via query param. SignupPage
    // reads `?email=` on mount and sets the email field accordingly.
    // encodeURIComponent guards against +alias, &, etc. corrupting the
    // query string.
    navigate(`${ROUTES.SIGNUP}?email=${encodeURIComponent(email)}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('No account found')}
      size="sm"
      footer={
        <>
          <ModalBtn variant="outline" onClick={onTryDifferent}>
            {t('Try a different email')}
          </ModalBtn>
          <ModalBtn variant="primary" onClick={handleCreateAccount}>
            {t('Create account')} <ArrowRight size={14} />
          </ModalBtn>
        </>
      }
    >
      <div className="prm-body">
        {/* Question-mark envelope — softer than a warning icon, since
            "no account" isn't an error, just a missing one. */}
        <div className="prm-icon-circle">
          <MailQuestion size={28} strokeWidth={1.6} color="var(--muted)" />
        </div>

        <p className="prm-msg">
          {tx("We couldn't find an Ele Café account for {email}.", { email: <strong className="prm-em">{email}</strong> })}
        </p>

        <p className="prm-foot">
          {t('Sign up to start exploring our tea collection — it takes about a minute, and a welcome gift of points is on us.')}
        </p>
      </div>
    </Modal>
  );
}
