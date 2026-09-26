/**
 * Phase 0.7.2 — RUM-driven Slack alert.
 *
 * Runs hourly. Reads /rum docs from the last hour, computes P75 INP
 * and P75 LCP across the population, posts to Slack if either
 * threshold is exceeded.
 *
 * Why P75 hourly:
 *   - "Did we just ship a regression" needs a tight loop (sub-day)
 *     so a perf regression that escapes the Lighthouse PR gate is
 *     caught fast. Hourly is the tightest cadence that doesn't
 *     burn Firestore reads.
 *   - P75 mirrors the Core Web Vitals "good" definition (Google
 *     uses P75 of real-user data for "passes" / "fails"). Using
 *     the same statistic means our alerts agree with what shows
 *     up in CrUX / PSI weeks later.
 *
 * Configuration via Firebase Params API (the migration path away
 * from the deprecated functions.config()):
 *
 *   firebase functions:secrets:set SLACK_WEBHOOK_URL
 *
 * No webhook configured ⇒ the function returns silently. This means
 * the code-side ships safely; turning alerting on is a single
 * `firebase functions:secrets:set` away.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import * as admin from './lib/admin';

// Defer Firestore init — index.ts initializes the default app first.
function db() {
  return admin.firestore();
}

// Thresholds — the 0-12.md spec calls out P75 INP > 250ms.
// LCP threshold included because the same alert path is the right
// place to put both vitals; cost is identical.
//
// Phase 8.7.2 improvement: long-task volume threshold. The client-side
// long-task observer reports each sync task >50ms as a separate beacon.
// More than ~20 long tasks per minute in production aggregate suggests
// a regression (typical baseline is 1-5/min/session at low traffic).
const THRESHOLDS = {
  INP: 250, // ms — Google's "good" boundary is 200; 250 is "we just shipped a regression"
  LCP: 2500, // ms — Google's "good" boundary is 2500; matches lighthouserc gate
  LONGTASK_PER_MINUTE: 20, // count — leading indicator for INP regressions before the user-facing INP gate trips
} as const;

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  fields?: Array<{ type: string; text: string }>;
}

async function postToSlack(
  webhook: string,
  payload: { blocks: SlackBlock[]; text: string },
): Promise<void> {
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Slack webhook returned ${res.status}: ${body.slice(0, 200)}`);
  }
}

export const rumAlertHourly = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every 1 hours',
    timeZone: 'America/Vancouver',
    timeoutSeconds: 120,
    memory: '256MiB',
    // No secret binding here: if SLACK_WEBHOOK_URL is absent, the
    // function simply logs and exits. This keeps deploys unblocked on
    // projects that don't want to pay for Secret Manager yet.
  },
  async () => {
    const webhook = process.env.SLACK_WEBHOOK_URL?.trim();
    if (!webhook) {
      // No webhook configured — this is the safe default for a fresh
      // deploy. Operators can set SLACK_WEBHOOK_URL as an env var to opt
      // in. Returning silently keeps the function shippable before the
      // operator setup pass.
      logger.info('[rumAlertHourly] SLACK_WEBHOOK_URL not set; skipping');
      return;
    }

    const since = admin.firestore.Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);

    // Read INP + LCP + LONGTASK samples from the last hour. One query each
    // (Firestore composite index assumed for `name` + `ts`).
    const [inpSnap, lcpSnap, ltSnap] = await Promise.all([
      db().collection('rum').where('name', '==', 'INP').where('ts', '>=', since).limit(2000).get(),
      db().collection('rum').where('name', '==', 'LCP').where('ts', '>=', since).limit(2000).get(),
      // Long tasks are higher-volume; bump the limit. At MAX_REPORTED=50
      // per session client-side and ~hundreds of concurrent sessions,
      // 5000 covers a healthy hour without truncation.
      db()
        .collection('rum')
        .where('name', '==', 'LONGTASK')
        .where('ts', '>=', since)
        .limit(5000)
        .get(),
    ]);

    const inpValues = inpSnap.docs
      .map((d) => d.data().value as number)
      .filter((v) => typeof v === 'number');
    const lcpValues = lcpSnap.docs
      .map((d) => d.data().value as number)
      .filter((v) => typeof v === 'number');
    const ltCount = ltSnap.size;
    const ltPerMin = ltCount / 60;

    const inpP75 = percentile(inpValues, 75);
    const lcpP75 = percentile(lcpValues, 75);

    // Below the "interesting sample count" threshold the percentile
    // is noise. 30 is a common floor for "this means something."
    const MIN_SAMPLES = 30;
    const inpReportable = inpValues.length >= MIN_SAMPLES;
    const lcpReportable = lcpValues.length >= MIN_SAMPLES;

    const breaches: string[] = [];
    if (inpReportable && inpP75 !== null && inpP75 > THRESHOLDS.INP) {
      breaches.push(
        `*INP P75:* ${inpP75.toFixed(0)} ms  (threshold ${THRESHOLDS.INP} ms) · ${inpValues.length} samples`,
      );
    }
    if (lcpReportable && lcpP75 !== null && lcpP75 > THRESHOLDS.LCP) {
      breaches.push(
        `*LCP P75:* ${lcpP75.toFixed(0)} ms  (threshold ${THRESHOLDS.LCP} ms) · ${lcpValues.length} samples`,
      );
    }
    // Long-task volume — leading indicator. Even when INP P75 hasn't
    // yet crossed the user-perceived threshold, a long-task volume
    // spike means we shipped sync work that *will* cause INP regression
    // once enough users hit it. Catching this hour-zero is the value.
    if (ltCount > 0 && ltPerMin > THRESHOLDS.LONGTASK_PER_MINUTE) {
      breaches.push(
        `*Long tasks:* ${ltPerMin.toFixed(1)}/min (threshold ${THRESHOLDS.LONGTASK_PER_MINUTE}/min) · ${ltCount} total — leading indicator for INP regression`,
      );
    }

    if (breaches.length === 0) {
      logger.info('[rumAlertHourly] all vitals within thresholds', {
        inpP75,
        lcpP75,
        inpSamples: inpValues.length,
        lcpSamples: lcpValues.length,
        longTasks: ltCount,
        longTasksPerMin: ltPerMin,
      });
      return;
    }

    // Post to Slack. Markdown formatting; mrkdwn is on by default
    // in incoming webhooks.
    const text = `:warning: RUM threshold breach — ${breaches.join(', ')}`;
    try {
      await postToSlack(webhook, {
        text,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: 'RUM threshold breach' },
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: breaches.join('\n') },
          },
          {
            type: 'context',
            fields: [
              {
                type: 'mrkdwn',
                text: `Window: last 60 min · Samples: ${inpValues.length} INP · ${lcpValues.length} LCP`,
              },
              {
                type: 'mrkdwn',
                text: 'Next steps: check the recently-deployed PRs, then `firebase functions:log --only recordRum` for context.',
              },
            ],
          },
        ],
      });
      logger.info('[rumAlertHourly] alert posted to Slack', { breaches: breaches.length });
    } catch (err) {
      logger.error('[rumAlertHourly] Slack post failed', err);
      // Don't re-throw — the function shouldn't be marked failed just
      // because Slack is down. Logging is enough to surface the issue.
    }
  },
);
