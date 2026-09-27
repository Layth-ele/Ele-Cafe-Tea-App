/**
 * watchdog.ts — hourly "is the shop working?" check (run by marketingTick,
 * so it adds no scheduler job).
 *
 * Checks what customers and Google actually hit: the home page, the tea
 * list, a live tea page (with its embedded data), the sitemap, the app's
 * JavaScript, and that checkout / order approval are reachable (a 403 there
 * means the Cloud Run invoker permission is gone — it silently broke
 * "Approve & Charge" once). A failing check is retried once; if it still
 * fails the store email gets one alert, and one "resolved" email when it
 * recovers. State lives in /ops/watchdog (server-only).
 */
import * as admin from './lib/admin';

const SITE = 'https://elecafe.ca';
const FROM = 'Ele Café Monitor <news@elecafe.ca>';
const db = () => admin.firestore();

type Check = { name: string; run: () => Promise<string | null> };

async function get(path: string): Promise<{ status: number; body: string }> {
  const sep = path.includes('?') ? '&' : '?';
  // Cache-buster: test the live server, not the CDN's copy.
  const res = await fetch(`${SITE}${path}${sep}wd=${Date.now()}`, {
    signal: AbortSignal.timeout(20_000),
    headers: { 'User-Agent': 'EleCafeWatchdog/1.0' },
  });
  return { status: res.status, body: await res.text() };
}

function expectPage(path: string, marker: string, what: string): () => Promise<string | null> {
  return async () => {
    const { status, body } = await get(path);
    if (status !== 200) return `${path} returned HTTP ${status}`;
    if (!body.includes(marker)) return `${path} loaded but is missing ${what}`;
    return null;
  };
}

function checks(teaPath: string | null): Check[] {
  const project = process.env.GCLOUD_PROJECT || 'ele-cafe-d7237';
  const callable = (name: string): Check => ({
    name: `${name} reachable`,
    run: async () => {
      const res = await fetch(`https://us-central1-${project}.cloudfunctions.net/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"data":{}}',
        signal: AbortSignal.timeout(20_000),
      });
      // 401/400 = reached the function (it rejected the empty test call).
      if (res.status === 403)
        return `${name} is blocked by Google Cloud (HTTP 403 — the public invoker permission is missing)`;
      if (res.status === 404 || res.status >= 500) return `${name} returned HTTP ${res.status}`;
      return null;
    },
  });
  return [
    { name: 'Home page', run: expectPage('/', '<section class="hero">', 'the hero') },
    { name: 'Tea list', run: expectPage('/products', 'seo-fallback', 'the tea list') },
    ...(teaPath
      ? [
          { name: 'Tea page', run: expectPage(teaPath, 'ele-ssr-tea', 'the tea data') },
          {
            // Google ignores structured data it can't parse (a "$1…" in a
            // price once corrupted every product block).
            name: 'Product data (JSON-LD)',
            run: async () => {
              const { status, body } = await get(teaPath);
              if (status !== 200) return `${teaPath} returned HTTP ${status}`;
              const blocks = [
                ...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
              ];
              if (!blocks.some((b) => b[1].includes('"Product"')))
                return `${teaPath} has no Product data`;
              for (const b of blocks) {
                try {
                  JSON.parse(b[1]);
                } catch {
                  return `${teaPath} has structured data Google can't read (invalid JSON-LD)`;
                }
              }
              return null;
            },
          },
        ]
      : []),
    { name: 'Sitemap', run: expectPage('/sitemap.xml', '<urlset', 'the URL list') },
    {
      name: 'App files',
      run: async () => {
        const { status, body } = await get('/app.html');
        if (status !== 200) return `/app.html returned HTTP ${status}`;
        const js = body.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
        if (!js) return 'the app shell has no main script';
        const r = await fetch(`${SITE}${js}`, { signal: AbortSignal.timeout(20_000) });
        return r.ok ? null : `the app's main script ${js} returned HTTP ${r.status}`;
      },
    },
    callable('placeOrder'),
    callable('approveOrder'),
  ];
}

async function runOnce(c: Check): Promise<string | null> {
  try {
    return await c.run();
  } catch (err) {
    return `${c.name} failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function alertEmail(to: string, subject: string, lines: string[]): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#0f1c26">
<p>${lines.map((l) => l.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] as string)).join('<br>')}</p>
<p style="color:#686360;font-size:13px">Checked automatically every hour · ${SITE}</p></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  }).catch((err: unknown) => err as Error);
  if (res instanceof Error || !res.ok) console.error('[watchdog] alert email failed', res);
}

export async function runWatchdog(): Promise<void> {
  const settings = (await db().doc('settings/global').get()).data() ?? {};
  const to =
    typeof settings.email === 'string' && settings.email.includes('@')
      ? settings.email
      : 'info@elecafe.ca';

  // A real, active tea to test the product page with.
  let teaPath: string | null = null;
  const t = await db().collection('teas').where('isActive', '==', true).limit(1).get();
  if (!t.empty) {
    const d = t.docs[0].data();
    if (d.category && d.slug) teaPath = `/tea-profile/${d.category}/${d.slug}`;
  }

  const failures: Record<string, string> = {};
  for (const c of checks(teaPath)) {
    let err = await runOnce(c);
    if (err) {
      await new Promise((r) => setTimeout(r, 30_000)); // one retry: skip blips
      err = await runOnce(c);
    }
    if (err) failures[c.name] = err;
  }

  const ref = db().doc('ops/watchdog');
  const prev = ((await ref.get()).data()?.failing ?? {}) as Record<string, number>;
  const now = Date.now();
  const failing: Record<string, number> = {};
  for (const name of Object.keys(failures)) failing[name] = prev[name] ?? now;

  const fresh = Object.keys(failures).filter((n) => !(n in prev));
  const fixed = Object.keys(prev).filter((n) => !(n in failures));
  if (fresh.length) {
    await alertEmail(to, `⚠️ Ele Café website problem: ${fresh.join(', ')}`, [
      'The hourly website check found a problem:',
      '',
      ...fresh.map((n) => `• ${failures[n]}`),
      '',
      'You will get one more email when it works again.',
    ]);
  }
  if (fixed.length) {
    await alertEmail(to, `✅ Ele Café website OK again: ${fixed.join(', ')}`, [
      'Resolved — these checks pass again:',
      ...fixed.map((n) => `• ${n} (was failing since ${new Date(prev[n]).toUTCString()})`),
    ]);
  }
  await ref.set({ failing, checkedAt: now, lastErrors: failures });
  if (Object.keys(failures).length) console.warn('[watchdog] failing:', failures);
  else console.log('[watchdog] all checks passed');
}
