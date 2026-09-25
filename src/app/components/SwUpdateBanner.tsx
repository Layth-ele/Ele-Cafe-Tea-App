/**
 * SwUpdateBanner.tsx — Service Worker lifecycle management
 *
 * Uses VitePWA's `useRegisterSW` hook to surface two distinct SW events
 * as non-intrusive Sonner toasts:
 *
 *   1. offlineReady — SW has finished precaching all assets on first install.
 *      User can now use the app offline. Toast auto-dismisses in 4 s.
 *
 *   2. needRefresh — A new SW is waiting in the background (new deploy is
 *      available). Persistent toast with an "Update now" action that calls
 *      updateServiceWorker(true) → SW skips waiting → page reloads fresh.
 *
 * Why this is the right update pattern for a checkout-bearing app:
 *   • registerType: 'autoUpdate' + skipWaiting: true would activate the new
 *     SW immediately, potentially killing an in-flight checkout or auth flow.
 *   • registerType: 'prompt' lets the SW sit in the WAITING state until the
 *     user explicitly triggers the update — or until they close all tabs.
 *     This banner gives them that explicit trigger in a low-friction way.
 *
 * Periodic update check (long-lived tabs):
 *   When vite-plugin-pwa registers the SW, we set up an hourly interval
 *   that calls registration.update(). Without this, a tab open for hours
 *   would never discover that a new SW is available until the user navigated
 *   to a new page (which triggers a SW update check automatically via the
 *   browser). Hourly checks reduce the gap on long sessions.
 *
 * Analytics:
 *   Fires CustomEvents on window so any analytics layer (RUM, Sentry,
 *   Google Analytics) can track SW lifecycle without coupling to a specific
 *   analytics SDK. The events are:
 *     'sw:offline_ready'   — first install complete, app works offline
 *     'sw:update_available' — new SW waiting to activate
 *     'sw:update_applied'   — user clicked "Update now" and page is reloading
 *     'sw:update_dismissed' — user dismissed the update toast
 *
 * Placement: rendered inside AppShell, AFTER the Toaster — so Sonner is
 * already initialised when the toasts fire. Import order in App.tsx matters.
 */

import { useEffect, useRef }  from 'react';
import { useRegisterSW }      from 'virtual:pwa-register/react';
import { toast }              from 'sonner';

import { tNow } from '@/i18n/useT';
// ── Analytics helper ──────────────────────────────────────────────────────────

function fireSwEvent(name: string, detail: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(`sw:${name}`, { detail, bubbles: false }));
  } catch (err) {
    console.warn('[SwUpdateBanner] Failed to dispatch SW event:', err);
  }
}

// ── How often to proactively check for SW updates on long-lived tabs ─────────
const UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// ── Component ─────────────────────────────────────────────────────────────────

export function SwUpdateBanner() {
  // Track whether we've already shown the update toast to avoid
  // duplicate toasts if needRefresh flips true more than once.
  const updateToastId = useRef<string | number | null>(null);
  const offlineToastShown = useRef(false);

  const {
    needRefresh:  [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    // onRegistered fires once after the SW is successfully registered.
    // We use it to set up the hourly update-check interval.
    onRegistered(registration) {
      if (!registration) return;
      // Kick off an initial update check right after registration, then
      // on a recurring hourly interval for tabs that stay open a long time.
      registration.update().catch(() => { /* non-critical — no network */ });
      setInterval(() => {
        registration.update().catch(() => { /* non-critical */ });
      }, UPDATE_INTERVAL_MS);
    },
    onRegisterError(err) {
      // SW registration failure is non-fatal — the app still works, it just
      // won't have offline caching. Log at warn level (not error) so it
      // doesn't fire Sentry noise on browsers that block SW (private mode,
      // some enterprise proxies).
      console.warn('[SwUpdateBanner] SW registration failed:', err);
    },
  });

  // ── "Offline ready" toast (first install complete) ─────────────────────────
  useEffect(() => {
    if (!offlineReady || offlineToastShown.current) return;
    offlineToastShown.current = true;
    fireSwEvent('offline_ready');
    toast.success(tNow('Ele Café works offline'), {
      description: tNow('Pages and teas are saved to your device.'),
      duration: 4_000,
    });
  }, [offlineReady]);

  // ── "Update available" toast (new SW waiting) ──────────────────────────────
  useEffect(() => {
    if (!needRefresh) return;
    // Don't stack a second toast if one is already showing.
    if (updateToastId.current !== null) return;

    fireSwEvent('update_available');

    updateToastId.current = toast(tNow('Update available'), {
      description: tNow('A new version of Ele Café is ready.'),
      // Persist until the user acts — don't auto-dismiss a version prompt.
      duration: Infinity,
      action: {
        label: tNow('Update now'),
        onClick: () => {
          fireSwEvent('update_applied');
          updateToastId.current = null;
          // true = reload the page after the SW activates.
          updateServiceWorker(true);
        },
      },
      onDismiss: () => {
        fireSwEvent('update_dismissed');
        updateToastId.current = null;
      },
    });
  }, [needRefresh, updateServiceWorker]);

  // Render nothing — all output goes through Sonner toasts.
  return null;
}
