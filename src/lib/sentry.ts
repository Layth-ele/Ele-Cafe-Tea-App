/**
 * sentry.ts — Error tracking + session replay
 *
 * Phase 0.2 of the UI/UX roadmap. Captures every uncaught error,
 * unhandled promise rejection, and React render error from real users,
 * with a redacted session-replay attached to errored sessions so
 * engineers can SEE what the user did before the crash.
 *
 * Why Sentry over the alternatives:
 *   - Best-in-class replay UX (timeline + console + network on one screen)
 *   - First-class React 19 + react-router v7 integration
 *   - Source-map upload via the Vite plugin (one-line setup)
 *   - Generous free tier (5 K errors/month)
 *
 *   GlitchTip is a drop-in open-source alternative if you self-host.
 *   Highlight.io has a strong replay UX too. Either uses the same
 *   @sentry/react SDK; only the DSN changes.
 *
 * Privacy posture (PII-safe by default):
 *   - maskAllInputs:  true   → email, password, address, card all
 *                              redacted in replays.
 *   - blockAllMedia:  false  → product photos visible (not PII).
 *   - maskAllText:    false  → tea names, prices, page copy visible.
 *
 *   The combined effect: a replay shows what the user clicked, where
 *   they navigated, and what they SAW — but every value they typed is
 *   blacked out. That's the right tradeoff for an e-commerce app:
 *   debugging needs visibility into the path; respecting customers
 *   needs blindness to their data.
 *
 * Cost shape (Sentry "Team" plan, $26/mo at time of writing):
 *   - 50 K errors/month, 500 replays/month included.
 *   - tracesSampleRate 0.1 → 10% of transactions become spans (cheap)
 *   - replaysSessionSampleRate 0.05 → 5% of sessions get a base replay
 *   - replaysOnErrorSampleRate 1.0 → 100% of errored sessions ALWAYS
 *     get the replay attached (this is the value path)
 *
 *   Tune these down by 10x if you exceed the plan; the on-error path
 *   is the one that matters and it's not affected by sampling rate
 *   for sessions where the user didn't otherwise hit a sampled flag.
 *
 * No-op behavior:
 *   If VITE_SENTRY_DSN is unset (dev, fresh clone), this module
 *   short-circuits cleanly and never imports the SDK at runtime.
 *   That keeps `npm run dev` working without a Sentry account.
 */

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const APP_VERSION = import.meta.env.VITE_APP_VERSION as string | undefined;
const APP_ENV = import.meta.env.MODE; // 'development' | 'production' | 'test'

let started = false;

/**
 * Initialize Sentry. Idempotent. No-op if DSN unset.
 *
 * The dynamic import means the SDK only ships in bundles that have a
 * DSN configured at build time — Vite's tree-shake removes the import
 * call entirely when the env var is empty.
 */
export function initSentry(): void {
  if (started) return;

  // Phase 0.7.3 — prominent console warning if a production build
  // ships without a DSN. Dev builds skip silently (the comment block
  // above explains why). This warning is the explicit, audit-trail
  // version of "did the operator paste the DSN before deploying."
  if (!SENTRY_DSN) {
    if (APP_ENV === 'production' && typeof window !== 'undefined') {
      console.warn(
        '[sentry] VITE_SENTRY_DSN not set on a production build. ' +
          'Errors will NOT be captured. Set the env var and redeploy — ' +
          'see .env.example for setup. (Phase 0.7.3 gate)',
      );
    }
    return;
  }
  started = true;

  // Async — don't block the main thread on Sentry init. Captures
  // happen via window listeners that the SDK installs synchronously
  // once it loads, so any errors fired during the load delay are
  // captured by the browser's default error queue and replayed when
  // the SDK is ready.
  import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: APP_ENV,
        release: APP_VERSION,

        /* Performance traces — sample 10% to keep volume manageable. */
        tracesSampleRate: 0.1,

        /* Session replays — 5% baseline, 100% on errors. The on-error
         * path is the value path: when a user hits a problem, we ALWAYS
         * have the replay regardless of whether their session was
         * pre-sampled. */
        replaysSessionSampleRate: 0.05,
        replaysOnErrorSampleRate: 1.0,

        /* Replay integration — privacy posture documented at the top
         * of this file. Don't change without re-reading that comment. */
        integrations: [
          Sentry.replayIntegration({
            maskAllText: false,
            maskAllInputs: true,
            blockAllMedia: false,
          }),
          Sentry.browserTracingIntegration(),
        ],

        /* Ignore noise that swamps signal:
         * - The chunk-load errors that ErrorBoundary already auto-recovers.
         * - Browser extension errors (Safari especially noisy).
         * - Network failures from offline users (expected).
         */
        ignoreErrors: [
          // Chunk-load — ErrorBoundary handles these. They're noise here.
          /Failed to fetch dynamically imported module/i,
          /Loading chunk \d+ failed/i,
          /ChunkLoadError/i,
          /Importing a module script failed/i,

          // Extension noise — Sentry's own list is good but not
          // exhaustive on Safari.
          /Non-Error promise rejection captured/i,
          /ResizeObserver loop limit exceeded/i,
          /ResizeObserver loop completed with undelivered notifications/i,

          // Offline users.
          /NetworkError when attempting to fetch resource/i,
          /Failed to fetch$/i,
          /Load failed$/i, // Safari's offline error
        ],

        /* Drop events from URLs we don't control. */
        denyUrls: [
          /\/extensions\//i,
          /^chrome:\/\//i,
          /^moz-extension:\/\//i,
          /^safari-extension:\/\//i,
        ],

        /* Final scrub before send — strips anything PII-shaped that
         * slipped past redaction. Cheap insurance. */
        beforeSend(event) {
          if (event.request?.cookies) delete event.request.cookies;
          if (event.user) {
            // Keep id (we want to know which user), drop the rest.
            event.user = { id: event.user.id };
          }
          return event;
        },
      });

      // Console signal that init worked, dev only. Prod builds skip
      // (this code path is dead-code-eliminated by Vite when DEV is false).
      if (import.meta.env.DEV) {
        console.log('[sentry] initialized');
      }
    })
    .catch((err) => {
      // Sentry init shouldn't ever block the app. If the SDK fails to
      // load (network blocked, ad-blocker), log and move on.
      if (import.meta.env.DEV) {
        console.warn('[sentry] init failed (continuing without):', err);
      }
    });
}

/**
 * Best-effort manual capture for places we want to log from explicitly.
 * Most code never needs this — Sentry's auto-capture handles uncaught
 * errors. Use this when you've caught an error but it's still
 * unexpected and worth a Sentry report.
 *
 * Example:
 *   try { await criticalCheckout(); }
 *   catch (e) {
 *     captureError(e, { area: 'checkout', orderId });
 *     showFriendlyMessage();
 *   }
 */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!SENTRY_DSN) {
    if (import.meta.env.DEV) console.error('[sentry-noop]', err, context);
    return;
  }
  // Lazy access — the dynamic import in initSentry has already loaded
  // the SDK by the time application code calls captureError. Re-import
  // is cheap (dedup'd) but the catch path keeps it bullet-proof.
  import('@sentry/react')
    .then((Sentry) => {
      Sentry.captureException(err, { extra: context });
    })
    .catch(() => {
      /* drop */
    });
}
