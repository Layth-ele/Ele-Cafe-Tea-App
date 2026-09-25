/**
 * InventoryAccessModal.tsx — 4-digit access-code entry.
 *
 * UX requirements (from the roadmap):
 *   - 4 separated inputs (one digit per box)
 *   - auto-focus to next on type, back to previous on backspace
 *   - Enter submits
 *   - paste support (pastes a 4-digit string and fills all boxes)
 *   - shake animation on invalid code
 *   - "Hi Sarah 👋" success state shown briefly before closing
 *   - loading state during the callable round-trip
 *   - mobile-optimized (numeric keyboard via inputMode + pattern)
 *
 * Lifecycle:
 *   - Mounts when the InventoryGuard detects "signed in but no
 *     validated session"
 *   - Cannot be dismissed by clicking the backdrop or ESC — the guard
 *     blocks until validation succeeds. The ✕ button cancels instead:
 *     it signs the shared account out and returns to the login page, so
 *     the next person on the counter device starts clean.
 *
 * Failure handling — discriminates by reason from useInventoryAccess:
 *   mismatch  → shake + "wrong code" message, reset boxes
 *   locked    → "too many attempts, try again in N minutes"
 *   auth      → "sign in to the inventory account first" + sign-out link
 *   invalid   → should never reach the user (client validates first)
 *   unknown   → generic "something went wrong" + retry
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useInventoryAccess } from '@/features/inventory/hooks/useInventoryAccess';
import { ROUTES } from '@/lib/routes';
import { prefetchRoute } from '@/lib/prefetchRoute';
import { lockBodyScroll } from '@/lib/bodyScrollLock';

const CODE_LENGTH    = 4;
const SUCCESS_HOLD_MS = 1400; // how long the "Hi Sarah 👋" state shows before unmounting
const SHAKE_RESET_MS  = 600;  // CSS animation runs for ~500ms; clear flag after

type Phase = 'entering' | 'submitting' | 'success' | 'error';

export function InventoryAccessModal() {
  const { validate, commit } = useInventoryAccess();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [closing, setClosing] = useState(false);

  // ✕ = cancel: leave for the login page first (so the guard doesn't
  // re-render this modal mid-sign-out), then sign the shared account out.
  async function cancel() {
    if (closing) return;
    setClosing(true);
    navigate(ROUTES.LOGIN, { replace: true });
    await logout().catch((err) => console.warn('[InventoryAccessModal] sign-out failed', err));
  }

  // One state per digit so each <input> is fully controlled.
  // (Using a single string would force every keystroke to slice and
  // dispatch four updates; per-cell state is simpler.)
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(''));
  const [phase,  setPhase]  = useState<Phase>('entering');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [greetingName, setGreetingName] = useState<string | null>(null);

  // Refs to each <input> so we can move focus programmatically.
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  // Track the success-hold timer so we can clear it on unmount —
  // otherwise a back-button-during-greeting would still fire commit()
  // against an unmounted component (works, but lint complains and the
  // intent is to bind the lifetime to this component).
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-focus the first box on mount.
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Clear the shake flag after the animation completes so it can
  // re-trigger on the next failure.
  useEffect(() => {
    if (phase !== 'error') return;
    const t = setTimeout(() => setPhase('entering'), SHAKE_RESET_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // Clean up the success-hold timer on unmount.
  useEffect(() => {
    return () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    };
  }, []);

  // Lock body scroll while the modal is open. The overlay covers the
  // viewport but on iOS the underlying page can still rubber-band-scroll
  // when the user drags on the overlay background. Use the shared
  // ref-counted helper so this gate behaves like the rest of the app's
  // modals and won't clobber another component's lock.
  useEffect(() => {
    return lockBodyScroll();
  }, []);

  // `code` is plain derivation — joining 4 strings every render is
  // cheaper than a useMemo. Keeping it outside any hook means the
  // SSR early-return below doesn't end up between hook calls (which
  // would trip react-hooks/rules-of-hooks).
  const code = digits.join('');
  const isComplete = code.length === CODE_LENGTH && /^\d{4}$/.test(code);

  if (typeof document === 'undefined') return null;

  function setDigit(idx: number, value: string) {
    // Strip non-digits. The value can be >1 char in two cases:
    //   - iOS Safari one-time-code autofill (delivers entire code into
    //     whichever cell is focused; without this branch we'd capture
    //     only the first digit and silently drop the rest).
    //   - Password-manager autofill from 1Password / Bitwarden.
    //   - User paste via context menu on a single cell (handled by the
    //     dedicated onPaste handler too, but defense in depth here).
    // When that happens, spread the digits across remaining cells.
    const clean = value.replace(/\D/g, '');
    if (clean.length > 1) {
      setDigits(prev => {
        const next = [...prev];
        for (let i = 0; i < clean.length && idx + i < CODE_LENGTH; i++) {
          next[idx + i] = clean[i];
        }
        return next;
      });
      const focusIdx = Math.min(idx + clean.length, CODE_LENGTH - 1);
      inputRefs.current[focusIdx]?.focus();
      return;
    }
    // Standard single-character path.
    setDigits(prev => {
      const next = [...prev];
      next[idx] = clean;
      return next;
    });
    if (clean && idx < CODE_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      // Empty cell + backspace → step back and clear the previous one.
      inputRefs.current[idx - 1]?.focus();
      setDigits(prev => {
        const next = [...prev];
        next[idx - 1] = '';
        return next;
      });
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft'  && idx > 0)               inputRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < CODE_LENGTH - 1) inputRefs.current[idx + 1]?.focus();
    if (e.key === 'Enter' && isComplete && phase === 'entering') void submit();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!text) return;
    e.preventDefault();
    const filled = text.split('').concat(Array(CODE_LENGTH).fill('')).slice(0, CODE_LENGTH);
    setDigits(filled);
    // Focus the next empty cell (or last cell if all filled).
    const nextIdx = Math.min(text.length, CODE_LENGTH - 1);
    inputRefs.current[nextIdx]?.focus();
  }

  async function submit() {
    if (phase !== 'entering' || !isComplete) return;
    setPhase('submitting');
    setErrorMsg('');
    const result = await validate(code);
    if (result.ok) {
      // Show the greeting LOCALLY (no store update yet). After
      // SUCCESS_HOLD_MS, commit() updates the store which triggers the
      // guard to unmount this modal and render the inventory page.
      setGreetingName(result.employeeName);
      setPhase('success');
      // Warm the InventoryPage chunk in parallel with the greeting so
      // there's no skeleton flash between "Hi Sarah" and the page.
      // prefetchRoute is idempotent + respects save-data; safe to call.
      prefetchRoute('inventory');
      commitTimerRef.current = setTimeout(() => {
        commit(result.employeeName, result.role, result.expiresAt);
      }, SUCCESS_HOLD_MS);
      return;
    }
    // Failure paths — set a human-readable message + shake.
    setErrorMsg(messageFor(result.reason, result.detail));
    setDigits(Array(CODE_LENGTH).fill(''));
    inputRefs.current[0]?.focus();
    setPhase('error');
  }

  return createPortal(
    <div
      className="iam-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Inventory access code"
    >
      <div className="iam-panel" data-phase={phase}>
        {phase !== 'success' && (
          <button
            type="button"
            className="iam-close"
            onClick={() => void cancel()}
            disabled={closing || phase === 'submitting'}
            aria-label="Cancel and sign out"
          >
            <X size={20} aria-hidden="true" />
          </button>
        )}
        {phase === 'success' && greetingName ? (
          <div className="iam-success">
            <div className="iam-success-emoji" aria-hidden="true">👋</div>
            <h2 className="iam-success-name">
              Hi {greetingName}
            </h2>
            <p className="iam-success-sub">
              Loading inventory…
            </p>
          </div>
        ) : (
          <>
            {/* Decorative lock — small visual anchor at the top of
                the card. aria-hidden so screen readers don't announce
                a meaningless icon ahead of the title. */}
            <div className="iam-icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2"/>
                <path d="M8 11V7a4 4 0 1 1 8 0v4"/>
              </svg>
            </div>
            <h2 className="iam-title">
              Enter your access code
            </h2>
            <p className="iam-sub">
              4-digit code, given to you by your manager.
            </p>

            <div className="iam-cells" aria-label="4-digit access code">
              {digits.map((d, idx) => (
                <input
                  key={idx}
                  ref={(el) => { inputRefs.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={d}
                  onChange={(e) => setDigit(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={handlePaste}
                  disabled={phase === 'submitting'}
                  aria-label={`Digit ${idx + 1} of ${CODE_LENGTH}`}
                  placeholder=" "
                  className="iam-cell"
                />
              ))}
            </div>

            {/* role='alert' is implicitly aria-live='assertive' — adding
                aria-live='polite' would conflict with the alert role.
                Using role='alert' alone for fast feedback on errors. */}
            <div className="iam-feedback" role="alert">
              {errorMsg || ' '}
            </div>

            <button
              type="button"
              onClick={() => void submit()}
              disabled={!isComplete || phase === 'submitting'}
              aria-busy={phase === 'submitting'}
              className="iam-submit"
            >
              {phase === 'submitting' ? 'Checking…' : 'Continue'}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function messageFor(reason: 'mismatch' | 'locked' | 'auth' | 'invalid' | 'unknown' | 'session', detail?: string): string {
  // Error codes are shown so staff can report exactly what happened.
  const ref = detail ? ` (error: ${detail.replace(/^functions\/|^auth\//, '')})` : '';
  switch (reason) {
    case 'mismatch': return "That code didn't match. Try again.";
    case 'locked':   return 'Too many attempts. Please try again in a few minutes.';
    case 'auth':     return 'Sign in to the inventory account first.';
    case 'invalid':  return 'Code must be 4 digits.';
    case 'session':  return `Code accepted, but the inventory session couldn't start. Please try again${ref}.`;
    case 'unknown':  return `Something went wrong. Please try again${ref}.`;
  }
}
