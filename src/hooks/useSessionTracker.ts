/**
 * useSessionTracker — tracks active browsing time + auto-logout on idle.
 *
 * Mounted once at AppShell level. While a user is signed in:
 *  - Counts active time (tab visible AND recent user input)
 *  - Auto-signs them out after 60s of inactivity in the foreground
 *  - Flushes accumulated time to /users/{uid} every 30s + on page-unload
 *
 * Per-user fields written:
 *   totalActiveMs:        cumulative across all sessions (FieldValue.increment)
 *   lastSessionMs:        most recent session length (set, not incremented)
 *   lastSessionEndedAt:   server timestamp
 *
 * "Active" = tab is visible AND user has interacted within IDLE_TIMEOUT_MS.
 * If the tab is hidden, the inactivity timer pauses (so a quick context-
 * switch doesn't kick the user out). When visible again, it resumes from
 * its current value rather than resetting.
 *
 * For analytics integrity: a malicious user inflating their own active
 * time only inflates THEIR OWN metric (no cross-user impact). The /users
 * rule allows owner writes already. Acceptable risk for this use case.
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { doc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

// ── Tunables ───────────────────────────────────────────────────────────────
/** Auto-logout after this many ms of foreground inactivity.
 *
 * 30 minutes is a balance for an e-commerce site: long enough that a
 * customer reading product descriptions or debating gift options
 * doesn't get kicked mid-flow, short enough that a session on a
 * shared / public computer doesn't leak indefinitely.
 *
 * Was 60_000 (1 minute) which was wrong — customers filling out
 * checkout forms, reading tea profiles, or browsing the gift builder
 * routinely pause for over a minute. Real users were getting signed
 * out mid-checkout. Banking apps use 5-10 min; e-commerce typically
 * doesn't auto-logout at all. 30min is conservative for retail. */
const IDLE_TIMEOUT_MS = 30 * 60_000; // 30 minutes

/** How often to flush accumulated time to Firestore during active sessions. */
const FLUSH_INTERVAL_MS = 30_000;   // 30 seconds — bounds write rate to 2/min

/** Max ms to accept between activity ticks before treating the gap as idle.
 *  Prevents counting time when a tab was throttled or backgrounded. */
const MAX_TICK_GAP_MS = 5_000;

/** Throttle activity-event handler so mousemove (which fires ~60/s) doesn't
 *  hammer the timer reset on every frame. */
const ACTIVITY_THROTTLE_MS = 250;

// Events that count as "user is here". Keep this list narrow — we don't
// want timer events or visibility changes resetting the idle timer.
const ACTIVITY_EVENTS = [
  'mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'wheel',
] as const;

export function useSessionTracker() {
  const { pathname } = useLocation();
  const { currentUser, logout } = useAuth();

  // Refs so the listener callbacks always read latest values without
  // causing the effect to re-subscribe on every state tick.
  const sessionStartRef    = useRef<number>(0);   // ms epoch when session began
  const accumulatedMsRef   = useRef<number>(0);   // active ms not yet flushed to Firestore
  const lastFlushedTotalRef = useRef<number>(0);  // most recent value sent for lastSessionMs
  const lastActivityRef    = useRef<number>(0);   // ms epoch of last interaction
  const lastTickRef        = useRef<number>(0);   // ms epoch of last accumulator tick
  const isVisibleRef       = useRef<boolean>(true);
  const lastActivityEventRef = useRef<number>(0); // throttle ref

  useEffect(() => {
    const shouldTrack = /^(?:\/(?:account|orders|checkout|inventory))(?:\/|$)/.test(pathname);
    if (!shouldTrack) return;

    if (!currentUser) return;

    // Snapshot uid once — if the user changes, the effect re-runs and
    // flushes the previous user's session before starting a new one.
    const uid = currentUser.uid;
    sessionStartRef.current     = Date.now();
    accumulatedMsRef.current    = 0;
    lastFlushedTotalRef.current = 0;
    lastActivityRef.current     = Date.now();
    lastTickRef.current         = Date.now();
    isVisibleRef.current        = !document.hidden;

    // ── Helpers ──────────────────────────────────────────────────────────────
    /** Add elapsed-since-last-tick to the active-time accumulator,
     *  but only if the tab is visible AND we've heard from the user
     *  recently. Caps the gap at MAX_TICK_GAP_MS to prevent inflating
     *  totals from background-throttled timers. */
    const tick = () => {
      const now = Date.now();
      const gap = now - lastTickRef.current;
      lastTickRef.current = now;
      if (!isVisibleRef.current) return;
      const sinceActivity = now - lastActivityRef.current;
      if (sinceActivity > IDLE_TIMEOUT_MS) return; // already idle
      const safeGap = Math.min(gap, MAX_TICK_GAP_MS);
      accumulatedMsRef.current += safeGap;
    };

    /** Push the accumulator to Firestore. Called on the periodic
     *  interval, on logout, and on page-unload. */
    const flush = async (final: boolean) => {
      tick(); // capture any pending time before flushing
      const ms = accumulatedMsRef.current;
      if (ms <= 0) return;
      accumulatedMsRef.current = 0;
      lastFlushedTotalRef.current += ms;
      try {
        await updateDoc(doc(db, 'users', uid), {
          totalActiveMs:      increment(ms),
          lastSessionMs:      lastFlushedTotalRef.current,
          // Only stamp lastSessionEndedAt when this flush is the FINAL
          // one (page hide / unmount). Periodic mid-session flushes
          // should leave the field alone — otherwise every 30-second
          // tick rewrites it as "session ended now", and nothing ever
          // shows as currently-active in admin's customer list.
          lastSessionEndedAt: final ? serverTimestamp() : null,
        });
      } catch (err) {
        // Network failure / offline — re-add to accumulator so the next
        // flush gets it. Bounded by FLUSH_INTERVAL_MS, so worst-case
        // we lose 30 seconds of activity on a sustained outage.
        accumulatedMsRef.current = ms;
        lastFlushedTotalRef.current -= ms;
        console.warn('[sessionTracker] flush failed:', err);
      }
    };

    /** Auto-logout when foreground inactivity exceeds the idle threshold.
     *  Logout itself will trigger this effect's cleanup via the auth-
     *  state change, which will run the final flush. */
    const checkIdle = () => {
      if (!isVisibleRef.current) return; // tab hidden → pause inactivity, don't logout
      if (Date.now() - lastActivityRef.current >= IDLE_TIMEOUT_MS) {
        flush(true).finally(() => {
          // Best-effort logout. If it fails (rare), the next periodic
          // tick will retry on the next idle expiry.
          logout().catch(err => console.warn('[sessionTracker] auto-logout failed:', err));
        });
      }
    };

    // ── Event listeners ─────────────────────────────────────────────────────
    const onActivity = () => {
      const now = Date.now();
      // Throttle — ACTIVITY_EVENTS includes mousemove which fires ~60/s.
      if (now - lastActivityEventRef.current < ACTIVITY_THROTTLE_MS) return;
      lastActivityEventRef.current = now;

      // The activity itself bridges any "gap" we'd otherwise have skipped.
      // Add the gap (capped) to the accumulator before resetting the
      // last-activity stamp — preserves accuracy across short pauses.
      tick();
      lastActivityRef.current = now;
    };

    const onVisibility = () => {
      const becomingVisible = !document.hidden;
      // When transitioning hidden → visible, we don't credit the hidden
      // window. Reset the tick reference so the next tick measures only
      // foreground time.
      if (becomingVisible) {
        lastTickRef.current    = Date.now();
        lastActivityRef.current = Date.now(); // treat re-show as activity
      } else {
        tick(); // capture any pending time before going hidden
      }
      isVisibleRef.current = becomingVisible;
    };

    /** pagehide is the modern, bfcache-aware unload event. Fires on
     *  navigation, tab close, and (per spec) before bfcache freeze.
     *  beforeunload is unreliable on iOS Safari and can cancel bfcache.
     *  We ALSO listen to visibilitychange → hidden as a backup since
     *  pagehide doesn't always fire on mobile background-tab kills. */
    const onPageHide = () => {
      // updateDoc returns a Promise but most browsers won't await it on
      // pagehide. Firestore SDK queues the write internally and best-
      // efforts the network send via fetch keepalive. If it fails, the
      // 30s periodic flush above already captured most of the session.
      flush(true);
    };

    // Attach activity listeners as passive (no preventDefault needed).
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    // Periodic timers
    const flushTimer = setInterval(() => flush(false), FLUSH_INTERVAL_MS);
    // Check idle every second so we react within ~1s of the threshold.
    const idleTimer  = setInterval(checkIdle, 1_000);

    // ── Cleanup ─────────────────────────────────────────────────────────────
    return () => {
      // Final flush on logout/user-switch. Fire-and-forget — the user
      // may navigate away or sign out before this resolves.
      flush(true);
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity);
      }
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      clearInterval(flushTimer);
      clearInterval(idleTimer);
    };
  }, [pathname, currentUser, logout]);
}
