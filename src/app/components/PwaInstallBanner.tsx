/**
 * PwaInstallBanner.tsx — Enterprise PWA install prompt
 *
 * Renders the appropriate install UI based on platform:
 *
 *   chromium  →  Bottom banner with a native "Install" button.
 *                Tapping Install triggers the OS-level BeforeInstallPromptEvent.
 *
 *   ios       →  Bottom banner that, when tapped, opens a short modal
 *                with step-by-step instructions for Safari's manual
 *                "Add to Home Screen" flow (iOS has no install event).
 *                Steps:  1. Tap the Share icon (⬆) in Safari's toolbar
 *                        2. Scroll and tap "Add to Home Screen"
 *                        3. Tap "Add" to confirm
 *
 * High-intent gate (applied on top of the hook's canInstall):
 *   • ≥ 2 distinct routes visited this session  (route-depth signal)
 *   • OR cart has at least 1 item               (purchase-intent signal)
 *   Home page with 0 cart items on first visit never shows the banner.
 *
 * Route counting: we hook into useLocation and record each pathname
 * change via recordRouteVisit() — the same sessionStorage key the hook
 * reads, so every navigation is tracked for the life of the tab.
 */

import { useEffect, useState } from 'react';
import { useLocation }         from 'react-router';
import { Download, X, Share, ArrowUpFromLine } from 'lucide-react';
import {
  usePwaInstall,
  recordRouteVisit,
  getRouteCount,
}                              from '@/hooks/usePwaInstall';
import { useCartStore }        from '@/store/cartStore';

import { useT, useTx } from '@/i18n/useT';
// ── Minimum route depth before we show the prompt ────────────────────────────
const MIN_ROUTE_DEPTH = 2;

// ── iOS instruction modal ─────────────────────────────────────────────────────

function IosInstructionModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const tx = useTx();
  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Trap scroll behind modal
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="pwa-ios-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('Install Ele Café on your iPhone or iPad')}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="pwa-ios-modal">
        {/* Header */}
        <div className="pwa-ios-modal-header">
          <strong className="pwa-ios-modal-title">{t('Add to Home Screen')}</strong>
          <button
            type="button"
            className="pwa-install-banner-dismiss"
            onClick={onClose}
            aria-label={t('Close')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p className="pwa-ios-modal-subtitle">
          {tx('Install {app} for fast ordering, offline access, and a home‑screen shortcut — no App Store needed.', { app: <strong>Ele Café</strong> })}
        </p>

        {/* Steps */}
        <ol className="pwa-ios-steps">
          <li className="pwa-ios-step">
            <span className="pwa-ios-step-num" aria-hidden="true">1</span>
            <span className="pwa-ios-step-text">
              {tx("Tap the {icon} {share} icon in Safari's toolbar", {
                icon: <span className="pwa-ios-share-badge" aria-label={t('Share button')}><ArrowUpFromLine size={14} aria-hidden="true" /></span>,
                share: <strong>{t('Share')}</strong>,
              })}
              <span className="pwa-ios-step-hint">
                {t('(the box with the upward arrow — at the bottom of your screen)')}
              </span>
            </span>
          </li>
          <li className="pwa-ios-step">
            <span className="pwa-ios-step-num" aria-hidden="true">2</span>
            <span className="pwa-ios-step-text">
              {tx('Scroll down and tap {action}', { action: <strong>{t('"Add to Home Screen"')}</strong> })}
            </span>
          </li>
          <li className="pwa-ios-step">
            <span className="pwa-ios-step-num" aria-hidden="true">3</span>
            <span className="pwa-ios-step-text">
              {tx('Tap {action} in the top-right corner to confirm', { action: <strong>{t('"Add"')}</strong> })}
            </span>
          </li>
        </ol>

        <button
          type="button"
          className="pwa-ios-done-btn"
          onClick={onClose}
        >
          {t('Got it')}
        </button>
      </div>
    </div>
  );
}

// ── Main banner ───────────────────────────────────────────────────────────────

export function PwaInstallBanner() {
  const t = useT();
  const { canInstall, platform, promptInstall, dismiss } = usePwaInstall();
  const location    = useLocation();
  const itemsInCart = useCartStore(s => s.totalItems);
  const [busy,        setBusy]        = useState(false);
  const [iosOpen,     setIosOpen]     = useState(false);
  const [routeCount,  setRouteCount]  = useState(getRouteCount);

  // Track every route change for high-intent gating
  useEffect(() => {
    const count = recordRouteVisit(location.pathname);
    setRouteCount(count);
  }, [location.pathname]);

  // Nothing to show if hook says no or platform is unsupported
  if (!canInstall || platform === 'unsupported') return null;

  // ── High-intent gate ──────────────────────────────────────────────────────
  const deepEnough   = routeCount >= MIN_ROUTE_DEPTH;
  const hasCartItems = itemsInCart > 0;
  if (!deepEnough && !hasCartItems) return null;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const onChromiumInstall = async () => {
    setBusy(true);
    try { await promptInstall(); }
    finally { setBusy(false); }
  };

  const onIosInstall = () => {
    promptInstall(); // fires analytics
    setIosOpen(true);
  };

  const onDismiss = () => {
    dismiss();
    setIosOpen(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div
        className="pwa-install-banner"
        role="region"
        aria-label={t('Install Ele Café app')}
      >
        <div className="pwa-install-banner-inner">
          <div className="pwa-install-banner-text">
            <strong className="pwa-install-banner-title">{t('Install Ele Café')}</strong>
            <span className="pwa-install-banner-subtitle">
              {platform === 'ios'
                ? t('Add to your home screen — no App Store needed')
                : t('Faster ordering · works offline · home-screen shortcut')}
            </span>
          </div>

          <div className="pwa-install-banner-actions">
            {platform === 'ios' ? (
              <button
                type="button"
                className="pwa-install-banner-cta"
                onClick={onIosInstall}
                aria-haspopup="dialog"
              >
                <Share size={16} aria-hidden="true" />
                <span>{t('How to install')}</span>
              </button>
            ) : (
              <button
                type="button"
                className="pwa-install-banner-cta"
                onClick={onChromiumInstall}
                disabled={busy}
                aria-busy={busy || undefined}
              >
                <Download size={16} aria-hidden="true" />
                <span>{busy ? t('Installing…') : t('Install')}</span>
              </button>
            )}

            <button
              type="button"
              className="pwa-install-banner-dismiss"
              onClick={onDismiss}
              aria-label={t('Dismiss install prompt')}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* iOS step-by-step modal */}
      {iosOpen && <IosInstructionModal onClose={() => setIosOpen(false)} />}
    </>
  );
}
