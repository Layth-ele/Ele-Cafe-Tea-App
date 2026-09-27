/**
 * useRecaptcha — Google reCAPTCHA v3 (invisible, no badge)
 *
 * Usage:
 *   const { executeAndVerify } = useRecaptcha();
 *   const result = await executeAndVerify('login');
 *   if (!result.pass) { toast.error('Bot check failed'); return; }
 *
 * Setup (fully opt-in — nothing breaks if keys are missing):
 *   1. VITE_RECAPTCHA_SITE_KEY=6Lc...   → .env  (public, safe to commit)
 *   2. firebase functions:secrets:set RECAPTCHA_SECRET_KEY  (private, server-only)
 *   3. In Google reCAPTCHA admin: add elecafe.ca + localhost as domains
 *
 * Without VITE_RECAPTCHA_SITE_KEY:
 *   → hook is a no-op, executeAndVerify always returns { pass: true, score: 1 }
 */

import { useState, useEffect, useCallback } from 'react';
// Import only types eagerly — runtime functions/httpsCallable load lazily
// inside executeAndVerify when the bot check fires (form submit), keeping
// firebase-functions out of the customer's first-paint bundle.
import { getFunctionsLazy } from '@/lib/firebase';

declare global {
  interface Window {
    grecaptcha: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
const RECAPTCHA_TIMEOUT_MS = 8000;

export interface RecaptchaResult {
  pass: boolean; // true  = looks human, proceed
  score: number; // 0.0–1.0, higher = more likely human
  skipped: boolean; // true when SITE_KEY not configured
}

export function useRecaptcha() {
  const [ready, setReady] = useState(false);

  // Lazy-load the reCAPTCHA script once per session
  useEffect(() => {
    if (!SITE_KEY || typeof window === 'undefined') return;

    const load = () => {
      window.grecaptcha.ready(() => setReady(true));
    };

    if (document.getElementById('recaptcha-script')) {
      // Script already in DOM (e.g. component remounted)
      if (window.grecaptcha) load();
      return;
    }

    const script = document.createElement('script');
    script.id = 'recaptcha-script';
    script.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
    script.async = true;
    script.onload = load;
    script.onerror = () => console.warn('[reCAPTCHA] Script failed to load');
    document.head.appendChild(script);
  }, []);

  /**
   * Execute reCAPTCHA for the given action, then verify the token
   * server-side via the verifyRecaptcha Cloud Function.
   *
   * Returns { pass: true } immediately if SITE_KEY is not configured.
   */
  const executeAndVerify = useCallback(
    (action: string): Promise<RecaptchaResult> => {
      const runCheck = async (): Promise<RecaptchaResult> => {
        // No-op mode — key not configured
        if (!SITE_KEY) {
          return { pass: true, score: 1, skipped: true };
        }

        // reCAPTCHA script not ready yet — fail open so we don't block the user
        if (!ready || !window.grecaptcha) {
          console.warn('[reCAPTCHA] Not ready for action:', action);
          return { pass: true, score: 0.5, skipped: false };
        }

        let token: string;
        try {
          token = await window.grecaptcha.execute(SITE_KEY, { action });
        } catch (err) {
          console.warn('[reCAPTCHA] execute() failed:', err);
          return { pass: true, score: 0.5, skipped: false }; // fail open
        }

        // Send token to Cloud Function for server-side score verification.
        // We lazy-load firebase/functions here so the chunk only fetches at
        // the moment a form is actually submitted, not on initial page load.
        try {
          const { functions, httpsCallable } = await getFunctionsLazy();
          const verify = httpsCallable<
            { token: string; action: string },
            { success: boolean; score: number; pass: boolean; skipped?: boolean }
          >(functions, 'verifyRecaptcha');

          const { data } = await verify({ token, action });

          return {
            pass: data.pass ?? true,
            score: data.score ?? 0.5,
            skipped: data.skipped ?? false,
          };
        } catch (err) {
          // Cloud Function call failed (network, cold start, etc.) — fail open
          console.warn('[reCAPTCHA] verifyRecaptcha call failed:', err);
          return { pass: true, score: 0.5, skipped: false };
        }
      };

      // Neither grecaptcha.execute() nor the callable has a timeout, and on
      // iPhones (home-screen app, content blockers, Private Relay) the
      // reCAPTCHA iframe can simply never answer — the login button then
      // spun forever. Cap the check and fail open like every other failure.
      const timeout = new Promise<RecaptchaResult>((resolve) =>
        setTimeout(() => {
          console.warn('[reCAPTCHA] timed out for action:', action);
          resolve({ pass: true, score: 0.5, skipped: false });
        }, RECAPTCHA_TIMEOUT_MS),
      );
      return Promise.race([runCheck(), timeout]);
    },
    [ready],
  );

  return {
    executeAndVerify,
    ready: !SITE_KEY || ready, // always "ready" when key not configured
  };
}
