# Email System — How It Works (and What Can Break)

The Ele Café app sends emails via **two completely separate systems**:

## System 1: Order/Status Emails — Resend (via Cloud Function)

**When:** Order is created, or its status changes (approved, in_progress, shipped, delivered, cancelled, rejected, expired).

**Path:**
```
Customer places order
  → Firestore /orders/{orderId} doc written
  → Cloud Function `onOrderEmail` triggered
  → looks up customer email (/users/{uid}.email or Firebase Auth)
  → builds branded HTML email
  → POST https://api.resend.com/emails
  → Resend delivers via SMTP
  → email lands in customer's inbox
```

**Code locations:**
- Trigger: `functions/src/index.ts` — function `onOrderEmail`
- Send helper: `functions/src/index.ts` — function `sendEmail`
- Email lookup: `functions/src/index.ts` — function `getCustomerEmail`

**Configuration:**
- Secret: `RESEND_API_KEY` (set via `firebase functions:secrets:set`)
- Sender: `Ele Café <orders@elecafe.ca>` (must be from a verified domain in Resend)
- Domain verification: https://resend.com/domains

**How to check it's working:**
```bash
firebase functions:log --project ele-cafe-d7237 --only onOrderEmail --lines 30
```

Look for `✓ "Order Confirmed — ..."` (success) or `Resend 4xx: ...` (error).

**Common failure modes:**
| Error in logs | Cause | Fix |
|---|---|---|
| `RESEND_API_KEY not set` | Secret never deployed | `firebase functions:secrets:set RESEND_API_KEY` then redeploy function |
| `Resend 401: Invalid API key` | API key was rotated | Generate new key, update secret |
| `Resend 403: domain not verified` | DNS records changed | Re-verify at https://resend.com/domains |
| `Resend 422: validation error` | Bad email format | Check `getCustomerEmail` return value |
| `getCustomerEmail Auth lookup failed` | User was deleted | Order has stale userId; defensive return is correct |
| `No email found for userId=...` | User never had email | Order placed by a malformed account; nothing to do |

## System 2: Verification / Reset / Email-Change — Firebase Auth (built-in SMTP)

**When:** New email/password signup, password reset, email-change, "Resend verification" button.

**Path:**
```
User clicks signup with email+password
  → mod.createUserWithEmailAndPassword()
  → mod.sendEmailVerification()
  → Firebase Auth sends via its own SMTP
  → email lands in customer's inbox
```

**Code locations:**
- Signup: `src/contexts/AuthContext.tsx` — function `signup`
- Resend modal: `src/app/components/modals/EmailVerificationModal.tsx`
- Resend banner: `src/app/components/Navbar.tsx`

**Configuration:**
- Email templates: Firebase Console → Authentication → Templates
- Sender: defaults to `noreply@<project>.firebaseapp.com` — this has TERRIBLE deliverability
- Custom SMTP: Firebase Console → Authentication → Templates → SMTP Settings
- Authorized domains: Firebase Console → Authentication → Settings → Authorized domains

**This system has NOTHING to do with Resend.** Verification emails do not go through the Cloud Function. They go through Firebase's built-in mailer (or a custom SMTP if you've configured one).

**How to check it's working:**

1. Sign up a new test user with email+password (NOT Google — Google users skip verification)
2. Open DevTools Console BEFORE clicking signup
3. Look for the line:
   - `[signup] sendEmailVerification failed: ...` — if present, that's your error
   - If no error logged, Firebase accepted the request — email is in flight
4. Wait 5 minutes, check spam folder

**Common failure modes:**

| Symptom | Cause | Fix |
|---|---|---|
| User never receives email, no console error | Firebase default SMTP went to spam, was bounced silently, or just failed silently | Configure custom SMTP (SendGrid/Resend/Postmark) in Firebase Console |
| `auth/too-many-requests` in console | Project hit Firebase's rate limit (varies; ~10/hour per IP) | Wait ~10 minutes |
| `auth/invalid-continue-uri` | `continueUrl` not in Authorized domains list | Firebase Console → Authentication → Settings → Authorized domains → add `elecafe.ca` |
| Email arrives but link goes to a broken page | `VITE_FIREBASE_AUTH_DOMAIN` points to a custom subdomain with cert issues | Either fix the cert OR set `VITE_FIREBASE_AUTH_DOMAIN=ele-cafe-d7237.firebaseapp.com` (default) |
| Modal never appears for unverified user | User signed in via Google (auto-verified) | Test with email+password signup, NOT Google |

## ⚠️ The Big Misconception

Resend is for **transactional product emails** (orders).
Resend does NOT handle Firebase Auth verification emails unless you explicitly configure it as Firebase's SMTP provider.

If you set up Resend's API key (which is what you did), order emails work — verification emails don't. To make verification emails go through Resend, you need to:

1. Get Resend SMTP credentials (different from API key — found at https://resend.com/smtp)
2. Open Firebase Console → Authentication → Templates
3. Click any template (e.g. "Email address verification")
4. Click the gear icon → SMTP Settings
5. Fill in:
   - SMTP server: `smtp.resend.com`
   - Port: `587`
   - Username: `resend`
   - Password: (your Resend SMTP password)
   - Sender email: `noreply@elecafe.ca`
6. Save and test

**Until you do that, every verification email goes through Firebase's default sender, which has very poor deliverability — Gmail and Outlook frequently silently drop these.**

## How to Verify the Whole Chain End-to-End

### Test 1: Order email
1. Sign in with any account
2. Add a tea to cart, checkout, place a real order
3. Run: `firebase functions:log --project ele-cafe-d7237 --only onOrderEmail --lines 5`
4. Should see: `[sendEmail] ✓ "Order Confirmed — ELE-XXXX-XXXXX | Ele Café" → your@email.com`
5. Check inbox → email arrives within ~30 seconds

### Test 2: Verification email
1. Sign out
2. Sign up with a fresh `+test1@gmail.com`-style email AND PASSWORD (not Google)
3. DevTools Console open during signup
4. Should see no error
5. Check inbox AND spam folder for "Verify your email" within ~5 minutes

If Test 1 works but Test 2 doesn't, that's the exact split this doc describes — Resend is fine, Firebase Auth's default mailer is bad. Configure custom SMTP.

If Test 1 also doesn't work, follow the System 1 diagnostic chain above.
