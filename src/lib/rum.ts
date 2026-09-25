/**
 * rum.ts — Real-User Monitoring (Web Vitals)
 *
 * Streams the Core Web Vitals (LCP, INP, CLS) plus FCP and TTFB from
 * real users to a Cloud Function endpoint. Builds the dataset that
 * Phase 8 of the UI/UX roadmap (perf optimization) consumes.
 *
 * Why RUM, not just Lighthouse CI:
 *   Lighthouse runs on a perfectly clean simulated 4G connection from
 *   a CI runner. Real users are on subway WiFi with 17 Chrome
 *   extensions, on a 4-year-old Android device, throttled by their
 *   carrier. Lighthouse tells you "the build is correct"; RUM tells
 *   you "the experience is good." You need both — they answer
 *   different questions and they often disagree.
 *
 * Wire-up:
 *   Called once from main.tsx after createRoot().render(). The web-vitals
 *   library installs PerformanceObservers under the hood; metrics fire
 *   asynchronously as the user interacts. We use sendBeacon so reports
 *   survive page unload (the user navigating away is itself a signal).
 *
 * Privacy:
 *   - sessionId is generated client-side, stored in sessionStorage,
 *     scoped to the tab. Cleared when the tab closes.
 *   - No userId, no email, no cart contents — just performance metrics.
 *   - Route is collapsed to a template (`/tea-profile/:cat/:slug`) so
 *     long URLs with IDs don't fan out the metric cardinality.
 *
 * Cost shape:
 *   With 5 metrics × ~10 page views per session × 1 KB per beacon, an
 *   active customer base of 1 000 DAU writes ~50 K Firestore docs per
 *   day. At Firestore's free 50K daily writes that's at the edge —
 *   bump to BigQuery via a streaming export if you cross it. The
 *   Cloud Function endpoint (functions/src/index.ts) writes to
 *   /rum/{auto-id} with a 90-day TTL via a daily cleanup scheduler.
 */
// Phase 8 improvement — attribution mode. web-vitals' /attribution
// entrypoint instruments the same metrics PLUS gives us the
// "attribution" object describing WHY the metric had that value:
//   - LCP attribution → which element rendered last + how long each
//     phase (TTFB, resource load, render delay) took
//   - INP attribution → the offending interaction target + a breakdown
//     of input delay / processing time / presentation delay
//   - CLS attribution → the largest shifting element + its sources
// This pushes the debug data into the RUM dashboard so an "INP > 250"
// alert is actionable without re-instrumenting per-component.
import {
  onCLS, onINP, onLCP, onFCP, onTTFB,
  type Metric,
} from 'web-vitals/attribution';

/* The endpoint is configurable via env so a staging build doesn't pollute
 * prod RUM data. The default points at our Cloud Functions hosting rewrite
 * /api/rum → recordRum. If unset (e.g. local dev), beacons no-op. */
const RUM_ENDPOINT =
  (import.meta.env.VITE_RUM_ENDPOINT as string | undefined) ||
  (import.meta.env.PROD ? '/api/rum' : '');

/* Metrics are sampled — RUM at 100% is wasteful at scale and noisy in
 * dashboards. 100% is right for the first month while dashboards are
 * being built; drop to 25% once the variance has stabilized. Override
 * via env for canary releases. */
const RUM_SAMPLE_RATE = (() => {
  const raw = import.meta.env.VITE_RUM_SAMPLE_RATE as string | undefined;
  const n = raw ? Number(raw) : 1.0;
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 1.0;
})();

/** Stable per-tab session id. Used to group metrics from the same visit
 *  so that "user with bad LCP" can be cross-referenced with "user whose
 *  INP also blew up" — they're the same session. */
function getSessionId(): string {
  try {
    let id = sessionStorage.getItem('ele:rum:sid');
    if (!id) {
      id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem('ele:rum:sid', id);
    }
    return id;
  } catch (err) {
    console.warn('[rum] Failed to create session id:', err);
    return 'no-storage';
  }
}

/** Collapse high-cardinality URL params to template form so the metric
 *  /products/:cat doesn't fan out into 12 distinct route series. */
function getRoute(): string {
  let p = location.pathname || '/';
  // Tea profile: /tea-profile/{category}/{slug}
  p = p.replace(/^\/tea-profile\/[^/]+\/[^/]+$/, '/tea-profile/:category/:slug');
  // Products by category: /products/{category}
  p = p.replace(/^\/products\/[^/]+$/, '/products/:category');
  // Admin entity views: /admin/{collection}/{id}
  p = p.replace(/^\/admin\/([^/]+)\/[A-Za-z0-9_-]{16,}$/, '/admin/$1/:id');
  // Order detail: /orders/{id}
  p = p.replace(/^\/orders\/[A-Za-z0-9_-]+$/, '/orders/:id');
  return p;
}

/* Network info — best-effort; not all browsers expose it. */
type NetInfo = { effectiveType?: string; saveData?: boolean; rtt?: number; downlink?: number };
function getNetInfo(): NetInfo {
  const conn = (navigator as unknown as { connection?: NetInfo }).connection;
  if (!conn) return {};
  return {
    effectiveType: conn.effectiveType,
    saveData:      conn.saveData,
    rtt:           conn.rtt,
    downlink:      conn.downlink,
  };
}

/* Device memory — coarse-grained (0.25, 0.5, 1, 2, 4, 8 GB). Useful for
 * slicing INP regressions: "everyone with deviceMemory < 2 GB has 3x
 * worse INP" is exactly the kind of insight you want. */
function getDeviceMemory(): number | undefined {
  return (navigator as unknown as { deviceMemory?: number }).deviceMemory;
}

interface RumPayload {
  /** Metric name. */
  name:       string;
  /** Metric value (ms for time-based, unitless for CLS). */
  value:      number;
  /** Quality bucket per Google's recommended thresholds. */
  rating:     string;
  /** Delta since the last report (web-vitals streams updates for
   *  long-lived metrics like CLS and INP). */
  delta:      number;
  /** Stable id from web-vitals; lets the backend dedupe out-of-order
   *  beacons and pick the highest CLS / longest INP for the page. */
  id:         string;
  /** Initial vs reload vs back-forward — affects what's "expected". */
  navType?:   string;
  /** Route template (cardinality-collapsed). */
  route:      string;
  /** Tab session id. */
  sid:        string;
  /** Network conditions at report time. */
  net?:       NetInfo;
  /** Device memory if exposed (Chromium only). */
  mem?:       number;
  /** Whether the device requested reduced motion / data saver — these
   *  correlate with weaker hardware and weaker connections. */
  rmotion?:   boolean;
  /** App release for slicing regressions to a deploy. */
  release?:   string;
  /** Phase 8 improvement — attribution data. Set on LCP/INP/CLS
   *  beacons when web-vitals/attribution surfaces it. Each field is
   *  optional and small (selector + URL or phase breakdown). */
  attr?: {
    /** Element selector (e.g. "img.hero-bg", "h1#products-title"). */
    el?:        string;
    /** URL of the LCP resource if any (image, font). Empty for
     *  text-LCP cases. */
    url?:       string;
    /** LCP phase breakdown (ms). Each one explains a portion of LCP. */
    ttfb?:      number;
    resLoadDelay?: number;
    resLoadDur?:   number;
    elRenderDelay?: number;
    /** INP phase breakdown (ms). */
    inputDelay?:   number;
    processingDur?: number;
    presentationDelay?: number;
    /** INP interaction target type (click, keydown, pointerdown). */
    interactionType?: string;
    /** CLS — the largest shifting element selector. */
    largestShiftEl?: string;
  };
  /** Server-side fills these in (timestamp, ip-derived geo if you want it). */
}

function send(metric: Metric) {
  if (!RUM_ENDPOINT) return;

  // Phase 8 improvement — extract attribution for diagnostic-rich
  // metrics. The attribution object only exists when web-vitals
  // ships from /attribution; we typecheck-narrow to access it.
  let attr: RumPayload['attr'] | undefined;
  if (metric.name === 'LCP' && 'attribution' in metric) {
    const a = (metric as Metric & { attribution?: any }).attribution;
    attr = {
      el:             a?.element?.slice(0, 200),
      url:            a?.url?.slice(0, 200),
      ttfb:           a?.timeToFirstByte,
      resLoadDelay:   a?.resourceLoadDelay,
      resLoadDur:     a?.resourceLoadDuration,
      elRenderDelay:  a?.elementRenderDelay,
    };
  } else if (metric.name === 'INP' && 'attribution' in metric) {
    const a = (metric as Metric & { attribution?: any }).attribution;
    attr = {
      el:                a?.interactionTarget?.slice(0, 200),
      inputDelay:        a?.inputDelay,
      processingDur:     a?.processingDuration,
      presentationDelay: a?.presentationDelay,
      interactionType:   a?.interactionType,
    };
  } else if (metric.name === 'CLS' && 'attribution' in metric) {
    const a = (metric as Metric & { attribution?: any }).attribution;
    attr = {
      largestShiftEl: a?.largestShiftTarget?.slice(0, 200),
    };
  }

  const payload: RumPayload = {
    name:    metric.name,
    value:   metric.value,
    rating:  metric.rating,
    delta:   metric.delta,
    id:      metric.id,
    navType: metric.navigationType,
    route:   getRoute(),
    sid:     getSessionId(),
    net:     getNetInfo(),
    mem:     getDeviceMemory(),
    rmotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    release: import.meta.env.VITE_APP_VERSION as string | undefined,
    attr,
  };

  // sendBeacon — survives page unload, doesn't block, fire-and-forget.
  // Falls back to fetch with keepalive if Beacon is unavailable.
  try {
    const body = JSON.stringify(payload);
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon && navigator.sendBeacon(RUM_ENDPOINT, blob)) {
      return;
    }
    // Fallback path: keepalive fetch. ~64 KB max body but our payload
    // is tiny, so this is fine.
    fetch(RUM_ENDPOINT, {
      method:    'POST',
      body,
      headers:   { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => { /* swallow — RUM never blocks anything */ });
  } catch (err) {
    console.warn('[rum] RUM payload failed; dropping metric:', err);
  }
}

let rumStarted = false;

/**
 * Initialize RUM. Idempotent — calling twice in a session is a no-op.
 * Call once from main.tsx after the React tree mounts.
 */
export function initRUM(): void {
  if (rumStarted) return;
  rumStarted = true;

  // Sampling — drop sessions early so we don't even register the
  // observers on un-sampled visits. The check is per-session not
  // per-metric so all 5 metrics for one user are reported together
  // (or none are — partial sessions confuse aggregation).
  if (Math.random() > RUM_SAMPLE_RATE) return;

  // The web-vitals library reports LCP/CLS/INP repeatedly as the
  // metrics evolve. We forward each update; the backend keeps the
  // last (largest LCP, last CLS, longest INP).
  try {
    onCLS(send);
    onINP(send);
    onLCP(send);
    onFCP(send);
    onTTFB(send);
  } catch (err) {
    // Should never happen, but RUM is best-effort by definition.
    if (import.meta.env.DEV) console.warn('[rum] init failed:', err);
  }

  // Phase 8.7.2 improvement — long-task observer for INP debugging.
  //
  // INP measures the worst interaction latency in a session, but
  // by the time the RUM beacon arrives we've lost the context of
  // which sync task caused the stall. Capturing every long task
  // (>50ms) as a separate metric gives the dashboard the data
  // needed to answer "which handler / which route is regressing
  // our INP?" without re-instrumenting per-component.
  //
  // The observer is cheap — long tasks are infrequent in practice
  // (a healthy session has 0-5 over a 10-minute visit). We cap at
  // 50 reported tasks per session to bound the beacon volume in
  // a pathological case (a tab with a runaway script).
  try {
    if (typeof PerformanceObserver !== 'undefined' &&
        PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      let reported = 0;
      const MAX_REPORTED = 50;
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (reported >= MAX_REPORTED) return;
          reported++;
          // Reuse the same `send` codepath. The whitelist on the
          // server (`ALLOWED` set in functions/src/index.ts recordRum)
          // doesn't currently include 'LONGTASK' so this would be
          // dropped server-side — that's intentional: the recordRum
          // function should be updated to whitelist it when the
          // dashboard adds the long-task chart. Until then, this
          // observer is harmless instrumentation.
          send({
            name:           'LONGTASK',
            value:          entry.duration,
            rating:         entry.duration > 200 ? 'poor' :
                             entry.duration > 100 ? 'needs-improvement' : 'good',
            delta:          entry.duration,
            id:             `lt-${entry.startTime.toFixed(0)}-${reported}`,
            entries:        [entry as PerformanceEntry],
            navigationType: 'navigate',
          } as unknown as Metric);
        }
      });
      longTaskObserver.observe({ type: 'longtask', buffered: true });
    }
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[rum] long-task observer failed:', err);
  }
}

// ─── Custom event beacons (Phase 13) ─────────────────────────────────────────
/**
 * Pairing-view beacon. Fires one beacon per /pairings/{slug} page
 * load so the admin dashboard can rank pairings by traffic — turning
 * the combo subsystem from "shipped" into "measurable."
 *
 * Server side: recordRum's ALLOWED set must include 'PAIRING_VIEW';
 * without that, the function 204s the request and the beacon is
 * silently dropped. The beacon is fire-and-forget so a missing
 * whitelist entry doesn't break anything on the client.
 *
 * Why not a separate endpoint: RUM already has the auth-less
 * sendBeacon path, the body-size cap, the metric-name whitelist, the
 * rate-limit posture (Phase 12 TODO), and the dashboard wiring.
 * Reusing it costs ~30 lines vs ~150 for a parallel /api/events
 * endpoint with its own bucket logic.
 *
 * `value: 1` is meaningless — RUM expects a numeric value, so we
 * pass 1 as a placeholder. The dashboard counts beacons, it doesn't
 * sum values.
 */
export function sendPairingViewBeacon(slug: string): void {
  if (!RUM_ENDPOINT) return;
  if (!slug || typeof slug !== 'string') return;
  try {
    const payload = {
      name:    'PAIRING_VIEW',
      value:   1,
      route:   `/pairings/${slug.slice(0, 80)}`,
      sid:     getSessionId(),
      id:      `pv-${Date.now()}`,
      release: import.meta.env.VITE_APP_VERSION as string | undefined,
    };
    const body = JSON.stringify(payload);
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon && navigator.sendBeacon(RUM_ENDPOINT, blob)) return;
    fetch(RUM_ENDPOINT, {
      method:    'POST',
      body,
      headers:   { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => { /* swallow — beacons never block */ });
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[rum] pairing-view beacon failed:', err);
  }
}

