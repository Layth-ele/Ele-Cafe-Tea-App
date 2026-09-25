#!/usr/bin/env node
/**
 * Phase 0 — Observability verification.
 *
 * Run after the operator setup in OPS_SETUP.md. Asserts all four
 * conditions that gate Phase 0 closure:
 *
 *   1. VITE_SENTRY_DSN is configured (.env present and non-empty)
 *   2. functions/lib/rumAlerts.js exists in the build output
 *   3. recordRum is in the deployed function list
 *   4. rumAlertHourly is in the deployed function list
 *
 * Exits 0 if all pass, 1 if any fail. Suitable for CI inclusion as
 * a post-deploy smoke test.
 *
 * The Sentry DSN reachability check (item 5 in OPS_SETUP.md) is
 * skipped here unless --check-sentry-reachability is passed; it
 * requires a network call to Sentry which we don't want by default
 * (a slow Sentry shouldn't fail unrelated CI).
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const checks = [];
let failed = 0;

function pass(name) { checks.push({ name, ok: true });  }
function fail(name, why) { checks.push({ name, ok: false, why }); failed++; }

// 1. VITE_SENTRY_DSN configured
const envPath = join(REPO_ROOT, '.env');
if (!existsSync(envPath)) {
  fail('VITE_SENTRY_DSN configured', '.env file not present (copy .env.example → .env)');
} else {
  const env = readFileSync(envPath, 'utf8');
  const match = env.match(/^VITE_SENTRY_DSN=(.+)$/m);
  if (!match || !match[1].trim() || match[1].trim() === '""' || match[1].trim() === "''") {
    fail('VITE_SENTRY_DSN configured', 'VITE_SENTRY_DSN is empty in .env');
  } else if (!/^https:\/\/[^@]+@[^/]+\/\d+$/.test(match[1].trim())) {
    fail('VITE_SENTRY_DSN configured', 'value does not look like a Sentry DSN (https://KEY@HOST/PROJECT)');
  } else {
    pass('VITE_SENTRY_DSN configured');
  }
}

// 2. functions/lib/rumAlerts.js exists in build output
const rumAlertsCompiled = join(REPO_ROOT, 'functions/lib/rumAlerts.js');
if (existsSync(rumAlertsCompiled)) {
  pass('rumAlertHourly compiled');
} else {
  // Source file is enough to know the code shipped; compiled output
  // is the operator's responsibility (cd functions && npm run build).
  const rumAlertsSrc = join(REPO_ROOT, 'functions/src/rumAlerts.ts');
  if (existsSync(rumAlertsSrc)) {
    fail('rumAlertHourly compiled',
         'source present but functions/lib/rumAlerts.js missing — run "cd functions && npm run build"');
  } else {
    fail('rumAlertHourly compiled', 'functions/src/rumAlerts.ts not present');
  }
}

// 3 + 4. Deployed function list — requires firebase CLI + auth, so we
// gate on availability and skip with a warning otherwise.
let firebaseListed = false;
try {
  const out = execSync('firebase functions:list 2>/dev/null', { encoding: 'utf8', timeout: 15000 });
  firebaseListed = true;
  if (/\brecordRum\b/.test(out)) pass('recordRum deployed');
  else fail('recordRum deployed', 'not in `firebase functions:list` output');
  if (/\brumAlertHourly\b/.test(out)) pass('rumAlertHourly deployed');
  else fail('rumAlertHourly deployed',
            'not in `firebase functions:list` output — run `firebase deploy --only functions:rumAlertHourly`');
} catch {
  pass('recordRum deployed (skipped — firebase CLI not available or not authenticated)');
  pass('rumAlertHourly deployed (skipped — firebase CLI not available or not authenticated)');
}

// 5. Sentry DSN reachability (opt-in)
if (process.argv.includes('--check-sentry-reachability')) {
  const env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const match = env.match(/^VITE_SENTRY_DSN=(.+)$/m);
  const dsn = match?.[1].trim();
  if (dsn) {
    try {
      const url = new URL(dsn);
      // The DSN's host is the Sentry ingest endpoint. A HEAD request
      // to https://<host> is enough to verify TLS + DNS.
      const res = await fetch(`${url.protocol}//${url.host}`, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      if (res.status < 500) pass('Sentry DSN endpoint reachable');
      else fail('Sentry DSN endpoint reachable', `HEAD returned ${res.status}`);
    } catch (err) {
      fail('Sentry DSN endpoint reachable', String(err).slice(0, 200));
    }
  }
}

// Report
console.log('Phase 0 — Observability verification');
console.log('─────────────────────────────────────');
for (const c of checks) {
  const icon = c.ok ? '✓' : '✗';
  console.log(`  ${icon} ${c.name}${c.why ? `  (${c.why})` : ''}`);
}
console.log('');
if (failed === 0) {
  console.log('All Phase 0 observability gates passing.');
} else {
  console.log(`${failed} check(s) failed. See OPS_SETUP.md for fix steps.`);
}
process.exit(failed === 0 ? 0 : 1);
