# Ele Café — Complete Firebase Deploy Guide

This guide takes you from a fresh clone to a fully running production app.
Follow the steps in order.

---

## Prerequisites

Install these once if you haven't already:

```bash
npm install -g firebase-tools        # Firebase CLI
node --version                        # Must be ≥ 18 (22 recommended)
```

---

## Step 1 — Clone & install dependencies

```bash
# Install client dependencies
npm install

# Install Cloud Functions dependencies
cd functions && npm install && cd ..
```

---

## Step 2 — Create your .env file

```bash
cp .env.example .env
```

Open `.env` and fill in your Firebase project values.
Get them from: **Firebase Console → Project Settings → Your apps → SDK setup**

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=ele-cafe-d7237.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ele-cafe-d7237
VITE_FIREBASE_STORAGE_BUCKET=ele-cafe-d7237.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc...
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

Leave `VITE_RECAPTCHA_SITE_KEY` and `VITE_GOOGLE_TRANSLATE_API_KEY` blank for now —
the app works without them and you can add them later.

---

## Step 3 — Log in and select your Firebase project

```bash
firebase login
firebase use ele-cafe-d7237          # or: firebase use --add
```

---

## Step 4 — Enable Firebase services in the Console

Go to **Firebase Console (console.firebase.google.com)** and enable:

| Service | Where to enable |
|---------|----------------|
| **Authentication** | Build → Authentication → Get started → Email/Password + Google |
| **Firestore** | Build → Firestore Database → Create database → Production mode |
| **Storage** | Build → Storage → Get started → Production mode |
| **Functions** | Build → Functions → Get started |
| **Hosting** | Build → Hosting → Get started |

---

## Step 5 — Set Firebase Secrets (server-side only, never in .env)

These are securely stored in Google Secret Manager and injected into Cloud Functions.

### 5a. Resend — transactional emails

1. Create account at **https://resend.com**
2. Verify your domain (elecafe.ca) or use the Resend sandbox for testing
3. Create an API key
4. Run:

```bash
firebase functions:secrets:set RESEND_API_KEY
# Paste your key when prompted: re_xxxxxxxxxxxx
```

### 5b. reCAPTCHA Secret Key — bot protection

1. Go to **https://www.google.com/recaptcha/admin**
2. Create a site → **reCAPTCHA v3**
3. Add domains: `elecafe.ca` and `localhost`
4. Copy the **SECRET KEY** (not the site key)
5. Run:

```bash
firebase functions:secrets:set RECAPTCHA_SECRET_KEY
# Paste the secret key when prompted
```

6. Copy the **SITE KEY** into your `.env`:
```
VITE_RECAPTCHA_SITE_KEY=6Lc...your_site_key
```

### 5c. Google Translate — EN/FR live translation (optional)

The app ships with 193 pre-translated strings. This step adds live translation
for dynamic content (tea descriptions, product names) and caches results in Firestore.

1. Go to **https://console.cloud.google.com**
2. Enable **Cloud Translation API**
3. Create an API key → restrict it to Translation API + your domain
4. Add to `.env`:
```
VITE_GOOGLE_TRANSLATE_API_KEY=AIza...
```

---

## Step 6 — Set your admin email

Before deploying, you need to designate the first admin account.

1. Deploy the app (Step 8)
2. Sign up at your live URL with your admin email address
3. In Firebase Console → **Firestore → users collection** → find your user document
4. Note your Firebase UID (the document ID)
5. In Firebase Console → **Functions → Shell** or use a one-time script:

```javascript
// Run this in Firebase Functions shell or as a one-time script:
const admin = require('firebase-admin');
admin.initializeApp();
admin.auth().setCustomUserClaims('YOUR_UID_HERE', { role: 'admin' });
```

Or use the AdminSettings page → Role Management once you're logged in as admin
(bootstrap the first admin manually, then use the UI for subsequent ones).

---

## Step 7 — Build the functions

```bash
cd functions && npm run build && cd ..
```

This compiles TypeScript → JavaScript in `functions/lib/`.

---

## Step 8 — Deploy everything

```bash
firebase deploy
```

This deploys in order: Firestore rules, Firestore indexes, Storage rules,
Cloud Functions, Hosting.

**Or deploy pieces individually:**

```bash
firebase deploy --only firestore:rules       # Rules only
firebase deploy --only firestore:indexes     # Indexes only
firebase deploy --only storage               # Storage rules only
firebase deploy --only functions             # Functions only
firebase deploy --only hosting               # Frontend only
```

---

## Step 9 — Seed initial data (first deploy only)

After deploying, run the seeder to populate Firestore with the 79 teas:

```bash
# From the project root
node scripts/seed-firestore.js
```

Or upload the teas manually through **Admin → Products** in the app.

---

## Step 10 — Configure store settings in the app

1. Log in as admin at your live URL
2. Go to **Admin → Settings**
3. Fill in:
   - Store name, email, address, phone
   - **eTransfer email** — this is where customers send payment
   - **eTransfer password** — shown to customers in approval emails
   - Announcement text
   - Upload your logo and footer logo
4. Click Save

---

## API Keys Summary

| Key | Where to get | Where to put |
|-----|-------------|--------------|
| Firebase config | Firebase Console → Project Settings | `.env` |
| reCAPTCHA SITE key | console.google.com/recaptcha | `.env` |
| reCAPTCHA SECRET key | console.google.com/recaptcha | `firebase functions:secrets:set` |
| Resend API key | resend.com | `firebase functions:secrets:set` |
| Google Translate key | console.cloud.google.com | `.env` |

---

## npm Commands

```bash
# Development
npm run dev                    # Start local dev server (http://localhost:5173)

# Production build
npm run build                  # Build to /dist

# Firebase emulators (local testing with real rules)
firebase emulators:start       # All emulators
firebase emulators:start --only functions,firestore,auth

# Functions
cd functions
npm run build                  # Compile TS → JS
npm run watch                  # Watch + recompile
firebase functions:log         # View live function logs

# Deploy
firebase deploy                          # Deploy everything
firebase deploy --only functions         # Functions only
firebase deploy --only hosting           # Frontend only
firebase deploy --only firestore         # Rules + indexes only
```

---

## Firestore Collections Reference

| Collection | Description |
|-----------|-------------|
| `teas` | Tea product catalogue (79 teas) |
| `teas/{id}/reviews` | Customer reviews per tea |
| `orders` | Customer orders |
| `users` | User profiles, saved addresses |
| `credits` | Loyalty point balances |
| `creditTransactions` | Immutable points audit log |
| `notifications` | In-app notifications |
| `promotions` | Discount codes |
| `promotionUsage` | Per-user promo usage tracking |
| `settings/global` | Store-wide settings |
| `counters` | Order ID counter, customer ID counter |
| `translations/fr/cache` | Cached EN→FR translations |
| `security_events` | reCAPTCHA low-score logs |

---

## Environment Check

Run this to verify your setup is working:

```bash
# Confirm Firebase CLI is logged in and project is selected
firebase projects:list

# Check secrets are set
firebase functions:secrets:access RESEND_API_KEY
firebase functions:secrets:access RECAPTCHA_SECRET_KEY

# View function logs after deploy
firebase functions:log --only onOrderEmail
```

---

## Troubleshooting

**Functions fail to deploy with "secret not found"**
→ Run `firebase functions:secrets:set RESEND_API_KEY` and `firebase functions:secrets:set RECAPTCHA_SECRET_KEY`

**Emails not being sent**
→ Check function logs: `firebase functions:log --only onOrderEmail`
→ Verify RESEND_API_KEY is set
→ Verify your Resend domain is verified (or use sandbox mode)

**reCAPTCHA not working**
→ Check VITE_RECAPTCHA_SITE_KEY is in .env
→ Check RECAPTCHA_SECRET_KEY is set as a Firebase secret
→ Verify your domain is added in the reCAPTCHA console

**French translations not appearing**
→ 193 UI strings are built-in and work offline
→ For tea names/descriptions: add VITE_GOOGLE_TRANSLATE_API_KEY to .env
→ Check Firestore rules allow writes to /translations/fr/cache/{docId}

**Admin role not working**
→ Ensure you've set the custom claim via Firebase Auth
→ Sign out and sign back in after setting the claim (JWT must be refreshed)

