# Deploy Guide — Ele Café

## Quick reference (the right order)

```bash
# 1. Wipe any stale build artefacts and dependencies
rm -rf node_modules dist functions/node_modules functions/lib

# 2. Install client deps (root package.json)
npm install

# 3. Install Cloud Function deps (functions/package.json) — REQUIRED separately!
cd functions && npm install && cd ..

# 4. Build the functions (TypeScript → lib/)
cd functions && npm run build && cd ..

# 5. Build the client (Vite → dist/)
npm run build

# 6. Deploy everything
firebase deploy --project ele-cafe-d7237
```

---

## Why the functions install is separate

This repo has **two `package.json` files**:

- `package.json` at the root — the React/Vite client app
- `functions/package.json` — the Cloud Functions (separate Node project)

Running `npm install` at the root only installs the client deps. The
functions need their own install. If you skip step 3, `npm run build`
inside `functions/` fails with:

```
error TS2307: Cannot find module 'firebase-functions/v2'
error TS2307: Cannot find module 'firebase-admin'
... 28 errors
```

Those errors mean the TypeScript compiler can't see the imports
because `functions/node_modules` doesn't exist yet. They are NOT code
bugs — they're the install gotcha.

**`firebase deploy` with this repo first runs the functions build
internally. So if functions/node_modules is missing, the deploy
itself fails before any code reaches Firebase.** Run step 3 once
after each fresh clone or after pulling changes that bumped
`functions/package.json` versions.

---

## Common build-time errors and fixes

### "Could not resolve '../lib/theme' from 'src/contexts/ThemeContext.tsx'"

**Cause:** stale `ThemeContext.tsx` from an older version is still in
your working tree. The current code removed that file (the Zustand
`themeStore.ts` replaced it; `main.tsx` now calls `initTheme()`
directly).

**Fix:** unzip the new release into a clean folder, do NOT overlay
on top of the old folder. Or:

```bash
# Remove the vestigial file if it's hanging around
rm -f src/contexts/ThemeContext.tsx

# Make sure main.tsx doesn't reference it any more
grep -n ThemeContext src/main.tsx   # should return nothing

# Rebuild
rm -rf node_modules dist
npm install
npm run build
```

### "Build aborted — missing required Firebase env vars"

**Cause:** no `.env` file at the project root, or the file is missing
one of the four required keys.

**Fix:** create `.env` (NOT `.env.local`, which is gitignored — you
want the deploy build to read these) with:

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=ele-cafe-d7237.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ele-cafe-d7237
VITE_FIREBASE_APP_ID=1:000...:web:...
VITE_FIREBASE_STORAGE_BUCKET=ele-cafe-d7237.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=000...
```

Get these values from Firebase Console → Project Settings → Your
Apps → Web app → SDK setup → Config.

### "PWA glob doesn't match any files" warning

**Harmless** when it appears alongside a successful build. Means
some of the admin-chunk-exclusion patterns didn't match anything to
exclude (because no admin chunk had that exact name suffix in this
build). The build still works correctly.

### Functions deploy: "DEPRECATION NOTICE: functions.config()"

**Harmless until March 2027.** Firebase is migrating from the
`functions.config()` API to the `params` package. Your current code
uses `functions.config()` for reCAPTCHA secrets etc. — works fine
through 2026. Plan to migrate before March 2027:

```bash
firebase functions:config:export
```

That generates a `.env` file equivalent for the functions. Then
update `functions/src/index.ts` to read from `process.env.X` or the
`defineSecret` API. Not urgent.

---

## What deploy --only flags do

```bash
# Just the rules (fastest — ~10 sec, useful when you only changed firestore.rules):
firebase deploy --only firestore:rules

# Just the indexes:
firebase deploy --only firestore:indexes

# Just the storage rules:
firebase deploy --only storage

# Just the client (skip functions — saves ~3 min if functions unchanged):
firebase deploy --only hosting

# Just the functions:
firebase deploy --only functions

# Full deploy (everything):
firebase deploy
```

For most code-only changes you only need `--only hosting`. Rules
changes need `--only firestore:rules`. Functions changes need
`--only functions`.

---

## Order of operations for a typical fix

When deploying a code change that touches all layers:

1. **Rules first** (`firebase deploy --only firestore:rules`).
   Why first: if your client expects new field shapes that older
   rules reject, deploying client first creates a window where users
   hit `permission-denied`.

2. **Functions second** (`firebase deploy --only functions`).
   Why second: client changes that depend on a new CF behaviour
   should never deploy before the CF that supports them.

3. **Client third** (`firebase deploy --only hosting`).
   Last because the client is the user-visible layer; once users
   start running the new client, the rules and functions it needs
   must already be live.

If you deploy everything together with plain `firebase deploy`,
Firebase actually applies them in this same order internally — but
manual three-stage deploys give you a chance to roll back any one
layer if it surfaces an issue.

---

## Verifying a successful deploy

After `firebase deploy` completes:

```bash
# Hosting — public URL should serve the new bundle:
curl -s https://ele-cafe-d7237.web.app/ | grep '<title>'

# Functions — list deployed functions:
firebase functions:list --project ele-cafe-d7237

# Rules — confirm latest version is live:
firebase firestore:rules:list --project ele-cafe-d7237 | head
```

Open https://ele-cafe-d7237.web.app/ in an **incognito window**
(forces fresh service worker fetch) and verify a basic flow works:
home page loads, sign-in works, cart functions, etc.

If something breaks after deploy, you can roll back hosting:

```bash
firebase hosting:rollback --project ele-cafe-d7237
```

That reverts to the previous deploy in ~30 seconds.
