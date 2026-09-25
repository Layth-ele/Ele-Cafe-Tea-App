/**
 * WelcomeCreditModal — Celebratory modal that announces the welcome
 * credit bonus to new users.
 *
 * The credit is granted server-side by the onNewUser Cloud Function
 * which writes a `customer_welcome_bonus` notification. This component
 * watches the NotificationContext, detects that notification, and
 * shows a fancy modal with confetti animation. localStorage tracks
 * which uids have already seen the modal so it fires exactly once
 * per user.
 *
 * Mounted at AppShell level so it can fire from any route — typically
 * the user lands on the homepage after signup and the modal pops
 * within ~2s of the Cloud Function completing.
 */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Sparkles, Gift, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { ROUTES } from '@/lib/routes';
import { useCreditConfig } from '@/hooks/useCreditConfig';
import { useSettings } from '@/hooks/useSettings';
import { WELCOME_BONUS_POINTS } from '@/schemas/credit.schema';
import { isInventoryEmail } from '@/lib/inventoryAccount';

import { useT, useTx } from '@/i18n/useT';
import { formatMoney, formatMoneyShort } from '@/lib/money';
const SHOWN_KEY_PREFIX = 'ele:welcome-modal-shown:';

// R3 file2 Bug #18: each signup wrote a permanent localStorage key
// `ele:welcome-modal-shown:<uid>`. Logout doesn't clear them, account
// deletion doesn't clear them, and on a shared/kiosk browser the keys
// accumulate forever. We now stamp each entry with the current
// timestamp on write, and prune entries older than 180 days at module
// load time. The dedup window of 6 months is well past any reasonable
// "did the user dismiss the modal yet" need — by then the welcome
// notification itself is long gone from the bell.
const SHOWN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

function pruneStaleShownKeys(): void {
  if (typeof window === 'undefined') return;
  try {
    const cutoff = Date.now() - SHOWN_TTL_MS;
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(SHOWN_KEY_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      // Pre-fix entries had value '1'. Treat any non-numeric value as
      // legacy and prune it on first encounter — the user's notification
      // is already cleared from the bell by the markAsRead path.
      const ts = raw ? parseInt(raw, 10) : 0;
      if (!Number.isFinite(ts) || ts === 0 || ts < cutoff) {
        toDelete.push(key);
      }
    }
    for (const k of toDelete) localStorage.removeItem(k);
  } catch (err) {
    console.warn('[WelcomeCreditModal] Failed to prune stale shown keys:', err);
  }
}
// Run once when the module loads. Safe under SSR via the typeof guard.
pruneStaleShownKeys();

export function WelcomeCreditModal() {
  const t = useT();
  const tx = useTx();
  const { currentUser, isAdmin } = useAuth();
  const { notifications, markAsRead } = useNotifications();
  const cc = useCreditConfig();
  // R3 file2 Bug #19: settings carries admin's live welcomeBonusPoints.
  // Falls through to the schema constant only if settings hasn't
  // loaded yet OR the admin value is missing/invalid.
  const settings = useSettings();
  const [open, setOpen]   = useState(false);
  const [points, setPoints] = useState(0);
  const navigate = useNavigate();

  // Detect a welcome notification + decide whether to show the modal.
  // Runs whenever the notifications array changes (which is real-time
  // via the Firestore onSnapshot inside NotificationContext).
  useEffect(() => {
    if (!currentUser || isAdmin) return;
    if (isInventoryEmail(currentUser.email)) return;
    const welcomeNotif = notifications.find(n => n.type === 'customer_welcome_bonus');
    if (!welcomeNotif) return;

    // Per-user "have we shown this already" check. Without this, a user
    // who dismisses the modal without clicking anything that triggers
    // markAsRead would see it again on next page load.
    // Wrapped in try/catch because Safari Private and some restricted
    // contexts throw on localStorage access — degraded gracefully:
    // if storage is unavailable, just skip the dedup (modal may show
    // twice in private mode, acceptable).
    const shownKey = `${SHOWN_KEY_PREFIX}${currentUser.uid}`;
    try {
      if (localStorage.getItem(shownKey)) return;
    } catch (err) {
      console.warn('[WelcomeCreditModal] Failed to read shown key:', err);
    }

    // Pull the points amount from the notification data block. The
    // Cloud Function writes pointsEarned: <welcomeBonus> in there.
    //
    // R3 file2 Bug #19: fallback chain is now (1) notification data,
    // (2) admin's live setting via useSettings, (3) schema constant.
    // Pre-fix step (2) was missing — if admin set welcomeBonusPoints
    // = 1000 but the notification's data block somehow lost
    // pointsEarned, the modal showed 500 (the schema's default)
    // instead of the admin's 1000. Now we look at /settings/global
    // first because that's the value the cloud function actually
    // granted; the schema constant remains as a final defensive
    // fallback for the rare case where settings hasn't loaded yet.
    const fromNotif =
      welcomeNotif.data && typeof welcomeNotif.data === 'object'
        ? Number((welcomeNotif.data as { pointsEarned?: number }).pointsEarned)
        : 0;
    const fromSettings =
      typeof settings?.welcomeBonusPoints === 'number'
       && Number.isFinite(settings.welcomeBonusPoints)
       && settings.welcomeBonusPoints >= 0
        ? settings.welcomeBonusPoints
        : 0;
    const earned = fromNotif || fromSettings || WELCOME_BONUS_POINTS;

    setPoints(earned);
    setOpen(true);
    // R3 file2 Bug #18: write a timestamp instead of '1' so the
    // pruneStaleShownKeys() pass at module load can identify stale
    // entries. Existing '1' values get pruned on first run.
    try {
      localStorage.setItem(shownKey, String(Date.now()));
    } catch (err) {
      console.warn('[WelcomeCreditModal] Failed to persist shown key:', err);
    }
    // Mark as read after a short delay so the bell badge clears
    // alongside the modal showing — feels coherent.
    setTimeout(() => {
      if (welcomeNotif.id) markAsRead(welcomeNotif.id).catch(() => { /* non-critical */ });
    }, 500);
  }, [currentUser, isAdmin, notifications, markAsRead, settings?.welcomeBonusPoints]);

  const close = useCallback(() => setOpen(false), []);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  // Dollar value rounded to 2 decimals — uses live admin-configured
  // creditValuePer1000 setting. e.g. 500 pts at default $1/1000pts = $0.50.
  const dollarValue = cc.calcCreditValue(points).toFixed(2);

  // R3-4 fix — the modal previously said "$X off your first order. Apply
  // your points at checkout — they're ready when you are," but if the
  // welcome bonus is BELOW the redemption minimum (default: 500 < 10,000),
  // the customer literally cannot redeem the bonus on their first order.
  // They have to accumulate more points first. The promise was false.
  //
  // Now we check the live values and surface accurate copy in either case.
  // When the bonus alone reaches the threshold: "$X off your first order."
  // When it doesn't: "Combine with future earnings to unlock $X off."
  const bonusIsImmediatelyRedeemable = points >= cc.minRedeem;
  const ptsNeededToRedeem = Math.max(0, cc.minRedeem - points);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
      className="wcm-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      {/* ── Confetti layer ─────────────────────────────────────────────
          24 pieces with random h-position, color, delay. Pure CSS
          falling animation. aria-hidden because purely decorative.
          Per-piece values stay inline because they're computed in the
          loop (random color/position/delay/size/rotation per iteration);
          the static container + base shape are .wcm-confetti-* classes. */}
      <div aria-hidden="true" className="wcm-confetti-layer">
        {Array.from({ length: 24 }).map((_, i) => {
          const colors = ['#d4aa68', '#b8924a', '#e8c989', '#f1d99e', '#9d7836'];
          const left = (i * 100 / 24 + (i % 3) * 8) % 100;
          const delay = (i * 0.13) % 2.4;
          const duration = 3.2 + (i % 5) * 0.4;
          const size = 8 + (i % 3) * 2;
          const color = colors[i % colors.length];
          const rotate = (i * 47) % 360;
          return (
            <span
              key={i}
              className="wcm-confetti-piece"
              // eslint-disable-next-line react/forbid-dom-props -- per-particle confetti: position, size, colour, rotation, animation timing all vary per piece (24 distinct particles); a CSS class can't express all 5 axes so the values stay inline
              style={{
                left: `${left}%`,
                width: `${size}px`,
                height: `${size * 0.6}px`,
                background: color,
                transform: `rotate(${rotate}deg)`,
                animation: `wcm-fall ${duration}s ${delay}s linear infinite`,
              }}
            />
          );
        })}
      </div>

      {/* ── Card ──────────────────────────────────────────────────── */}
      <div className="wcm-card" onClick={(e) => e.stopPropagation()}>
        {/* Close (top-right) — :hover replaces the previous JS
            mouseEnter/mouseLeave style mutation. */}
        <button
          type="button"
          onClick={close}
          aria-label={t('Close welcome dialog')}
          className="wcm-close"
        >
          <X size={16} />
        </button>

        {/* Sparkle icon disc */}
        <div className="wcm-disc">
          {/* Pulsing halo behind the disc */}
          <span aria-hidden="true" className="wcm-halo" />
          <Sparkles size={36} className="wcm-sparkles-icon" aria-hidden="true" />
        </div>

        {/* Overline */}
        <p className="wcm-overline">{t('Welcome to Ele Café')}</p>

        {/* Headline */}
        <h2 id="welcome-modal-title" className="wcm-headline">
          {t('Your welcome gift is ready')}
        </h2>

        {/* Points — large, celebratory */}
        <div className="wcm-points-box">
          <Gift size={20} className="wcm-gift-icon" aria-hidden="true" />
          <span className="wcm-points-number">{points.toLocaleString()}</span>
          <span className="wcm-points-label">{t('points')}</span>
        </div>

        <p className="wcm-lead">
          {bonusIsImmediatelyRedeemable ? (
            <>
              {tx('That’s {amount} your first order. Apply your points at checkout — they’re ready when you are.', { amount: <strong className="wcm-emphasis">{t('{amount} off', { amount: formatMoneyShort(dollarValue) })}</strong> })}
            </>
          ) : (
            <>
              {tx('Earn {points} to unlock your first {amount}. Every dollar spent earns you {rate} points — they stack with this welcome gift.', {
                points: <strong className="wcm-emphasis">{t('{count} more points', { count: ptsNeededToRedeem.toLocaleString() })}</strong>,
                amount: <strong className="wcm-emphasis">{t('{amount} off', { amount: formatMoney(cc.calcCreditValue(cc.minRedeem)) })}</strong>,
                rate: cc.pointsPerDollar,
              })}
            </>
          )}
        </p>

        {/* CTAs — :hover lift on the primary replaces the previous
            JS-driven transform/box-shadow mutations. */}
        <div className="wcm-cta-cluster">
          <button
            type="button"
            onClick={() => { close(); navigate(ROUTES.PRODUCTS); }}
            className="wcm-cta-primary"
          >
            {t('Start shopping')}
          </button>
          <button
            type="button"
            onClick={close}
            className="wcm-cta-secondary"
          >
            {t('Maybe later')}
          </button>
        </div>
      </div>

    </div>
  );
}
