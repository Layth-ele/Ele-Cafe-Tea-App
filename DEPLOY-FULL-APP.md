# Ele Café — Full App, Ready to Deploy (FINAL)

This is the complete end-to-end app with EVERY patch applied
through the entire session — Rounds 1 through 7, the timezone test
fix, and everything in between.

## What's in here

| Layer | Includes |
|---|---|
| **Round 1-3 audits** | Test fixes, lazy loading, Lighthouse fixes, modal infrastructure (focus trap, ESC stack, dvh, mobile bottom-sheet), z-index tokens, breakpoint tokens, iOS polish, page wrapper migrations |
| **Round 4 — Path B auth emails** | functions/src/authEmails.ts with branded verify/reset/email-change emails through Resend |
| **Round 5 — Modal password reset UX** | "Check your inbox" / "No account found" modals with signup pre-fill |
| **Round 6 — Firestore rules audit** | Tightened /users.create, /carts.write, /gifts.create, /teas/{id}/reviews.create allowlists |
| **Email logo migration** | brandedHeader() reads emailLogoUrl (Hosting-served) instead of Storage URLs |
| **PWA + favicon polish** | favicon.ico, favicon.svg, apple-touch-icon.png, icon-192/512, og-default.png, full manifest.webmanifest |
| **Performance fixes** | Footer logo width/height (CLS), outer hero container fade-up removed (LCP), inner h1 fade-up removed (LCP), font-fallback metric tuning (CLS) |
| **Round 7 — App Check Functions enforcement** | enforceAppCheck:true on all 7 callables (placeOrder, verifyRecaptcha, setAdminRole, emailHealthCheck, sendBrandedVerifyEmail, sendBrandedPasswordReset, sendBrandedEmailChange) |
| **Timezone test fix** | localDate() helper — 142/142 tests pass on Vancouver-time machines |
| **index.html updates** | apple-touch-icon → PNG, og:image → PNG with width/height meta, favicon.ico fallback added, font-fallback metric tuning |
| **Your real email logo** | public/email-assets/logo.png (50KB RGBA, 371×400) |

## Deploy in 4 steps

```bash
# 1. Backup your current project
cd /Users/laythalshblawi/Documents/new
mv ele-cafe ele-cafe-old-backup

# 2. Extract this zip and rename to your standard project name
unzip ~/Downloads/ele-cafe-full-app.zip
mv full-app-staging ele-cafe
cd ele-cafe

# 3. Restore your secrets from backup (.env.local is NOT in the zip)
cp ../ele-cafe-old-backup/.env.local ./

# 4. Install + verify + deploy
npm install
cd functions && npm install && cd ..

# Sanity check — should print "Tests 142 passed"
npx vitest run

# Confirm Firebase project + secrets
firebase use ele-cafe-d7237
firebase functions:secrets:access RESEND_API_KEY
firebase functions:secrets:access RECAPTCHA_SECRET_KEY

# Deploy everything
firebase deploy
```

## After deploy — final steps

1. **Verify in Incognito** — open `elecafe.ca`, branded favicon in tab
2. **Place a test order** — confirmation email arrives with logo at top
3. **Try Forgot Password** — branded modal flow appears
4. **Run Lighthouse** — CLS under 0.10, LCP under 1.5s
5. **Enforce App Check on Functions**:
   - Firebase Console → Build → App Check
   - Functions row → three-dot menu → Enforce
   - All four App Check services now show ✅ Enforced

## What's NOT in this zip (you provide)

- `.env.local` — your Firebase API keys, reCAPTCHA keys (copy from old project)
- `node_modules/` — install fresh with `npm install`
- `functions/node_modules/` — install fresh with `cd functions && npm install`

## .env.local template

If you're starting fresh, create `.env.local` with these vars:

```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=ele-cafe-d7237.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ele-cafe-d7237
VITE_FIREBASE_STORAGE_BUCKET=ele-cafe-d7237.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=1:...:web:...
VITE_FIREBASE_MEASUREMENT_ID=G-...
VITE_RECAPTCHA_SITE_KEY=6Lfp...
VITE_FIREBASE_APP_CHECK_KEY=6Lfp...
VITE_GOOGLE_TRANSLATE_API_KEY=AIzaSy...
```

**No quotes around values, no spaces around `=` signs.**

## Future work (not blocking deploy)

- [ ] Trademark "Ele Café" with CIPO (~$330 CAD, 18mo to register)
- [ ] Future: Cloud Function rate limiting on /pageViews if scrapers appear
- [ ] Future: Security headers (CSP, HSTS) in firebase.json hosting config
- [ ] Optional: storage.rules audit (next focused session if interested)
