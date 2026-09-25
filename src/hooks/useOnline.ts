/**
 * useOnline.ts — Phase 5 offline detection
 *
 * Subscribes to the browser's online/offline events and returns the
 * current state. Used by <OfflineBanner> to show a top-of-page
 * indicator when the user loses connection, and by anywhere else
 * that needs to gate behavior on connectivity (e.g. disabling
 * "place order" while offline).
 *
 * Why a hook (not a context):
 *   - Re-renders only the subscribers; a context would re-render
 *     every consumer of the context on every status flip.
 *   - Simpler API — no provider needed, just call the hook.
 *   - The browser's online/offline events are already a global
 *     bus; wrapping them in context would just be ceremony.
 *
 * Honest caveats about navigator.onLine:
 *   - It's notoriously unreliable. The browser reports true if the
 *     OS reports a network interface; that interface might be a
 *     captive-portal Wi-Fi that can't actually reach the public
 *     internet, or a corporate VPN that can reach intranet but
 *     not Firebase. The hook is a HINT, not a guarantee.
 *   - Server-Sent Events / WebSocket failures are a more reliable
 *     "actually offline" signal but require infra we don't have.
 *   - Treat the banner as informational; don't gate critical flows
 *     on it. Optimistic mutations + retry-on-error remains the
 *     real solution.
 */
import { useEffect, useState } from 'react';

export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() => {
    // SSR-safe default: assume online. The hook re-syncs in
    // useEffect when it actually mounts on the client.
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onOnline  = () => setOnline(true);
    const onOffline = () => setOnline(false);

    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);

    // Re-sync once on mount in case navigator.onLine changed
    // between the initial render and the effect (rare but possible
    // — e.g. tab restored from a suspended state on a metro train).
    setOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return online;
}
