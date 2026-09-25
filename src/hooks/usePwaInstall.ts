/**
 * usePwaInstall.ts — Enterprise PWA install manager
 *
 * Cross-platform install lifecycle for all major browsers:
 *
 *   Platform       Browser              Mechanism
 *   ─────────────  ───────────────────  ─────────────────────────────────────
 *   chromium       Chrome, Edge,        beforeinstallprompt → native prompt
 *                  Samsung Browser,
 *                  Opera (Android+desk)
 *   ios            Safari on iPhone /   Manual "Add to Home Screen" guidance
 *                  iPad (iOS 14.8+)     (no event — browser restriction)
 *   unsupported    Firefox, Safari desk Already installed / save-data / SSR
 *
 * High-intent gating (both platforms):
 *   ✓ At least 2 distinct routes visited this session
 *   ✓ Not the home page unless cart has items
 *   ✓ Not already installed (standalone mode OR accepted flag)
 *   ✓ Not within escalating cooldown window
 *
 * Escalating dismiss cooldowns:
 *   Dismiss 1  →  7 days
 *   Dismiss 2  →  30 days
 *   Dismiss 3+ →  90 days  (effectively permanent for most users)
 *
 * Analytics (fire-and-forget CustomEvents on window):
 *   'pwa:prompt_available'  — { platform }
 *   'pwa:prompt_shown'      — { platform }
 *   'pwa:install_accepted'  — { platform }
 *   'pwa:install_declined'  — { platform, dismissCount }
 *   'pwa:dismissed'         — { platform, dismissCount }
 *   'pwa:already_installed' — { via: 'standalone' | 'navigator' | 'flag' }
 *
 * Storage:
 *   localStorage:
 *     eleInstallDismissedAt    — ISO date of last dismissal
 *     eleInstallDismissCount   — total number of dismissals (int)
 *     eleInstalled             — '1' once confirmed installed
 *   sessionStorage:
 *     eleRoutesSeen            — JSON string[] of distinct pathnames this session
 */

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type InstallPlatform = 'chromium' | 'ios' | 'unsupported';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export interface PwaInstallHook {
  /** True when we should show install prompt UI for this platform. */
  canInstall: boolean;
  /** Which install flow is active — determines which UI the banner shows. */
  platform: InstallPlatform;
  /**
   * Chromium: triggers the OS-native install prompt. Resolves to true on accept.
   * iOS: no-op (the banner shows manual instructions — returns false).
   */
  promptInstall: () => Promise<boolean>;
  /** Record a dismissal and apply escalating cooldown. */
  dismiss: () => void;
}

// ── Storage keys ──────────────────────────────────────────────────────────────

const KEY_DISMISSED_AT  = 'eleInstallDismissedAt';
const KEY_DISMISS_COUNT = 'eleInstallDismissCount';
const KEY_INSTALLED     = 'eleInstalled';
const KEY_ROUTES_SEEN   = 'eleRoutesSeen';

// ── Escalating cooldown table ─────────────────────────────────────────────────

const COOLDOWN_DAYS: Record<number, number> = {
  1: 7,
  2: 30,
};
const COOLDOWN_FALLBACK = 90; // dismiss 3+

function getCooldownDays(count: number): number {
  return COOLDOWN_DAYS[count] ?? COOLDOWN_FALLBACK;
}

// ── Safe storage helpers ──────────────────────────────────────────────────────

function safeGet(store: Storage, key: string): string | null {
  try { return store.getItem(key); } catch (err) {
    console.warn('[usePwaInstall] storage read failed:', err);
    return null;
  }
}

function safeSet(store: Storage, key: string, val: string): void {
  try { store.setItem(key, val); } catch (err) {
    console.warn('[usePwaInstall] storage write failed:', err);
  }
}

// ── State predicates ──────────────────────────────────────────────────────────

function alreadyInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  if (safeGet(localStorage, KEY_INSTALLED) === '1') return true;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  if ((navigator as unknown as Record<string, unknown>).standalone === true) return true;
  return false;
}

function getDismissCount(): number {
  return parseInt(safeGet(localStorage, KEY_DISMISS_COUNT) ?? '0', 10) || 0;
}

function withinCooldown(): boolean {
  const raw = safeGet(localStorage, KEY_DISMISSED_AT);
  if (!raw) return false;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return false;
  const elapsed = (Date.now() - ts) / 86_400_000;
  return elapsed < getCooldownDays(getDismissCount());
}

// ── Platform detection ────────────────────────────────────────────────────────

export function detectPlatform(): InstallPlatform {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'unsupported';
  }
  const ua = navigator.userAgent;
  const isIos =
    /iphone|ipod/i.test(ua) ||
    /ipad/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIos) {
    if (alreadyInstalled()) return 'unsupported';
    return 'ios';
  }
  if (/chrome|chromium|crios|edg\/|samsung|opr\//i.test(ua)) {
    if (alreadyInstalled()) return 'unsupported';
    return 'chromium';
  }
  return 'unsupported';
}

// ── Route-visit tracker ───────────────────────────────────────────────────────

/**
 * Record a pathname as visited this session. Returns the total number of
 * distinct paths seen. Safe to call on every route change (idempotent).
 */
export function recordRouteVisit(pathname: string): number {
  try {
    const raw = sessionStorage.getItem(KEY_ROUTES_SEEN);
    const seen: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!seen.includes(pathname)) {
      seen.push(pathname);
      sessionStorage.setItem(KEY_ROUTES_SEEN, JSON.stringify(seen));
    }
    return seen.length;
  } catch (err) {
    console.warn('[usePwaInstall] route tracking failed:', err);
    return 0;
  }
}

export function getRouteCount(): number {
  try {
    const raw = sessionStorage.getItem(KEY_ROUTES_SEEN);
    if (!raw) return 0;
    return (JSON.parse(raw) as string[]).length;
  } catch (err) {
    console.warn('[usePwaInstall] route count read failed:', err);
    return 0;
  }
}

// ── Analytics emitter ─────────────────────────────────────────────────────────

function fireAnalytics(name: string, detail: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent(`pwa:${name}`, { detail, bubbles: false, cancelable: false }),
    );
  } catch (err) {
    console.warn('[usePwaInstall] analytics dispatch failed:', err);
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePwaInstall(): PwaInstallHook {
  const [platform]                  = useState<InstallPlatform>(detectPlatform);
  const [deferred, setDeferred]     = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    if (platform === 'unsupported') return;
    if (alreadyInstalled()) {
      fireAnalytics('already_installed', { via: 'flag' });
      return;
    }
    if (withinCooldown()) return;

    // iOS — optimistically allow; banner enforces its own route-count gate
    if (platform === 'ios') {
      setCanInstall(true);
      return;
    }

    // Chromium — wait for the browser event
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setCanInstall(true);
      fireAnalytics('prompt_available', { platform: 'chromium' });
    };

    const onAppInstalled = () => {
      safeSet(localStorage, KEY_INSTALLED, '1');
      setCanInstall(false);
      setDeferred(null);
      fireAnalytics('install_accepted', { platform: 'chromium', via: 'appinstalled_event' });
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [platform]);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (platform === 'ios') {
      fireAnalytics('prompt_shown', { platform: 'ios' });
      return false;
    }
    if (!deferred) return false;

    fireAnalytics('prompt_shown', { platform: 'chromium' });
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setDeferred(null);
      setCanInstall(false);
      if (outcome === 'accepted') {
        safeSet(localStorage, KEY_INSTALLED, '1');
        fireAnalytics('install_accepted', { platform: 'chromium' });
        return true;
      }
      const count = getDismissCount() + 1;
      safeSet(localStorage, KEY_DISMISS_COUNT, String(count));
      safeSet(localStorage, KEY_DISMISSED_AT, new Date().toISOString());
      fireAnalytics('install_declined', { platform: 'chromium', dismissCount: count });
      return false;
    } catch (err) {
      console.warn('[usePwaInstall] install prompt failed:', err);
      return false;
    }
  }, [deferred, platform]);

  const dismiss = useCallback((): void => {
    const count = getDismissCount() + 1;
    safeSet(localStorage, KEY_DISMISS_COUNT, String(count));
    safeSet(localStorage, KEY_DISMISSED_AT, new Date().toISOString());
    setCanInstall(false);
    setDeferred(null);
    fireAnalytics('dismissed', { platform, dismissCount: count });
  }, [platform]);

  return { canInstall, platform, promptInstall, dismiss };
}
