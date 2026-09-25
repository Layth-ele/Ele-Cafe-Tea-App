# Auth Capability Roadmap

**Status:** Research / not implemented
**Last updated:** 2026-04-30
**Owner:** TBD

This document tracks the auth capability features that are NOT in the current
codebase, with realistic effort estimates so they can be prioritized properly.

The current auth system (post-recent-rounds) sits at roughly **95/100** for an
e-commerce SMB. It includes:

- ✅ Email + Google sign-in with proper error mapping
- ✅ Open-redirect defense, anti-enumeration on password reset
- ✅ Allowlist Firestore rules for /users self-write
- ✅ Email verification ENFORCED at order placement (server + client)
- ✅ Push-based token refresh after admin role change (no more sign-out + back-in)
- ✅ Idle auto-logout (30 minutes)
- ✅ Open-redirect defense + race-guards in auth state callback

The features below would push toward 99-100 but each has real costs (time,
billing, ongoing maintenance) that need to be weighed against business value.

---

## ❌ Multi-Factor Authentication (MFA / 2FA)

**Effort:** 1-2 weeks of focused engineering work
**Ongoing cost:** Yes — Firebase Identity Platform billing
**Blocked by:** Project must be upgraded to Firebase Identity Platform (paid)

### What it is
Require a second factor (SMS code, authenticator app, hardware key) in
addition to password at sign-in. Industry standard for accounts holding
payment data, customer PII, or admin access.

### Why it's not in
1. **Free Firebase Auth doesn't support MFA.** Period. The MFA APIs
   (`multiFactor()`, `MultiFactorResolver`, `PhoneMultiFactorGenerator`)
   require an upgrade to Firebase Identity Platform (formerly GCP Identity
   Platform).

2. **Identity Platform pricing**:
   - Free tier: 50,000 MAU
   - Above free: ~$0.0055/MAU for tier 1, less for higher tiers
   - SMS multi-factor: ~$0.01-0.06 per send (varies by country; CA roughly $0.011)
   - For Ele Café (~50 orders/day, maybe 500-1000 MAU): would stay in free tier
     for users; SMS costs ~$5-15/month if every login uses SMS MFA

3. **One-way migration.** Once enabled, you can't downgrade. Locks you into
   billing for the lifetime of the project.

4. **UX burden.** MFA enrollment screens, recovery flows ("I lost my phone"),
   admin-side reset tooling. Customers WILL contact support saying they're
   locked out.

### Implementation outline (when you're ready)
1. Upgrade project to Identity Platform via GCP Console
2. Enable MFA in the Identity Platform settings (choose: SMS, TOTP authenticator, or both)
3. Add enrollment screen at /account/security (`multiFactor(user).enroll(...)`)
4. Update sign-in flow to handle `auth/multi-factor-auth-required` errors
5. Add MFA challenge screen (collect code, verify, complete sign-in)
6. Build admin reset tool (admin can clear a user's MFA enrollment)
7. Document recovery process for support team

### Recommendation
- **Now:** Skip. MFA on a tea shop is overkill; customers don't expect it
  and friction reduces conversion.
- **When justified:** If you start handling stored credit cards directly
  (currently you don't — eTransfer flow), or scaling to 10k+ customers,
  or onboarding more admin users.

---

## ❌ Session revocation / force-logout-from-device

**Effort:** 2-3 weeks
**Ongoing cost:** Increased Firestore reads (small), maintenance of an additional rule check
**Blocked by:** Architectural change to all Firestore rules

### What it is
Force a specific session to log out — useful when a user reports a stolen
laptop, suspicious account activity, or wants to "log out everywhere".
Currently a Firebase ID token is valid for up to **1 hour** regardless of
what we do server-side; even calling `auth.revokeRefreshTokens(uid)` only
prevents NEW tokens from being issued, not invalidate existing ones.

### Why it's not in
1. **Firebase tokens are JWTs validated locally**, not at a session store. The
   client checks the signature + expiry; if they pass, the token is accepted.
   No central "is this token revoked?" check happens by default.

2. **The fix requires a session-validity timestamp on every protected rule:**
   ```
   match /orders/{orderId} {
     allow read: if isOwner(...)
                 && request.auth.token.iat > getValidAfter(request.auth.uid);
   }
   ```
   You'd need a `getValidAfter()` helper that reads `/users/{uid}.tokenValidAfter`,
   and every protected resource rule has to include this check. Triple the
   rule complexity. Triple the surface area for rule mistakes.

3. **Performance hit.** Each Firestore operation now does an extra cross-doc
   read (rules can do this but it's slow and counts toward billing).

### Implementation outline
1. Add `tokenValidAfter` field to `/users/{uid}` (server timestamp)
2. Add a Cloud Function `revokeAllSessions(uid)` that updates the field +
   calls `auth.revokeRefreshTokens(uid)`
3. Add UI: "Sign out everywhere" button in /account
4. Update EVERY Firestore rule to include the validity check
5. Update client code to call `getIdToken(true)` periodically (every ~10 min)
   so the next read uses a fresh token AFTER admin reset
6. Test extensively — wrong rule = locked-out users

### Recommendation
- **Now:** Skip. The 1-hour token TTL means a stolen laptop loses access
  within an hour anyway, which is acceptable for SMB.
- **When justified:** If you have premium customers who request it, or
  if there's a compliance requirement (SOC 2 Type II audits ask about this).

### Cheap partial alternative (1 day of work)
Add a "Sign out everywhere" button that calls `auth.revokeRefreshTokens`
via a Cloud Function. This invalidates refresh tokens (no NEW tokens issued)
but existing tokens remain valid for up to 1 hour. Sets the right user
expectation while accepting the limitation.

---

## ❌ Backup codes / account recovery flows

**Effort:** 2-3 weeks for a complete system; 2-3 days for a basic version
**Ongoing cost:** Storage of (hashed) backup codes; admin time to handle recovery requests
**Blocked by:** Depends on MFA being implemented first (backup codes only
make sense as MFA recovery)

### What it is
When a user can't access their second factor (lost phone, lost authenticator),
they need a way to regain access without contacting support.

### Why it's not in
1. **Without MFA, backup codes don't apply.** Their purpose IS to recover
   from a lost MFA device.

2. **Real account recovery is a complex workflow:**
   - Knowledge-based authentication (date of birth, last order amount, address)
   - Identity document verification (manual review)
   - Cooling-off periods to prevent social engineering
   - Audit logs of all recovery actions
   - Support team training to handle the queue

3. **Done badly, it's worse than no recovery.** A weak recovery flow becomes
   the attack surface — attackers don't need MFA if they can social-engineer
   support into resetting it.

### Recommendation
- **Now:** Skip. Until MFA is in, this is a non-issue. The current "forgot
  password" flow handles 99% of access-recovery cases; the rest can be
  manual via Firebase Console (admin manually resets password / deletes
  account + has user re-signup).

---

## ❌ WebAuthn / hardware security keys (YubiKey, Touch ID, Windows Hello)

**Effort:** 3-4 weeks for production-grade
**Ongoing cost:** Identity Platform billing (same as MFA) + WebAuthn library maintenance
**Blocked by:** Identity Platform upgrade + custom OIDC/SAML provider integration

### What it is
Replace passwords with cryptographic keys stored in hardware (YubiKey,
Apple Secure Enclave, Windows Hello). Phishing-resistant; no password to steal.

### Why it's not in
1. **Firebase Auth doesn't natively support WebAuthn.** You'd need to:
   - Use a third-party service like SimpleWebAuthn server-side
   - Generate custom Firebase Auth tokens after WebAuthn verification
   - Or integrate via Identity Platform's custom OIDC provider feature

2. **Browser/OS compatibility testing is significant.** Each platform
   (YubiKey, TouchID, Windows Hello, Android keystore) has subtle quirks.

3. **User adoption is low.** Most consumers don't own hardware keys;
   most don't know how to use platform authenticators (TouchID/FaceID for login).

### Recommendation
- **Now:** Skip. Even Stripe (which absolutely should have hardware key
  support for high-value accounts) has it as opt-in, not default.
- **When justified:** If you're ever audited for SOC 2 Type II or PCI Level 1,
  or if you onboard a customer who specifically requires it.

---

## Other Firebase Auth features worth considering

These are NOT critical gaps but could be incremental wins:

### ⏳ Phone number sign-in (1-2 days; free tier)
Customers sign in with phone + SMS code instead of email + password.
Convenient for mobile-heavy users. Costs ~$0.01-0.06 per SMS.
**Recommendation:** Add IF you have data showing customers prefer phone over email.

### ⏳ Apple Sign In (1 day; required for iOS App Store apps)
If you ever ship an iOS app, Apple requires Sign In with Apple as an option
when offering any third-party sign-in (Google).
**Recommendation:** Skip until you ship an iOS app.

### ⏳ Anonymous → permanent account upgrade (3 days)
Let users browse + add to cart without signing up; convert to permanent
account at checkout. Good for conversion rates. `linkWithCredential()`.
**Recommendation:** Worth measuring. Test as an A/B if abandonment is high.

### ⏳ Email link / passwordless sign-in (2-3 days; free)
"Magic link" emailed to user, click to sign in. No password needed.
Reduces password-reset support tickets by ~80% in companies that ship it.
**Recommendation:** Worth considering as the PRIMARY email flow,
relegating password to fallback.

### ⏳ Account linking UI (2-3 days; free)
Let a customer who signed up with email later link Google to the same
account, or vice versa. Currently if they accidentally sign up twice
(email then Google), they have two separate accounts. Manual fix only.
**Recommendation:** Add when you start seeing duplicate accounts in support.

### ⏳ Admin user impersonation (1 week; security-critical to do right)
Admin can "log in as" a customer to debug their issue. Requires a custom
token from a Cloud Function with extensive audit logging.
**Recommendation:** Worth it for support efficiency once you have >5 support
tickets/week. Lower priority for now.

---

## Total cost summary

| Feature | Effort | Billing impact | Recommendation |
|---|---|---|---|
| MFA / 2FA | 1-2 weeks | Identity Platform: $5-15/mo | Skip |
| Session revocation | 2-3 weeks | Negligible | Skip; partial 1-day version OK |
| Backup codes | 2-3 weeks (after MFA) | Storage only | Skip until MFA |
| WebAuthn | 3-4 weeks | Identity Platform | Skip |
| Phone sign-in | 1-2 days | $0.01-0.06/SMS | Maybe |
| Apple Sign In | 1 day | None | Only for iOS app |
| Anon→Perm | 3 days | None | A/B test it |
| Email magic link | 2-3 days | None | Worth piloting |
| Account linking | 2-3 days | None | When duplicates appear |
| Admin impersonation | 1 week | None | Worth it for support |

**Total estimated effort to ship everything: ~3-4 months.**

For a tea shop, the right move is to ship NONE of the above unless a
specific business case justifies it. The current 95/100 auth system is
already above what 99% of comparable e-commerce sites have.
