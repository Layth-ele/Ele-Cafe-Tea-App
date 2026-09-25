/**
 * chunkRecovery — recover a long-lived tab after a new deploy.
 *
 * An open tab keeps the OLD build's file names. After a deploy those JS /
 * CSS chunks no longer exist, so the next lazy import fails ("Failed to
 * fetch dynamically imported module", "Unable to preload CSS for …", a
 * MIME-type error when the SPA fallback returns HTML for a missing .js).
 * The cure is a fresh reload that fetches the new shell.
 *
 * Used by the global listeners in main.tsx and by ErrorBoundary so both
 * detect the same errors and share one loop guard.
 */

const RELOAD_AT_KEY = 'ele:chunkReloadAt';
/** A second stale-bundle failure within this window means the fresh
 *  build itself is broken — stop auto-reloading to avoid a loop. Outside
 *  it (e.g. another deploy later in the same session) reload again. */
const LOOP_WINDOW_MS = 60_000;

export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = typeof err === 'string'
    ? err
    : `${(err as { message?: string }).message ?? ''} ${(err as { name?: string }).name ?? ''}`;
  const m = msg.toLowerCase();
  return (
    m.includes('failed to fetch dynamically imported module') ||   // Chrome
    m.includes('error loading dynamically imported module') ||     // Firefox
    m.includes('importing a module script failed') ||              // Safari
    m.includes('unable to preload css') ||                         // Vite CSS chunk
    m.includes('loading chunk') ||
    m.includes('chunkloaderror') ||
    m.includes('expected a javascript') ||                          // MIME: got HTML
    (m.includes('mime type') && m.includes('text/html'))
  );
}

/** True (and records the attempt) unless we already auto-reloaded within
 *  the loop window. */
export function claimAutoReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_AT_KEY) || 0);
    if (last && Date.now() - last < LOOP_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
  } catch {
    // Storage blocked (private mode): allow the reload; worst case the
    // user sees the fallback UI after a second failure.
  }
  return true;
}

/** Unregister the service worker, wipe its caches, and hard-reload with a
 *  cache-busting query so neither the SW nor the HTTP cache serves the
 *  stale shell again. */
export async function purgeAndReload(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (e) { console.warn('[chunkRecovery] SW unregister failed:', e); }
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) { console.warn('[chunkRecovery] cache wipe failed:', e); }
  const url = new URL(window.location.href);
  url.searchParams.set('_freshReload', String(Date.now()));
  window.location.replace(url.toString());
}

/** Auto-recover once per loop window; returns whether a reload started. */
export function recoverFromStaleBundle(): boolean {
  if (!claimAutoReload()) return false;
  void purgeAndReload();
  return true;
}
