# Operator Setup — Phase 0 Closure

Date: 2026-05-11
Time required: ~15 minutes of clicking + 2 commands.

This playbook closes the two operator-config tasks blocking Phase 0 from 100%:

1. **0.7.3** — wire Sentry DSN so client errors flow to the dashboard
2. **0.7.2** — wire Slack webhook so the hourly RUM alert can post on regression

The code side is fully in this zip: `src/lib/sentry.ts` calls `Sentry.init` when the DSN is set, and `functions/src/rumAlerts.ts` exports a scheduled `rumAlertHourly` function that runs every hour and posts to Slack on threshold breach. **You're plugging two strings into two env settings.**

---

## Part 1 — Sentry (5 minutes)

### Create the Sentry project

1. Open https://sentry.io (free tier covers 5K events/month — well within scope for current traffic)
2. Sign in or create an account
3. Create new project → "React" platform → name `ele-cafe-web`
4. Sentry shows the DSN — looks like `https://<key>@o<org>.ingest.sentry.io/<proj>`

### Set the DSN in your build environment

Pick the path that matches your deploy:

**If deploying from your local machine** (`firebase deploy --only hosting`):

```bash
echo "VITE_SENTRY_DSN=https://...your-dsn..." >> .env
pnpm build
firebase deploy --only hosting
```

**If deploying from CI** (GitHub Actions etc.): add `VITE_SENTRY_DSN` to your build secrets. Vite picks it up at build time, bakes it into the bundle.

### Verify it works (30 seconds)

After deploy:

1. Visit https://ele-cafe-d7237.web.app
2. Open Sentry → Issues tab → filter "Environment: production"
3. You should see a transaction event within 30 seconds of page load (Sentry's auto-instrumented "pageload" transaction). If not, the DSN is wrong.

If the DSN was missing on a production build, the browser console will show:

> `[sentry] VITE_SENTRY_DSN not set on a production build. Errors will NOT be captured.`

That console line is your tripwire — it shouldn't appear in production after this setup.

---

## Part 2 — Slack RUM Alert (10 minutes)

### Create the Slack incoming webhook

1. Go to your Slack workspace → search "Incoming Webhooks" in the App Directory
2. Click "Add to Slack"
3. Choose the channel that should receive perf alerts (`#engineering` or `#alerts` or whatever you use)
4. Click "Add Incoming Webhooks integration"
5. Copy the **Webhook URL** Slack shows — looks like `https://hooks.slack.com/services/T.../B.../...`

### Register the webhook as a Firebase secret

Open a terminal in the repo root:

```bash
# Set the secret. Firebase prompts for the value; paste the webhook URL.
firebase functions:secrets:set SLACK_WEBHOOK_URL

# Deploy the new function (this is the first time rumAlertHourly will exist
# in the deployed environment).
firebase deploy --only functions:rumAlertHourly
```

### Verify it works

The function runs every hour at the top of the hour (Vancouver time). Force a run for verification:

```bash
# Manual invoke for verification — Firebase Functions v2 doesn't have a
# direct "run scheduled function now" but you can call the function via
# gcloud:
gcloud scheduler jobs run firebase-schedule-rumAlertHourly-us-central1 \
  --location=us-central1 \
  --project=ele-cafe-d7237
```

If a P75 INP or LCP breach exists in the last hour, Slack receives a formatted message in the channel. If not, the function exits silently — verify the run via `firebase functions:log --only rumAlertHourly` (you'll see either "all vitals within thresholds" or "alert posted to Slack").

### Tune the thresholds (optional)

Edit `functions/src/rumAlerts.ts`:

```typescript
const THRESHOLDS = {
  INP: 250,   // ms
  LCP: 2500,  // ms
};
```

After deploying, the new values take effect on the next hourly run.

---

## Part 3 — Verify everything (5 minutes)

Run the all-green check from the repo root:

```bash
node scripts/verify-observability.mjs
```

This script:

1. Checks `.env` has `VITE_SENTRY_DSN` set (warns if not)
2. Verifies `functions/lib/rumAlerts.js` exists in the build output (proves the function was compiled)
3. Reads the deployed function list and confirms `recordRum` and `rumAlertHourly` are present
4. Pings Sentry's DSN endpoint to verify the project accepts events (HEAD request; no actual event sent)

Output:

```
✓ VITE_SENTRY_DSN configured
✓ rumAlertHourly compiled
✓ recordRum deployed
✓ rumAlertHourly deployed
✓ Sentry DSN endpoint reachable

All Phase 0 observability gates passing.
```

If anything fails, the script tells you which step in this playbook to revisit.

---

## What this closes

| Phase | Gate | Before | After |
|---|---|---|---|
| 0.7.2 | Slack alert P75 INP > 250ms | code-side absent | scheduled function deployed, alerts on breach |
| 0.7.3 | Sentry errors within 30 s | DSN env var unset | DSN configured, prod-build guard prints warning if missing |

After running this playbook end-to-end (~15 min), **Phase 0 reads 100%.**

---

## Re-runs

Re-run this playbook only if you:

- Switch Sentry organizations or projects (new DSN)
- Rotate the Slack webhook (new webhook URL — old one keeps working until you delete it)
- Move regions or project IDs (function re-deploy needed)

Otherwise, set-and-forget.
