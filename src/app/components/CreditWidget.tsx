import { AlertTriangle, Coins, Gift } from 'lucide-react';
import { useCredit } from '@/contexts/CreditContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCreditConfig } from '@/hooks/useCreditConfig';
import { toast } from 'sonner';
import { useState } from 'react';
import { isInventoryEmail } from '@/lib/inventoryAccount';

import { useT, localeFor, currentLang, tNow } from '@/i18n/useT';
import { formatMoney } from '@/lib/money';
// Build the redemption tier ladder for a given balance. The visual cap
// is 8 buttons — any more and the wrap row gets unwieldy. Two changes
// from the original:
//
//   1. The cap is 8, not 4 — previously a customer with 80k pts could
//      only ever see [10k, 20k, 30k, 40k] tiers, so 40k of their
//      balance was effectively unreachable from the widget. They
//      either did multiple smaller orders or contacted support.
//
//   2. When the natural tier list exceeds the cap, we keep the LOWEST
//      tiers AND always include the user's MAX redeemable as the last
//      button. So a customer with 250k pts sees something like:
//      [10k, 20k, 30k, 40k, 50k, 60k, 70k, 250k] — they can always
//      redeem the maximum without having to leave the widget.
function getRedeemTiers(balance: number, minRedeem: number, calcValue: (p: number) => number) {
  const max = Math.floor(balance / minRedeem) * minRedeem;
  if (max <= 0) return [];

  const all: { points: number; value: number }[] = [];
  for (let pts = minRedeem; pts <= max; pts += minRedeem) {
    all.push({ points: pts, value: calcValue(pts) });
  }

  const VISIBLE = 8;
  if (all.length <= VISIBLE) return all;

  // Keep the first (VISIBLE - 1) tiers, then append the maximum.
  const head = all.slice(0, VISIBLE - 1);
  const top  = all[all.length - 1];
  // Avoid showing the same tier twice if the cap math happens to align.
  if (head.some(t => t.points === top.points)) return head;
  return [...head, top];
}
function getNextJan1() {
  return new Date(new Date().getFullYear() + 1, 0, 1)
    .toLocaleDateString(localeFor(currentLang()), { year:'numeric', month:'long', day:'numeric' });
}

/**
 * Phase 3 status (2026-05-09): all 34 inline styles migrated to
 * `cw-*` classes (and the existing `.credit-*` classes) in design.css.
 * The progress-bar fill width passes through a `--cw-progress` CSS
 * custom property — the only remaining `style={{}}` in the file,
 * suppressed with a documented reason per playbook §step-5. The two
 * tier-button JS-driven hovers became `.cw-tier-btn:hover` (§step-4).
 */
export function CreditWidget({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const { currentUser } = useAuth();
  const { balance, redeemable, toNextThreshold, canRedeem, loading } = useCredit();
  const cc = useCreditConfig();
  const [redeeming] = useState(false);

  if (isInventoryEmail(currentUser?.email)) return null;

  if (!currentUser) return null;
  if (loading) return compact ? null : (
    <div className="skeleton cw-skel" />
  );

  // R3 file2 Bug #9: pre-fix the bar emptied to 0% the moment balance
  // crossed a redeem threshold (because `balance % minRedeem === 0` at
  // exact thresholds gives 0). Visually jarring — the user just hit a
  // milestone and watched the bar vanish.
  //
  // Now: when balance is exactly on a threshold AND the user can
  // redeem, the bar reads 100% (full) with the celebration "✓
  // Redeemable!" badge active. As they earn more points (10,001 →
  // 20,000), the bar resumes showing modulo-based progress to the
  // NEXT tier. The clamp to 100% in the existing Math.min stays as
  // a defensive guard but no longer hides the threshold case.
  const onExactThreshold = canRedeem && (balance % cc.minRedeem === 0);
  const progressPct = onExactThreshold
    ? 100
    : Math.min(100, ((balance % cc.minRedeem) / cc.minRedeem) * 100);

  if (compact) {
    return (
      <div className="cw-compact">
        <Coins size={12} />
        <span className="cw-compact-val">{balance.toLocaleString()}</span>
      </div>
    );
  }

  return (
    <div className="credit-card">
      {/* Header — balance + earn rate */}
      <div className="credit-card-head">
        <div className="cw-head-row">
          <div className="section-card-icon">
            <Coins size={16} />
          </div>
          <div>
            <p className="cw-head-name">{t('Ele Café Credits')}</p>
            <p className="cw-head-rate">{t('{count} pts earned per $1 spent', { count: cc.pointsPerDollar })}</p>
          </div>
        </div>
        <div className="cw-head-right">
          <p className="credit-balance">{balance.toLocaleString()}</p>
          <p className="cw-head-points">{t('points')}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="cw-progress-section">
        <div className="cw-progress-row">
          <span className="cw-progress-label">
            {t('Progress to {count} pts', { count: (canRedeem
              ? (Math.floor(balance / cc.minRedeem) + 1) * cc.minRedeem
              : cc.minRedeem).toLocaleString() })}
          </span>
          {canRedeem ? (
            <span className="cw-progress-redeemable">{t('✓ Redeemable!')}</span>
          ) : (
            <span className="cw-progress-togo">{t('{count} to go', { count: toNextThreshold.toLocaleString() })}</span>
          )}
        </div>
        <div className="credit-progress-bar">
          <div
            className="credit-progress-fill cw-progress-fill-dyn"
            /* The fill width is genuinely dynamic — the only `style={{}}`
               in this file. Pass it via a CSS custom property so the
               class can layer transition + color. */
            // eslint-disable-next-line react/forbid-dom-props
            style={{ ['--cw-progress' as string]: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Redeem tiers */}
      {canRedeem && (
        <div className="cw-redeem-section">
          <p className="cw-redeem-eyebrow">{t('Redeem your points')}</p>
          <div className="cluster-2">
            {getRedeemTiers(balance, cc.minRedeem, cc.calcCreditValue).map(tier => (
              <button
                key={tier.points}
                onClick={() => toast.info(tNow('Apply your credits at checkout when placing an order.'))}
                disabled={redeeming}
                className="cw-tier-btn"
              >
                <Gift size={12} />
                {/* R3 file2 Bug #8: was toFixed(0) which rounded $7.50
                    to "$8" — customer clicks "$8 off", gets $7.50.
                    Use 2 decimals so display matches what's actually
                    applied. Trades a bit of visual cleanliness for
                    truth, which matters more on a money-affecting
                    button. Integer values render as "$X.00" — still
                    legible. */}
                {t('{points} pts = {value} off', { points: tier.points.toLocaleString(), value: formatMoney(tier.value) })}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="cw-stats-row">
        <div className="credit-stat">
          {/* R3 file2 Bug #8: toFixed(2) so non-integer rates show
              correctly (e.g. $7.50 not "$8"). */}
          <p className="credit-stat-val">{formatMoney(cc.calcCreditValue(redeemable))}</p>
          <p className="cw-stat-cap">{t('available credit')}</p>
        </div>
        <div className="credit-stat">
          <p className="credit-stat-val">{toNextThreshold === 0 ? '—' : toNextThreshold.toLocaleString()}</p>
          <p className="cw-stat-cap">{t('pts to next $1')}</p>
        </div>
      </div>

      {/* Expiry notice */}
      <div className="cw-expiry">
        <AlertTriangle size={14} className="cw-expiry-icon" />
        <p className="cw-expiry-msg">
          {t('All points reset on January 1st each year. Next reset: {date}', { date: getNextJan1() })}
        </p>
      </div>
    </div>
  );
}

// ── Checkout credit selector ──────────────────────────────────────────────────
//
// `maxApplicable` is the largest dollar credit that can actually be
// applied to this checkout — i.e. afterPromo. Filtering on this rather
// than raw subtotal prevents the silent-clamp bug:
//
//   subtotal=$50, promo=$25, afterPromo=$25; user clicks "$50 / 50,000 pts"
//
// Pre-fix: the selector showed the $50 tier (filter was `t.value <= subtotal`),
// CheckoutPage capped `creditApplied` to $25 but did NOT recompute
// creditPoints, so the order was written with $25 applied but 50,000 pts
// deducted — the user lost 25,000 pts of value with no warning. Now the
// selector hides any tier whose dollar value exceeds the real cap, so the
// user can only ever click a tier that fully redeems.
export function CreditSelector({ maxApplicable, creditApplied, onApply, onRemove }: {
  maxApplicable: number; creditApplied: number;
  onApply: (credit: number, points: number) => void; onRemove: () => void;
}) {
  const tr = useT();
  const { currentUser } = useAuth();
  const { balance, canRedeem, loading } = useCredit();
  const cc = useCreditConfig();
  if (!currentUser || !canRedeem || loading) return null;
  const tiers = getRedeemTiers(balance, cc.minRedeem, cc.calcCreditValue)
    .filter(t => t.value <= maxApplicable);
  if (tiers.length === 0) return null;
  return (
    <div className="cw-sel-wrap">
      <div className="cw-sel-head">
        <Coins size={15} className="cw-sel-icon" />
        <span className="cw-sel-title">{tr('Use credits — {count} pts', { count: balance.toLocaleString() })}</span>
      </div>
      {creditApplied > 0 ? (
        <div className="cw-sel-applied-row">
          <span className="cw-sel-applied-msg">{tr('✓ {amount} credit applied', { amount: formatMoney(creditApplied) })}</span>
          <button onClick={onRemove} className="cw-sel-remove">{tr('Remove')}</button>
        </div>
      ) : (
        <div className="cluster-2">
          {tiers.map(tier => (
            <button
              key={tier.points}
              onClick={() => onApply(tier.value, tier.points)}
              className="cw-sel-tier-btn"
            >
              {/* R3 file2 Bug #8: toFixed(2) — see CreditWidget redeem
                  tier comment. */}
              {tr('Apply {amount} ({count} pts)', { amount: formatMoney(tier.value), count: tier.points.toLocaleString() })}
            </button>
          ))}
        </div>
      )}
      <p className="cw-sel-footnote">{tr('Credit applied to subtotal. Points earned on amount paid after credit.')}</p>
    </div>
  );
}
