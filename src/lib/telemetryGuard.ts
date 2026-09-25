/**
 * telemetryGuard.ts — Phase 0 dev-only wiring check
 *
 * In development builds, this module logs a one-shot summary of which
 * Phase 0 telemetry channels are wired and which are using safe
 * no-op fallbacks. It exists to catch the silent-failure mode where
 * a dev forgets to set VITE_SENTRY_DSN / VITE_RUM_ENDPOINT and ships
 * to staging without realizing telemetry isn't actually capturing.
 *
 * Behaviour:
 *   - Production builds: dead-code eliminated by Vite; module
 *     imported but the function call is a no-op import.meta.env.DEV
 *     guard, which Vite tree-shakes the body of.
 *   - Dev builds: prints a single grouped console.info on first
 *     load explaining what's wired.
 *
 * What this DOESN'T do:
 *   - Block boot. Telemetry is best-effort by design; missing config
 *     should never prevent the app from starting.
 *   - Send a beacon. The whole point is "this is a dev signal."
 *   - Validate the DSN format. Sentry's SDK does its own validation.
 *
 * What this DOES do:
 *   - Tells you, the developer, "your local env is missing X, Y, Z
 *     and your telemetry will be silent in this session" — so a
 *     bug report later that says "no errors in Sentry from this
 *     deploy" doesn't lead to a half-day of investigation.
 */

interface TelemetryStatus {
  rum: {
    endpoint:    string | undefined;
    sampleRate:  number;
    wired:       boolean;
  };
  sentry: {
    dsn:        string | undefined;
    wired:      boolean;
  };
  release: string | undefined;
}

export function reportTelemetryWiring(): void {
  // Production builds: nothing to log, dev tools aren't open anyway.
  if (!import.meta.env.DEV) return;

  // SSR / non-browser execution path: bail.
  if (typeof console === 'undefined') return;

  const status: TelemetryStatus = {
    rum: {
      endpoint:   import.meta.env.VITE_RUM_ENDPOINT as string | undefined,
      sampleRate: Number(import.meta.env.VITE_RUM_SAMPLE_RATE ?? 1.0),
      wired:      Boolean(import.meta.env.VITE_RUM_ENDPOINT) || import.meta.env.PROD,
    },
    sentry: {
      dsn:   import.meta.env.VITE_SENTRY_DSN as string | undefined,
      wired: Boolean(import.meta.env.VITE_SENTRY_DSN),
    },
    release: import.meta.env.VITE_APP_VERSION as string | undefined,
  };

  // Single grouped log so it doesn't clutter the console.
  console.groupCollapsed(
    '%c[telemetry] Phase 0 wiring %c' + (status.rum.wired && status.sentry.wired ? '✓' : '⚠'),
    'color: #b8924a; font-weight: 600',
    status.rum.wired && status.sentry.wired ? 'color: #2d6e4f' : 'color: #c48d28',
  );
  console.info('RUM:    ', status.rum.wired
    ? `wired → ${status.rum.endpoint ?? '/api/rum (default)'} @ ${(status.rum.sampleRate * 100).toFixed(0)}%`
    : 'NOT wired — set VITE_RUM_ENDPOINT or rely on /api/rum default in prod');
  console.info('Sentry: ', status.sentry.wired
    ? 'wired (DSN set; SDK will lazy-load)'
    : 'NOT wired — set VITE_SENTRY_DSN for error tracking');
  console.info('Release:', status.release ?? '(VITE_APP_VERSION not set; Sentry releases will be "unknown")');
  console.info(
    'In production, both should be wired. If your build env is missing them, ' +
    'errors won\'t reach Sentry and Web Vitals won\'t reach the RUM dashboard.',
  );
  console.groupEnd();
}
