import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { User, Auth } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { db, getAuthLazy } from '@/lib/firebase';
import { isSafeReturnUrl } from '@/lib/safeReturnUrl';
import { runWithOfflineRetry } from '@/lib/firestoreRetry';
import { isInventoryEmail } from '@/lib/inventoryAccount';

/**
 * The shape of the lazy-loaded auth wrapper module. Keeping this as
 * a structural type means AuthContext doesn't import firebase/auth
 * directly (which would defeat the whole lazy-load), and stays in
 * sync with `firebaseAuthLazy.ts` via TypeScript's `typeof import`.
 */
type AuthMod = typeof import('../lib/firebaseAuthLazy');

interface AuthContextType {
  /** Signed-in customer. Guest-checkout sessions are NOT a currentUser —
   *  the site treats guests as signed out everywhere. */
  currentUser: User | null;
  /** Anonymous session used only for guest checkout (see startGuestSession). */
  guestUser: User | null;
  /** Start (or reuse) an anonymous session so a guest can place an order. */
  startGuestSession: () => Promise<User>;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<User>;
  loginWithGoogle: () => Promise<User | null>;
  signup: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

/**
 * Resolved Firebase Auth singleton — populated by AuthProvider's
 * mount effect, but also accessible to other modules (useCartSync)
 * that need onAuthStateChanged without going through React context.
 *
 * The promise is cached: concurrent ensureAuth() calls share one
 * dynamic import of firebase/auth. Once resolved it stays in memory
 * for the page's lifetime — the auth singleton is reused across
 * every login/logout cycle (Firebase's design).
 */
let _resolvedAuth: { auth: Auth; mod: AuthMod } | null = null;

export async function ensureAuth(): Promise<{ auth: Auth; mod: AuthMod }> {
  if (_resolvedAuth) return _resolvedAuth;
  const sm = await getAuthLazy();
  _resolvedAuth = { auth: sm.auth, mod: sm };
  return _resolvedAuth;
}

// "This browser had a signed-in customer last time." Visitors without it
// (every new visitor, and search engines) get the page painted at once
// instead of waiting for the Auth SDK to download and restore a session —
// that wait was most of the mobile LCP. Signed-in customers keep the gate,
// so they never see signed-out UI flash. `loading` still means "auth not
// known yet" for guards (ProtectedRoute, LoginPage, checkout).
const SIGNED_IN_HINT = 'ele:signedIn';
function readSignedInHint(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_HINT) === '1';
  } catch {
    return true; // storage blocked: keep the safe (gated) behaviour
  }
}
function writeSignedInHint(on: boolean) {
  try {
    if (on) localStorage.setItem(SIGNED_IN_HINT, '1');
    else localStorage.removeItem(SIGNED_IN_HINT);
  } catch {
    /* storage blocked */
  }
}

function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [guestUser, setGuestUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [gated] = useState(readSignedInHint);
  const [isAdmin, setIsAdmin] = useState(false);

  function isFirstAuthSession(user: User): boolean {
    return (
      !!user.metadata.creationTime &&
      !!user.metadata.lastSignInTime &&
      user.metadata.creationTime === user.metadata.lastSignInTime
    );
  }

  // Ref to the resolved auth — set once during mount so callbacks
  // below don't have to reschedule waiting for state.
  const authRef = useRef<{ auth: Auth; mod: AuthMod } | null>(null);

  // ── Auth actions ────────────────────────────────────────────
  // All five callbacks below close over only module-scoped helpers
  // (ensureAuth, ensureUserDoc) — they don't capture any component
  // state. Wrapping them in useCallback with an empty deps array
  // gives consumers a stable reference for the lifetime of the
  // provider, so memoizing the context value below is meaningful.
  // Without this, even a useMemo'd value object would invalidate
  // on every render because login/signup/etc. were freshly-created
  // function instances each render — defeating the whole point.
  const login = useCallback(async (email: string, password: string) => {
    const { auth, mod } = await ensureAuth();
    const cred = await mod.signInWithEmailAndPassword(auth, email, password);
    // Eagerly sync React state so the navigate() that immediately
    // follows in LoginPage sees a populated currentUser. Without this,
    // there's a 100-300ms gap between Firebase auth landing and the
    // onAuthStateChanged listener (which awaits getIdTokenResult before
    // calling setCurrentUser). During that gap, route guards see
    // currentUser=null and incorrectly bounce signed-in users back to
    // /login — manifesting as a blank/flashing screen for the user.
    // The listener still fires asynchronously and is idempotent; it
    // also resolves the admin claim, which we leave default-false here
    // for safety until the JWT is parsed.
    setCurrentUser(cred.user);
    return cred.user;
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const { auth, mod } = await ensureAuth();
    const provider = new mod.GoogleAuthProvider();
    // Add prompt to ensure account picker always shows
    provider.setCustomParameters({ prompt: 'select_account' });
    // Home-screen app (iPhone especially): the popup opens in a separate
    // sheet that can't report back to the app, so signInWithPopup never
    // settles and the button spins forever. Use the full-page redirect
    // there — authDomain is elecafe.ca, so it stays first-party, and the
    // getRedirectResult handler below finishes the sign-in on return.
    if (isStandaloneApp()) {
      await mod.signInWithRedirect(auth, provider);
      return null;
    }
    let cred;
    try {
      cred = await mod.signInWithPopup(auth, provider);
    } catch (err: unknown) {
      // COOP (Cross-Origin-Opener-Policy) blocks window.closed in some browsers —
      // if the user completed sign-in the credential is still available via getRedirectResult
      const e = err as { code?: string; message?: string };
      if (e.code === 'auth/popup-blocked' || e.message?.includes('COOP')) {
        await mod.signInWithRedirect(auth, provider);
        return null;
      }
      throw err;
    }
    // A Firestore write only resolves on server ack, which can stall for
    // a long time on a weak phone connection — the user was stuck on
    // "Signing in…" although Google had already signed them in. Wait a
    // few seconds at most; the write still lands in the background, and
    // the auth listener's ensureUserDoc covers anything it misses.
    await Promise.race([
      syncUserDocFromKnownState(
        cred.user,
        cred.user.displayName || '',
        isFirstAuthSession(cred.user),
      ).catch((err) => console.warn('[loginWithGoogle] /users sync failed:', err)),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    // Same eager-set as the email/password login — see the comment
    // in `login()` for the rationale (avoids the post-login blank-
    // screen race when navigate() outpaces onAuthStateChanged).
    setCurrentUser(cred.user);
    return cred.user;
  }, []);

  const signup = useCallback(async (email: string, password: string, displayName = '') => {
    const { auth, mod } = await ensureAuth();
    const cred = await mod.createUserWithEmailAndPassword(auth, email, password);
    // Send verification email — non-blocking so account creation still
    // completes if the email infrastructure is briefly unavailable. But
    // we DO log failures (used to be `.catch(() => {})` which silently
    // hid quota errors / project misconfig — making "users aren't
    // getting emails" essentially undebuggable).
    //
    // ActionCodeSettings: pin the post-verification redirect to the
    // canonical site URL. Without this, the link in the email goes to
    // VITE_FIREBASE_AUTH_DOMAIN — which means a certificate / DNS issue
    // on the custom auth domain breaks every verification link. With
    // `url` set to the public site, Firebase's email handler still runs
    // on its own domain, then bounces the user back to the site URL we
    // know works. `handleCodeInApp: false` keeps the default Firebase-
    // hosted action page (no need to host our own).
    const continueUrl =
      typeof window !== 'undefined' && window.location?.origin
        ? `${window.location.origin}/account?verified=1`
        : undefined;
    mod
      .sendEmailVerification(
        cred.user,
        continueUrl ? { url: continueUrl, handleCodeInApp: false } : undefined,
      )
      .catch((err) => {
        // Log to console so it appears in DevTools AND in any error
        // collector wired up on `console.error`. Common failure modes:
        //   - auth/too-many-requests: project hit Firebase's hourly cap
        //   - auth/internal-error:    transient — usually retried by user
        //   - auth/invalid-continue-uri: continueUrl not in the
        //     Authorized domains list (Firebase Console → Authentication
        //     → Settings → Authorized domains).
        console.error('[signup] sendEmailVerification failed:', err);
      });
    await syncUserDocFromKnownState(cred.user, displayName, true);
  }, []);

  async function syncUserDocFromKnownState(user: User, displayName = '', isFirstLogin = false) {
    const userRef = doc(db, 'users', user.uid);

    if (isFirstLogin) {
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email ?? '',
        displayName: displayName || user.displayName || '',
        photoURL: user.photoURL ?? '',
        role: 'user',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const updates: Record<string, unknown> = {
      email: user.email ?? '',
      photoURL: user.photoURL ?? '',
      updatedAt: serverTimestamp(),
    };
    const newName = displayName || user.displayName;
    if (newName) updates.displayName = newName;
    await setDoc(userRef, updates, { merge: true });
  }

  const logout = useCallback(async () => {
    // Phase 24 — eager state clear BEFORE the Firebase signOut completes.
    //
    // Why: previously this just did `await mod.signOut(auth)` and relied
    // on onAuthStateChanged to fire setCurrentUser(null). That works
    // ON pages that have the listener active, but until Phase 24 the
    // listener was path-gated (see the useEffect below — search "Phase
    // 24 — always wire"). On a non-auth-route (e.g. /, /products,
    // /pairings, /gifts) the listener never fired, so the UI would
    // continue showing signed-in state even after Firebase had cleared
    // the session — manifesting as "sign-out does nothing until I
    // navigate to /account."
    //
    // Belt-and-braces: even with the listener always wired now, eager
    // clear gives instant UI feedback (the listener can take 50-150ms
    // to fire after signOut() resolves on slow connections).
    //
    // Unregister this device's push token first (needs the user's auth),
    // so a shared phone/computer stops receiving the previous account's
    // notifications. Capped so a slow network can't hold up sign-out.
    const { unregisterPushDevice } = await import('@/lib/pushDevice');
    await Promise.race([unregisterPushDevice(), new Promise((r) => setTimeout(r, 3000))]);
    setCurrentUser(null);
    setIsAdmin(false);
    const { auth, mod } = await ensureAuth();
    await mod.signOut(auth);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { auth, mod } = await ensureAuth();
    return mod.sendPasswordResetEmail(auth, email);
  }, []);

  // Create or update /users doc on sign-in. Carefully preserves
  // existing fields that the client should never overwrite:
  //   - role: an admin re-logging in must NOT be demoted to 'user'.
  //     The JWT custom claim is the security boundary, but the
  //     /users.role field is read by AdminCustomers and analytics.
  //   - createdAt: must be set ONCE (signup), never rewritten on
  //     subsequent logins. Otherwise customer "joined" dates keep
  //     resetting to the latest login timestamp.
  //
  // /credits and the welcome-bonus creditTransaction are written by
  // the onNewUser Cloud Function (Admin SDK bypasses rules).
  async function ensureUserDoc(user: User, displayName = '') {
    const userRef = doc(db, 'users', user.uid);
    // Wrap the existence check in offline-retry. This runs both at
    // signup time (where the connection is hot from the auth call
    // that just succeeded) AND on every onAuthStateChanged (which
    // fires before Firestore's long-poll handshake completes on
    // cold loads). The retry-on-offline path is the early-mount
    // case; the sync helper is a no-op when the connection is hot.
    const existing = await runWithOfflineRetry(() => getDoc(userRef));

    if (existing.exists()) {
      // Re-login: update only mutable identity fields. role +
      // createdAt deliberately omitted from this write — they're
      // either set already (role) or set once at signup (createdAt).
      // Display name only overwrites when the caller passed a non-
      // empty value — so a Google login with displayName=null doesn't
      // wipe a user who set their name manually in Account.
      const updates: Record<string, unknown> = {
        email: user.email ?? existing.data().email ?? '',
        photoURL: user.photoURL ?? existing.data().photoURL ?? '',
        updatedAt: serverTimestamp(),
      };
      const newName = displayName || user.displayName;
      if (newName) updates.displayName = newName;
      await setDoc(userRef, updates, { merge: true });
    } else {
      // First sign-in: create with role default + createdAt.
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email ?? '',
        displayName: displayName || user.displayName || '',
        photoURL: user.photoURL ?? '',
        role: 'user',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    // Phase 24 — always wire the auth listener, regardless of route.
    //
    // Previously this was path-gated to a regex of auth-touching
    // routes (/login, /signup, /account, /orders, /checkout, /admin,
    // /inventory). That was a perf optimization to skip loading the
    // 200 KB firebase/auth chunk on public pages — but it created a
    // catastrophic UX bug: signing out on a non-gated route (the
    // drawer's "Sign out" is reachable from EVERY page) called
    // Firebase signOut successfully but the React state never
    // updated because no listener was attached. The user appeared
    // signed in until they navigated to a gated route, which is when
    // the listener finally wired up and fired with null.
    //
    // Cost of the fix: the firebase/auth chunk loads on every cold
    // page load (~200 KB gzipped), not just on auth-touching pages.
    // Net result is still net-positive because: (a) repeat visits
    // hit the SW cache, (b) the chunk is loaded once per session
    // anyway since users almost always navigate to an auth-touching
    // route eventually, and (c) auth correctness is a hard
    // requirement, not a perf trade-off.
    //
    // We don't gate on `loading` here because eager-clearing
    // currentUser in logout() means the UI updates instantly anyway.
    // The listener exists as the source of truth for fresh sessions
    // (back-from-redirect, cross-tab signOut, token expiry).

    // Lazy-load auth then wire up the listeners. We hold off
    // resolving loading=false until the first onAuthStateChanged
    // callback fires — this preserves the original gate behaviour
    // where children don't render until we know if there's a user.
    // The window is now ~30-80ms longer on cold loads (the dynamic-
    // import round-trip) but service-worker-cached repeat visits
    // are unaffected.
    (async () => {
      const resolved = await ensureAuth();
      if (cancelled) return;
      authRef.current = resolved;
      const { auth, mod } = resolved;

      // Handle redirect-flow sign-in: if loginWithGoogle fell back to
      // signInWithRedirect (popup blocked / COOP), the credential
      // arrives here on page load. Without this call, new users
      // completing sign-in via redirect never get their /users docs
      // created, because ensureUserDoc only runs in the popup branch.
      mod
        .getRedirectResult(auth)
        .then(async (cred) => {
          if (!cred) return;
          await syncUserDocFromKnownState(
            cred.user,
            cred.user.displayName || '',
            isFirstAuthSession(cred.user),
          );
          // After redirect-flow completes the user is sitting on
          // /login (or wherever they initiated the redirect). Without
          // navigation they'd see the login form even though they're
          // logged in — confusing. Pick up the returnUrl from the
          // current URL if present (LoginPage adds it before redirect),
          // otherwise go home. Use replace so the login page isn't
          // in browser history.
          if (cancelled) return;
          try {
            const params = new URLSearchParams(window.location.search);
            const returnUrl = params.get('returnUrl') || '/';
            // location.replace forces a full page load — guarantees
            // every consumer (AuthContext, listeners, contexts) sees
            // the fresh auth state without a "still showing login"
            // flash. The returnUrl is sanitized below.
            const safe = isInventoryEmail(cred.user.email)
              ? '/inventory'
              : isSafeReturnUrl(returnUrl)
                ? returnUrl
                : '/';
            window.location.replace(safe);
          } catch (navErr) {
            console.error('Redirect post-auth navigation failed:', navErr);
          }
        })
        .catch((err) => {
          console.error('Redirect sign-in error:', err);
        });

      unsubscribe = mod.onAuthStateChanged(auth, async (user) => {
        if (cancelled) return;

        if (!user) {
          // Logged out — both updates can be synchronous.
          writeSignedInHint(false);
          setCurrentUser(null);
          setGuestUser(null);
          setIsAdmin(false);
          setLoading(false);
          return;
        }
        // Guest-checkout session: not a signed-in customer.
        if (user.isAnonymous) {
          writeSignedInHint(false);
          setCurrentUser(null);
          setGuestUser(user);
          setIsAdmin(false);
          setLoading(false);
          return;
        }
        setGuestUser(null);
        writeSignedInHint(true);

        // Logged in — resolve isAdmin BEFORE committing currentUser
        // so React batches both state updates into one render. Without
        // this, ProtectedRoute (which checks `requireAdmin && !isAdmin`)
        // would briefly bounce an admin to home during the gap between
        // currentUser arriving and isAdmin resolving.
        //
        // Capture the uid so we can detect cross-user races: if a fast
        // logout-login-different-user happens before getIdTokenResult
        // resolves, the response can land after a different user is
        // current. Compare against auth.currentUser at resolution time
        // and drop stale responses.
        const targetUid = user.uid;
        let isAdminClaim = false;
        try {
          const token = await user.getIdTokenResult();
          // forceRefresh defaults to false — we use the cached token.
          // After an admin role change (server-side setCustomUserClaims),
          // the affected user must sign out and back in for the new
          // claim to take effect. This is a documented Firebase
          // limitation; pushing claim changes requires a custom
          // signaling mechanism we don't implement here.
          isAdminClaim = token.claims.role === 'admin';
        } catch (err) {
          // Token fetch failed — treat as non-admin defensively.
          console.warn('[AuthProvider] token fetch failed while resolving admin claim:', err);
          isAdminClaim = false;
        }

        // Stale-response guard: by the time the await resolved, the
        // active auth user might have changed (sign-out, then sign-in
        // as someone else). Compare uid; if different, this callback's
        // user is no longer current, so its result is stale and must
        // not overwrite the now-current user's state.
        if (cancelled) return;
        if (auth.currentUser?.uid !== targetUid) return;

        setCurrentUser(user);
        setIsAdmin(isAdminClaim);
        setLoading(false);

        // Sync profile fields on every sign-in. Previously this only
        // ran inside `signup()`, `loginWithGoogle()`, and the redirect
        // result handler — meaning a user who signed up months ago and
        // returns via email/password login never had their `/users` doc
        // updated. If they changed their photoURL via Firebase Console,
        // updated their email, or had any field drift, the storefront
        // continued reading stale data forever.
        //
        // Run as fire-and-forget so a Firestore failure (offline,
        // permission denied) doesn't block the auth flow. ensureUserDoc
        // already detects new-vs-existing internally and writes only
        // mutable fields for existing users. ensureUserDoc itself
        // wraps its read in offline-aware retry, so transient early-
        // mount offline errors are absorbed silently. Anything that
        // bubbles up here is either a real Firestore problem
        // (permission-denied, malformed doc) or a final retry-
        // exhausted offline state — both worth logging at warn level.
        ensureUserDoc(user, user.displayName || '').catch((err) => {
          const isOffline =
            (err as { code?: string })?.code === 'unavailable' ||
            (err as { message?: string })?.message?.includes?.('client is offline');
          if (isOffline) {
            // Transient — quieter log, no "failed" wording. The
            // /users doc will sync naturally on next sign-in or when
            // the user navigates to Account where useAccount reads it.
            console.info('[AuthProvider] /users sync skipped (offline)');
          } else {
            console.warn('[AuthProvider] /users sync failed:', err);
          }
        });
      });
    })().catch((err) => {
      console.error('[AuthProvider] Failed to initialize auth:', err);
      // Even on auth-init failure, let the app render rather than
      // hanging on an indefinite loading state — public pages should
      // still work for anonymous visitors.
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
    // Phase 24 — deps empty: listener lives for the lifetime of the
    // AuthProvider. Previously this depended on `pathname` (paired
    // with the path-gate above), which meant the listener tore down
    // and re-subscribed on every navigation. With the gate removed
    // there's no reason to do that — Firebase's listener is meant to
    // be set up once per session. Empty deps also removes the race
    // where a sub/unsub during navigation could miss a fast back-to-
    // back signOut/signIn.
  }, []);

  // Listen for role-change signals. When an admin promotes or demotes
  // this user, the setAdminRole Cloud Function writes a doc to
  // /roleSignals/{uid}. We force-refresh the ID token on each change
  // so the new admin custom claim takes effect immediately — without
  // this, the user would have to sign out and back in (Firebase
  // doesn't push claim changes; tokens cache up to 1 hour).
  //
  // `isAdmin` is intentionally NOT in the effect's dep list — including
  // it caused a cycle: every successful role refresh updated isAdmin,
  // which tore down and re-subscribed to the signal listener, which
  // skipped the next signal as "first snapshot", which silently dropped
  // role changes that arrived while the listener was rebooting. Read
  // the latest value through a ref instead so the same subscription
  // survives across role flips.
  const isAdminRef = useRef(isAdmin);
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    let firstSnapshot = true;
    const targetUid = currentUser.uid;
    const ref = doc(db, 'roleSignals', targetUid);

    const unsub = onSnapshot(
      ref,
      async (snap) => {
        if (cancelled) return;
        // Skip initial snapshot — onSnapshot delivers existing state on
        // subscribe, not a change. Without this skip, every login would
        // force-refresh once unnecessarily.
        if (firstSnapshot) {
          firstSnapshot = false;
          return;
        }
        if (!snap.exists()) return;

        // The signal doc changed — admin altered our role. Force-refresh
        // the token to pick up the new custom claim.
        try {
          const resolved = authRef.current;
          if (!resolved) return;
          const liveUser = resolved.auth.currentUser;
          // Defensive: only refresh if we're still the same user.
          if (!liveUser || liveUser.uid !== targetUid) return;

          await liveUser.getIdToken(true); // force refresh
          if (cancelled) return;
          const token = await liveUser.getIdTokenResult();
          if (cancelled) return;
          const nowAdmin = token.claims.role === 'admin';

          // Compare against the signal doc to know which message to show.
          const newRole = (snap.data() as { role?: string })?.role;
          if (nowAdmin !== isAdminRef.current) {
            setIsAdmin(nowAdmin);
            if (newRole === 'admin') {
              toast.success('You have been granted admin access.', { duration: 5000 });
            } else {
              toast.info('Your admin access has been removed.', { duration: 5000 });
            }
          }
        } catch (err) {
          // Best-effort: if refresh fails (network, token-expired), the
          // user keeps their old claim until the next natural refresh
          // (within an hour) or until they sign out + back in. Same
          // failure mode as before this listener existed — no regression.
          console.warn('[AuthProvider] role refresh failed', err);
        }
      },
      (err) => {
        // Permission-denied is expected if the user briefly logs out
        // mid-listener — don't spam the console for that case.
        if ((err as { code?: string })?.code !== 'permission-denied') {
          console.warn('[AuthProvider] roleSignals listener error', err);
        }
      },
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [currentUser]);

  // ── Memoize the context value ───────────────────────────────
  // Without this, every render of AuthProvider would create a fresh
  // object literal — and every consumer of useAuth() (16 components
  // across the app) would re-render on every parent state change,
  // even if their slice of the context didn't change. Combined with
  // the useCallback wrappers above, the value is now stable as long
  // as currentUser / loading / isAdmin haven't changed.
  const startGuestSession = useCallback(async (): Promise<User> => {
    const { auth, mod } = await ensureAuth();
    if (auth.currentUser?.isAnonymous) return auth.currentUser;
    const cred = await mod.signInAnonymously(auth);
    return cred.user;
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      currentUser,
      guestUser,
      startGuestSession,
      loading,
      isAdmin,
      login,
      loginWithGoogle,
      signup,
      logout,
      resetPassword,
    }),
    [
      currentUser,
      guestUser,
      startGuestSession,
      loading,
      isAdmin,
      login,
      loginWithGoogle,
      signup,
      logout,
      resetPassword,
    ],
  );

  const ssrPlaceholder = (window as { __ELE_SSR_ROOT__?: string }).__ELE_SSR_ROOT__;
  return (
    <AuthContext.Provider value={value}>
      {!gated || !loading ? (
        children
      ) : ssrPlaceholder ? (
        // While a signed-in customer's session restores, keep showing what
        // the server painted (the home hero) rather than a blank page.
        <div dangerouslySetInnerHTML={{ __html: ssrPlaceholder }} />
      ) : null}
    </AuthContext.Provider>
  );
}
