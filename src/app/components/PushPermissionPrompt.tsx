/**
 * PushPermissionPrompt.tsx — Non-intrusive Web Push permission request.
 *
 * RULE: NEVER ask for push permission on page load.
 * Chrome's "quiet UI" (grey bell, no dialog) kicks in when a site has a
 * high block rate. Asking immediately on first visit tanks that rate.
 *
 * This component shows a permission prompt only when ALL of these are true:
 *   1. Push is supported (browser + VAPID key configured)
 *   2. Permission hasn't been decided yet (state === 'default')
 *   3. The user has completed a qualifying action (order placed, or
 *      visited 4+ routes in the session — high-intent signal)
 *   4. The user is signed in (push only makes sense for a known account)
 *   5. Not within an escalating dismiss cooldown (same as install banner)
 *
 * UX: a branded bottom banner (same visual language as PwaInstallBanner)
 * with a clear value proposition ("Get order updates even when the app
 * is closed") and an explicit opt-in button — NOT the raw browser dialog
 * as the first touch.
 *
 * When the user clicks "Enable":
 *   1. We call Notification.requestPermission() → triggers the browser dialog
 *   2. On grant → the usePushNotifications hook acquires + stores the token
 *   3. On deny → we record a dismissal with cooldown (same keys as install)
 *
 * Cooldown table (independent of install banner, separate storage keys):
 *   Dismiss 1 → 14 days
 *   Dismiss 2 → 60 days
 *   Dismiss 3+ → 180 days (effectively permanent for most users)
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocation }                        from 'react-router';
import { Bell, X }                            from 'lucide-react';
import { useAuth }                            from '@/contexts/AuthContext';
import {
  usePushNotifications,
  canUsePush,
  type PushPermissionState,
}                                             from '@/hooks/usePushNotifications';
import { recordRouteVisit, getRouteCount }    from '@/hooks/usePwaInstall';

import { useT } from '@/i18n/useT';
// ── Storage keys (separate namespace from install banner) ─────────────────────

const KEY_DISMISSED_AT  = 'elePushDismissedAt';
const KEY_DISMISS_COUNT = 'elePushDismissCount';

// ── Dismiss cooldown table ─────────────────────────────────────────────────────

const COOLDOWN_DAYS: Record<number, number> = { 1: 14, 2: 60 };
const COOLDOWN_FALLBACK = 180;

function getCooldownDays(count: number): number {
  return COOLDOWN_DAYS[count] ?? COOLDOWN_FALLBACK;
}

function withinCooldown(): boolean {
  try {
    const raw = localStorage.getItem(KEY_DISMISSED_AT);
    if (!raw) return false;
    const ts = Date.parse(raw);
    if (!Number.isFinite(ts)) return false;
    const count   = parseInt(localStorage.getItem(KEY_DISMISS_COUNT) ?? '0', 10) || 0;
    const elapsed = (Date.now() - ts) / 86_400_000;
    return elapsed < getCooldownDays(count);
  } catch (err) {
    console.warn('[PushPermissionPrompt] Failed to read dismiss cooldown:', err);
    return false;
  }
}

function recordDismissal(): void {
  try {
    const count = (parseInt(localStorage.getItem(KEY_DISMISS_COUNT) ?? '0', 10) || 0) + 1;
    localStorage.setItem(KEY_DISMISS_COUNT, String(count));
    localStorage.setItem(KEY_DISMISSED_AT, new Date().toISOString());
  } catch (err) {
    console.warn('[PushPermissionPrompt] Failed to persist dismissal cooldown:', err);
  }
}

// ── Min route depth before showing prompt ─────────────────────────────────────
const MIN_ROUTES = 4;

// ── Component ─────────────────────────────────────────────────────────────────

export function PushPermissionPrompt() {
  const t = useT();
  const { currentUser }                               = useAuth();
  const { permissionState, requestPermission }        = usePushNotifications();
  const location                                      = useLocation();
  const [routeCount, setRouteCount]                   = useState(getRouteCount);
  const [visible, setVisible]                         = useState(false);
  const [requesting, setRequesting]                   = useState(false);

  // Track route visits (shared key with PwaInstallBanner)
  useEffect(() => {
    const count = recordRouteVisit(location.pathname);
    setRouteCount(count);
  }, [location.pathname]);

  // Decide whether to show
  useEffect(() => {
    if (!currentUser)                          { setVisible(false); return; }
    if (!canUsePush())                    { setVisible(false); return; }
    if (permissionState !== 'default')         { setVisible(false); return; }
    if (withinCooldown())                      { setVisible(false); return; }
    if (routeCount < MIN_ROUTES)               { setVisible(false); return; }
    setVisible(true);
  }, [currentUser, permissionState, routeCount]);

  const handleEnable = useCallback(async () => {
    setRequesting(true);
    try {
      const result: PushPermissionState = await requestPermission();
      if (result !== 'granted') {
        recordDismissal();
      }
    } finally {
      setRequesting(false);
      setVisible(false);
    }
  }, [requestPermission]);

  const handleDismiss = useCallback(() => {
    recordDismissal();
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="push-prompt-banner"
      role="region"
      aria-label={t('Enable push notifications')}
    >
      <div className="push-prompt-inner">
        <span className="push-prompt-icon" aria-hidden="true">
          <Bell size={18} />
        </span>

        <div className="push-prompt-text">
          <strong className="push-prompt-title">{t('Stay updated on your orders')}</strong>
          <span className="push-prompt-subtitle">
            {t('Get order updates & shipping alerts even when the app is closed')}
          </span>
        </div>

        <div className="push-prompt-actions">
          <button
            type="button"
            className="push-prompt-cta"
            onClick={handleEnable}
            disabled={requesting}
            aria-busy={requesting || undefined}
          >
            {requesting ? t('Setting up…') : t('Enable')}
          </button>

          <button
            type="button"
            className="pwa-install-banner-dismiss"
            onClick={handleDismiss}
            aria-label={t('Dismiss notification prompt')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
