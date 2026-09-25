# App Check Setup Guide

## Why this matters

Firebase Console showed App Check metrics with **0% verified requests**:

- Storage: 0 / 187 verified
- Firestore: 0 / 44,000 verified
- Authentication: 7 / 708 verified (1%)

The cause was simple: App Check was never initialized in the client code.
Firebase Console was reporting "0 verified" because the client never sent
a single App Check token. The "reCAPTCHA" already in the codebase
(`useRecaptcha.ts`) is for one-shot action verification on signup — a
different mechanism from App Check.

This guide covers the fix. After completing all steps, your App Check
metrics should climb toward 100% within a few hours, and you'll be safe
to click **Enforce** to start rejecting requests from anywhere except
your real production domain.

---

## What's already done (in this code drop)

The client side is fully wired up. `src/lib/firebase.ts` now:

1. Imports `initializeAppCheck` and `ReCaptchaV3Provider` from `firebase/app-check`
2. Initializes App Check **synchronously** between `initializeApp` and
   `initializeFirestore` — every Firebase SDK call after that point
   automatically attaches an App Check token
3. Auto-refreshes tokens before they expire (default token lifetime 60min)
4. Reads the site key from `VITE_FIREBASE_APP_CHECK_KEY`
5. In dev mode, enables Firebase's debug-token provider so localhost works
6. In production with the key missing, logs a clear warning so you notice

What you have to do (this guide): four manual steps in the Firebase Console
plus adding one env var. No code changes.

---

## Step 1 — Register your web app with App Check (Firebase Console)

1. Open https://console.firebase.google.com → **ele-cafe-d7237** project
2. Left sidebar → **Build** → **App Check**
3. **Apps** tab
4. Find your **web app** in the list (the one with your hostname).
   Click the **⋮** (three dots) → **Register**
5. A modal opens with provider options. Choose **reCAPTCHA v3**
6. The modal asks for the reCAPTCHA v3 site key. You have two paths:

   ### Path A — Reuse the existing reCAPTCHA v3 key (recommended)

   You already have `VITE_RECAPTCHA_SITE_KEY` set up for signup-form
   action verification. The same key works for App Check.

   - In Firebase Console's modal, paste your existing
     `VITE_RECAPTCHA_SITE_KEY` value
   - Click **Save**

   ### Path B — Register a new key

   - Click the link in the modal that says "Create one in the reCAPTCHA admin console"
   - You'll go to https://www.google.com/recaptcha/admin/create
   - Label: `Ele Café App Check`
   - Type: **Score-based (v3)** (NOT "Challenge (v2)")
   - Domains: add `elecafe.ca`, `www.elecafe.ca`, and any other domains
     where the site is hosted (e.g. `ele-cafe-d7237.web.app`)
   - Submit
   - Google gives you a **Site key** and a **Secret key**
   - Copy the **Site key** (the long public one)
   - Paste into Firebase Console's modal
   - Click **Save**

7. Back in the App Check Apps tab, your web app should now show
   **reCAPTCHA v3** as its provider. The status reads "Registered".

---

## Step 2 — Add the env var to your local `.env`

```bash
cd /Users/laythalshblawi/Documents/new/app
echo "VITE_FIREBASE_APP_CHECK_KEY=<paste-the-site-key-here>" >> .env.local
```

Confirm:

```bash
grep APP_CHECK .env.local
# should print: VITE_FIREBASE_APP_CHECK_KEY=6Lc...
```

---

## Step 3 — Add the env var to your deploy environment

Where you set this depends on how you deploy:

### Firebase Hosting (most likely your setup)

Firebase Hosting reads env vars from `.env.production` at build time.
Vite picks them up automatically:

```bash
cd /Users/laythalshblawi/Documents/new/app
echo "VITE_FIREBASE_APP_CHECK_KEY=<same-site-key>" >> .env.production
```

`.env.production` should NOT be committed to git if your repo is public —
add it to `.gitignore` if it isn't already. (It's a public site key so
not a security risk if leaked, but cleaner to keep config separate.)

### CI / hosting platform with secrets (Vercel, Netlify, etc.)

Add `VITE_FIREBASE_APP_CHECK_KEY` to the platform's environment variable
section. The build picks it up via `import.meta.env`.

---

## Step 4 — Deploy

```bash
firebase deploy
```

Open your live site and check the browser console. You should see:

```
[firebase] App Check initialized with reCAPTCHA v3 provider
```

If you see this instead, something's wrong:

```
[firebase] VITE_FIREBASE_APP_CHECK_KEY is not set...
```

→ The env var didn't make it into the build. Check your `.env.production`
or hosting environment variables.

```
[firebase] App Check init failed — ... Cause: ...
```

→ The site key is invalid or the domain isn't registered with reCAPTCHA.
Verify the domain list at https://www.google.com/recaptcha/admin and
make sure your live hostname is in the allowed-domains list.

---

## Step 5 — Wait, then verify

Open Firebase Console → **App Check** → click any of the four tabs
(Firestore, Authentication, Storage, Functions). Watch the
"Verified requests" line.

It will climb toward 100% as visitors load the site over the next few
hours. You're looking for:

- **Verified**: 95%+ (the 5% leeway covers bots, very old browsers,
  and people with reCAPTCHA blocked by an extension)
- **Outdated client**: <5%
- **Unknown origin**: <1%

**Don't click Enforce yet.** Watch for a day or two first to confirm
real users aren't getting blocked. If you see Verified at 99%+ and the
remaining 1% looks like bot/scraper traffic, you're safe to enforce.

---

## Step 6 — Set up the dev-mode debug token

This is a one-time setup so localhost works after enforcement is on.

1. Run `npm run dev` and open http://localhost:5173
2. Open browser DevTools → Console
3. Look for a message like:

   ```
   App Check debug token: 12345678-1234-1234-1234-123456789012
   Add it in the Firebase console to use it for testing.
   ```

4. Copy that token (the GUID-looking thing after "App Check debug token:")
5. Firebase Console → **Build** → **App Check** → **Apps** tab → find
   your web app → click the **⋮** menu → **Manage debug tokens**
6. Click **Add debug token**
7. Name: `Layth's MacBook` (or whatever — purely for your reference)
8. Token: paste the GUID you copied
9. **Save**

After this, every dev session on your laptop attaches the debug token
and passes App Check enforcement. The token is stable across sessions
(Firebase stores it in `IndexedDB`), so you only do this once per
machine.

If you ever clear browser data and the token regenerates, just repeat
the steps above with the new token.

---

## Step 7 — Enforce (eventually)

Once your verified rate is consistently 95%+ for at least 24 hours,
turn on enforcement to start actually rejecting unverified traffic.

For each of these four tabs in **App Check**:

- **Firestore** → click **Enforce** → confirm
- **Authentication** → click **Enforce** → confirm
- **Storage** → click **Enforce** → confirm
- **Cloud Functions** → click **Enforce** → confirm

Enforcement is per-service. You can enforce just Firestore first if
you want a smaller blast radius, then add the others one at a time
over a week.

After enforcement is on:

- Real users with reCAPTCHA-disabling extensions will see the site
  fail to load data. There's no perfect fix for this — App Check is
  inherently incompatible with extensions that block reCAPTCHA. You
  can leave it unenforced if you have a customer base that uses
  privacy extensions heavily, or accept the trade-off.
- Bots, scrapers, and anyone running a script against your Firebase
  project will be rejected. This is the whole point.

---

## What App Check protects against (and what it doesn't)

**Protects against:**

- Someone running a script against your Firebase project from their
  laptop — they don't have a valid App Check token, all requests bounce
- Someone embedding your Firebase config in their own malicious site
  to abuse your quota / Firestore — their domain isn't registered with
  reCAPTCHA, so they can't generate a valid token
- Mass automated scraping via your project's REST endpoints
- Random traffic from competitors trying to inflate your bills

**Does NOT protect against:**

- A logged-in user abusing their own permissions — that's what
  Firestore Security Rules are for
- Someone sniffing a token from your real site and replaying it —
  tokens are short-lived (60min) and tied to the requesting domain,
  but it's theoretically possible. Defence in depth = rules + App Check
- Compromise of your Firebase project itself (admin SDK, service
  accounts) — that's a different threat class

App Check is one layer in a defence-in-depth strategy. It does NOT
replace Firestore Security Rules — those still need to be locked down
correctly. App Check just adds a "are you who you say you are" check
on top of the rules.

---

## Troubleshooting

**Q: I see `App Check: ReCAPTCHA error: Could not verify the user. Try again later.`**

The reCAPTCHA service couldn't verify the request. Most common causes:

- The user's network blocked Google's reCAPTCHA loader (corporate
  firewall, ad blocker)
- The domain making the request isn't in the reCAPTCHA admin console's
  allowed-domains list
- A reCAPTCHA-blocking browser extension is active

**Q: I see `AppCheck: Requests from referer https://example.com are blocked.`**

The site key was registered for a different domain. Either add this
domain to the reCAPTCHA key's allowed domains, or use a different site
key registered for this domain.

**Q: My dev token regenerates every time I open the browser**

Make sure you're using the same browser profile. The debug token is
stored in IndexedDB, which is isolated per profile. Incognito / private
windows generate new tokens every session.

**Q: Enforcement on, and now my hosting preview channels are blocked**

Firebase hosting preview channels use random subdomains
(`elecafe-d7237--preview-abc123.web.app`). reCAPTCHA can't issue
tokens for randomly-generated domains. Two options:

1. Don't enforce App Check on preview channels — keep them in
   monitor mode while production is enforced
2. Use a wildcard like `*.web.app` in the reCAPTCHA admin console
   (less secure, broader allowance)

**Q: My App Check chunk is in `firebase-core-*.js` instead of its own chunk**

That's intentional — App Check is initialized synchronously at app
boot, so it can't be lazy-loaded. Bundling it with `firebase/app`
(both eager) keeps the module graph clean.
