/**
 * NotificationBell — Ele Café (v15)
 *
 * Bell button + slide-in panel with:
 *  - Role-aware detail modal: admins see a richer audit layout on
 *    `admin_*` events, with inline Approve & Charge / Reject for new orders.
 *  - Reusable CopyButton with hover tooltip + tap-friendly mobile
 *    feedback (toast + brief inline "Copied!" pill).
 *  - Date-grouped list, optimistic mark/unread, focus management,
 *    ARIA live region, ESC + scroll lock + reduced-motion respect.
 *  - Renders via createPortal to escape the navbar's stacking context.
 *
 * Refactored v15: extracted formatters + emoji map to src/lib/ for
 * unit testability and to bring this file under the maintenance limit.
 * Timestamps are pre-parsed to Date | null by the schema layer, so this
 * file no longer carries its own tsToDate helper.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  Copy,
  Eye,
  ExternalLink,
  RotateCcw,
  Shield,
  Trash2,
  Trash,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

import { useNotifications } from '@/contexts/NotificationContext';
import { Modal, ModalBtn } from './modals/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { lockBodyScroll } from '@/lib/bodyScrollLock';
import { db, getFunctionsLazy } from '@/lib/firebase';
import type { NotificationLoose, NotificationType } from '@/schemas/notification.schema';
import { buildNotificationMessage, NOTIFICATION_META } from '@/lib/notificationMessages';
import {
  fmtFull,
  fmtRelative,
  groupKeyFor,
  NOTIFICATION_GROUP_LABEL,
  type NotificationGroupKey,
} from '@/lib/notificationFormatters';

import { useT, useTx, tNow, useLang } from '@/i18n/useT';

import { formatMoney } from '@/lib/money';
/** Stored title/body are written in English by Cloud Functions; in French,
 *  rebuild them from the notification's type + data. */
function useNotificationText(n: {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  const t = useT();
  const lang = useLang();
  if (lang !== 'fr') return { title: n.title, body: n.body };
  return buildNotificationMessage({ type: n.type, data: n.data ?? {} }, t, 'fr-CA');
}

// Bell consumes the loose schema — historical docs may have shapes
// that don't satisfy the strict discriminated union, and rendering
// should never crash on legacy data.
type Notification = NotificationLoose;
type NotificationData = NotificationLoose['data'];

// ── Typed accessors for loose-schema data ────────────────────────────
// The loose schema parses `data` as Record<string, unknown> so legacy
// docs don't fail to render. These helpers narrow safely at the access
// site — better than scattering `as string` casts. Returning undefined
// for wrong types means a buggy / legacy doc renders fewer rows
// instead of crashing.
function dStr(d: NotificationData, key: string): string | undefined {
  const v = d[key];
  return typeof v === 'string' ? v : undefined;
}
function dNum(d: NotificationData, key: string): number | undefined {
  const v = d[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

// Which notification types are "admin views" — i.e., admins receive
// them about customer activity. Used to switch the detail modal layout.
const ADMIN_TYPES = new Set<NotificationType>([
  'admin_new_signup',
  'admin_order_placed',
  'admin_payment_issue',
]);

// ─────────────────────────────────────────────────────────────────────────
// CopyButton — reusable copy-to-clipboard control
// ─────────────────────────────────────────────────────────────────────────
//
// Renders an icon button with a hover tooltip ("Copy"). On click,
// copies the value, swaps the icon to a check, and shows a toast.
// Falls back to a textarea trick for browsers without the modern
// clipboard API (rare, but mobile Safari in private mode lacks it).
//
// Mobile: no hover, but the toast feedback + the icon swap make the
// success state obvious. Tap target is 28×28 (above the 24px AAA min).
//
function CopyButton({
  value,
  label = 'Copy',
  size = 12,
}: {
  value: string;
  label?: string;
  size?: number;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function doCopy(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    try {
      // Modern path
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Legacy fallback — works in older mobile browsers
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast.success(tNow('Copied to clipboard'));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      console.error('[copy] failed', err);
      toast.error(tNow('Could not copy'));
    }
  }

  return (
    <button
      type="button"
      onClick={doCopy}
      className={`copy-btn${copied ? ' is-copied' : ''}`}
      aria-label={copied ? t('Copied') : label}
      title={copied ? t('Copied!') : label}
    >
      {copied ? <Check size={size} aria-hidden="true" /> : <Copy size={size} aria-hidden="true" />}
      <span className="copy-btn-tip" aria-hidden="true">
        {copied ? t('Copied!') : label}
      </span>
    </button>
  );
}

// ── A single key/value row that supports an optional copy button ─────────
function DetailRow({
  label,
  value,
  copyValue,
}: {
  label: string;
  value: React.ReactNode;
  copyValue?: string;
}) {
  const t = useT();
  return (
    <div className="notif-detail-row">
      <span className="notif-detail-label">{label}</span>
      <span className="notif-detail-value">
        {value}
        {copyValue && <CopyButton value={copyValue} label={t('Copy')} />}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// AdminOrderActions — inline Approve & Charge / Reject for the
// `admin_order_placed` notification, so admin can act on a fresh order
// from the bell. Same paths as AdminOrders.applyAction:
//   approve → approveOrder Cloud Function (stock check + card capture)
//   reject  → status='rejected' + rejectionReason (onOrderWrite releases
//             the card hold)
// Re-checks the order status on mount so a second admin who already
// acted through the dashboard can't double-act.
// ─────────────────────────────────────────────────────────────────────────

/** Minimal subset of the order doc needed for action math. */
interface OrderForAction {
  orderId: string;
  status: string;
  totalAmount: number;
}

function AdminOrderActions({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const t = useT();
  const tx = useTx();
  const [order, setOrder] = useState<OrderForAction | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle');
  const [adminNote, setAdminNote] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch the order on mount. The customer-side rule that produced the
  // permission-denied bug in CheckoutPage doesn't apply here: this
  // component only renders for admin notifications, and admins always
  // satisfy the /orders read rule via the `isAdmin()` short-circuit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'orders', orderId));
        if (cancelled) return;
        if (!snap.exists()) {
          setLoadErr(true);
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        setOrder({
          orderId: String(data.orderId ?? orderId),
          status: String(data.status ?? 'pending'),
          totalAmount: Number(data.totalAmount ?? 0),
        });
      } catch (err) {
        if (!cancelled) {
          console.warn('[AdminOrderActions] load failed', err);
          setLoadErr(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // ── Loading / error / not-actionable states ────────────────────────────
  if (loadErr) {
    return (
      <div className="nb-hint-box" data-tone="danger">
        {t("Couldn't load this order.")}{' '}
        <a href="/admin/orders" className="nb-dash-link">
          {t('Open Orders dashboard')}
        </a>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="nb-hint-box" data-tone="muted">
        {t('Loading order…')}
      </div>
    );
  }
  if (order.status !== 'pending') {
    return (
      <div className="nb-hint-box" data-tone="muted">
        {tx('This order is now {status}.', { status: <strong>{t(order.status)}</strong> })}{' '}
        <a href="/admin/orders" className="nb-dash-link">
          {t('View in dashboard')} <ExternalLink size={11} className="nb-extlink-icon" />
        </a>
      </div>
    );
  }

  async function handleApprove() {
    setSubmitting(true);
    try {
      const { functions, httpsCallable } = await getFunctionsLazy();
      const approve = httpsCallable<{ orderId: string; adminNote?: string }, { charged: number }>(
        functions,
        'approveOrder',
      );
      const res = await approve({
        orderId,
        ...(adminNote.trim() ? { adminNote: adminNote.trim() } : {}),
      });
      toast.success(
        tNow('Order {id} approved — {amount} charged', {
          id: order!.orderId,
          amount: formatMoney(res.data.charged),
        }),
      );
      onDone();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Approve failed';
      toast.error(msg);
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!reason.trim()) {
      toast.error(tNow('A reason is required'));
      return;
    }
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'rejected',
        rejectionReason: reason.trim(),
        updatedAt: serverTimestamp(),
      });
      toast.success(tNow('Order {id} rejected', { id: order!.orderId }));
      onDone();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Reject failed';
      toast.error(msg);
      setSubmitting(false);
    }
  }

  // ── Idle: two side-by-side action buttons ──────────────────────────────
  if (mode === 'idle') {
    return (
      <div className="nb-action-row">
        <button
          type="button"
          onClick={() => setMode('approve')}
          className="nb-action-btn"
          data-tone="success"
        >
          <CheckCircle2 size={14} /> {t('Approve & Charge')}
        </button>
        <button
          type="button"
          onClick={() => setMode('reject')}
          className="nb-action-btn"
          data-tone="danger"
        >
          <XCircle size={14} /> {t('Reject')}
        </button>
      </div>
    );
  }

  // ── Approve form: optional admin note + amount to be charged ──────────
  if (mode === 'approve') {
    return (
      <div className="nb-form-box">
        <p className="nb-form-title">
          <CheckCircle2 size={13} /> {t('Approve & charge')}
        </p>
        <p className="nb-field-label">
          {t(
            "Checks every tea is in stock, then charges the customer's card. If something is out of stock, nothing is charged — reject instead.",
          )}
        </p>
        <label className="nb-field-label nb-field-label-mt" htmlFor="nb-admin-note">
          {t('Admin note (optional)')}
        </label>
        <input
          id="nb-admin-note"
          type="text"
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          placeholder={t('Visible to the customer')}
          autoFocus
          disabled={submitting}
          maxLength={300}
          className="nb-field-input"
        />
        <div className="nb-preview-row">
          <span className="nb-preview-label">{t('Will charge')}</span>
          <strong className="nb-preview-value">{formatMoney(order.totalAmount)}</strong>
        </div>
        <div className="nb-action-row nb-action-row-mt">
          <button
            type="button"
            onClick={() => setMode('idle')}
            disabled={submitting}
            className="nb-ghost-btn"
          >
            {t('Back')}
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={submitting}
            className="nb-action-btn"
            data-tone="success"
            data-dim={submitting ? 'true' : 'false'}
          >
            {submitting ? t('Charging…') : t('Approve & charge')}
          </button>
        </div>
      </div>
    );
  }

  // ── Reject form: required reason ───────────────────────────────────────
  return (
    <div className="nb-form-box">
      <p className="nb-form-title">
        <XCircle size={13} /> {t('Reject order')}
      </p>
      <label className="nb-field-label" htmlFor="nb-reject-reason">
        {t('Reason (shown to customer)')}
      </label>
      <textarea
        id="nb-reject-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('e.g. Out of stock — please reorder once back in stock.')}
        autoFocus
        disabled={submitting}
        maxLength={500}
        rows={3}
        className="nb-field-input nb-field-textarea"
      />
      <div className="nb-action-row nb-action-row-mt">
        <button
          type="button"
          onClick={() => setMode('idle')}
          disabled={submitting}
          className="nb-ghost-btn"
        >
          {t('Back')}
        </button>
        <button
          type="button"
          onClick={handleReject}
          disabled={submitting || !reason.trim()}
          className="nb-action-btn"
          data-tone="danger"
          data-dim={submitting || !reason.trim() ? 'true' : 'false'}
        >
          {submitting ? t('Rejecting…') : t('Confirm reject')}
        </button>
      </div>
    </div>
  );
}

// ── Inline style helpers — kept inline (vs. CSS file) so the new
// component is fully self-contained inside this file, matching the
// surrounding NotificationBell convention. CSS variables tie us into
// the rest of the design system (success/danger/text/etc.).
// ── Style constants ─────────────────────────────────────────────────────────
// Phase 3: previously these were React.CSSProperties objects spread inline
// via style={...}. Converted to CSS classes (`nb-*` prefix) in design.css.
// Variants like the action button's success/danger colour are encoded via
// data-tone attributes on the JSX, so a single class definition handles
// both buttons. The dimming for "in-flight" buttons is data-dim="true".

// ─────────────────────────────────────────────────────────────────────────
// Notification detail modal — picks layout by notification type
// ─────────────────────────────────────────────────────────────────────────
function NotifDetailModal({ n, onClose }: { n: Notification; onClose: () => void }) {
  const t = useT();
  const emoji = NOTIFICATION_META[n.type]?.emoji ?? '🔔';
  const d: NotificationData = n.data || {};
  const isAdminNotif = ADMIN_TYPES.has(n.type);

  // Extract values once via the typed accessors. Per-call narrowing
  // means we don't need scattered casts further down.
  const orderId = dStr(d, 'orderId');
  const customerName = dStr(d, 'customerName');
  const customerId = dStr(d, 'customerId');
  const customerEmail = dStr(d, 'customerEmail');
  const totalAmount = dNum(d, 'totalAmount');
  const shippingFee = dNum(d, 'shippingFee');
  const trackingNumber = dStr(d, 'trackingNumber');
  const carrier = dStr(d, 'carrier');
  const reason = dStr(d, 'reason');
  const adminNote = dStr(d, 'adminNote');
  const pointsEarned = dNum(d, 'pointsEarned');
  const pointsAdded = dNum(d, 'pointsAdded');
  const newBalance = dNum(d, 'newBalance');
  const joinDate = dStr(d, 'joinDate');
  // Back-in-stock: in-app path to the tea. Only same-site paths.
  const linkUrl =
    n.type === 'customer_back_in_stock' ||
    n.type === 'customer_promotion' ||
    n.type === 'customer_new_arrival' ||
    n.type === 'customer_cart_reminder' ||
    n.type === 'customer_order_delivered'
      ? dStr(d, 'url')
      : undefined;
  const linkLabel =
    n.type === 'customer_order_delivered'
      ? t('Rate your teas')
      : n.type === 'customer_promotion'
        ? t('Shop now')
        : n.type === 'customer_cart_reminder'
          ? t('View cart')
          : n.type === 'customer_new_arrival' && dStr(d, 'url') === '/products'
            ? t('Shop new teas')
            : t('View tea');
  const navigate = useNavigate();

  // Build the table rows that apply to this notification.
  const rows: { label: string; value: React.ReactNode; copyValue?: string }[] = [];
  if (orderId) rows.push({ label: 'Order ID', value: <code>{orderId}</code>, copyValue: orderId });
  if (customerName)
    rows.push({
      label: 'Customer',
      value: `${customerName}${customerId ? ` (${customerId})` : ''}`,
    });
  if (customerEmail) rows.push({ label: 'Email', value: customerEmail, copyValue: customerEmail });
  if (totalAmount != null) rows.push({ label: 'Total', value: formatMoney(totalAmount) });
  if (shippingFee) rows.push({ label: 'Shipping fee', value: formatMoney(shippingFee) });
  if (trackingNumber)
    rows.push({
      label: 'Tracking',
      value: <code>{trackingNumber}</code>,
      copyValue: trackingNumber,
    });
  if (carrier) rows.push({ label: 'Carrier', value: carrier });
  if (reason) rows.push({ label: 'Reason', value: reason });
  if (adminNote) rows.push({ label: 'Note', value: adminNote });
  if (pointsEarned != null)
    rows.push({ label: 'Points earned', value: `+${pointsEarned.toLocaleString()} pts` });
  if (pointsAdded != null)
    rows.push({ label: 'Points added', value: `+${pointsAdded.toLocaleString()} pts` });
  if (newBalance != null)
    rows.push({ label: 'New balance', value: `${newBalance.toLocaleString()} pts` });
  if (joinDate) rows.push({ label: 'Joined', value: joinDate });

  return (
    <Modal
      open
      onClose={onClose}
      title={n.title}
      subtitle={n.createdAt ? fmtFull(n.createdAt) : ''}
      size="sm"
      darkHeader
      footer={
        <>
          <ModalBtn variant="outline" onClick={onClose}>
            {t('Close')}
          </ModalBtn>
          {linkUrl?.startsWith('/') && (
            <ModalBtn
              onClick={() => {
                onClose();
                navigate(linkUrl);
              }}
            >
              {linkLabel}
            </ModalBtn>
          )}
        </>
      }
    >
      {/* Admin notifications get an "ADMIN" badge above the body so it's
          obvious at a glance whose action is required. Customers don't
          see this badge. */}
      {isAdminNotif && (
        <div className="notif-admin-badge">
          <Shield size={11} />
          {t('ADMIN ACTION')}
        </div>
      )}

      <div className="nb-body-row">
        <span className="nb-body-emoji">{emoji}</span>
        <p className="nb-body-text">{n.body}</p>
      </div>

      {rows.length > 0 && (
        <div className={`notif-detail-table${isAdminNotif ? ' is-admin' : ''}`}>
          {rows.map((r, i) => (
            <DetailRow key={r.label + i} label={r.label} value={r.value} copyValue={r.copyValue} />
          ))}
        </div>
      )}

      {/* Line items list — appears on order_placed and similar admin
          notifications when the CF includes the basket. */}
      {Array.isArray(d.items) && d.items.length > 0 && (
        <div className="nb-items-block">
          <p className="nb-items-eyebrow">{t('Items')}</p>
          <div className="notif-detail-table">
            {d.items.map((item, i) => (
              <div key={`${item.productName}-${i}`} className="notif-detail-row">
                <span className="notif-detail-label">
                  {item.productName} × {item.quantity}
                </span>
                <span className="notif-detail-value">
                  {formatMoney(Number(item.price) * Number(item.quantity))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inline approve/reject actions for the order-placed admin
          notification. Replaces the dashboard-redirect hint below for
          this specific type — admin can now resolve the order from
          here without context-switching. The component fetches the
          order doc itself, validates it's still 'pending', and
          mirrors the same field writes as AdminOrders.applyAction. */}
      {n.type === 'admin_order_placed' && orderId && (
        <AdminOrderActions orderId={orderId} onDone={onClose} />
      )}

      {/* Admin-only hint footer: for payment-sent notifications, point
          the admin to where they go to verify. For other admin types,
          remind them which page to handle the action.
          NOTE: admin_order_placed is intentionally excluded — its
          dashboard-redirect copy is now superseded by the inline
          AdminOrderActions component above. */}
      {isAdminNotif && n.type !== 'admin_order_placed' && (
        <div className="notif-admin-hint">
          <Shield size={11} />
          {n.type === 'admin_payment_issue'
            ? t(
                'Open the Clover dashboard and release the hold or refund the charge for this order.',
              )
            : t('Open the Orders dashboard to handle this event.')}
        </div>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main bell component
// ─────────────────────────────────────────────────────────────────────────
export function NotificationBell() {
  const t = useT();
  const { currentUser } = useAuth();
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    deleteOne,
    clearAllRead,
  } = useNotifications();

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Notification | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  const bellRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const liveRegionRef = useRef<HTMLDivElement | null>(null);

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setDeletingIds((prev) => new Set(prev).add(id));
      try {
        await deleteOne(id);
      } catch (err) {
        console.warn('[NotificationBell] delete failed:', err);
        setDeletingIds((prev) => {
          const s = new Set(prev);
          s.delete(id);
          return s;
        });
      }
    },
    [deleteOne],
  );

  const handleOpenDetail = useCallback(
    (n: Notification) => {
      setSelected(n);
      if (!n.isRead) markAsRead(n.id);
      setOpen(false);
    },
    [markAsRead],
  );

  const visible = useMemo(
    () => notifications.filter((n) => !deletingIds.has(n.id)),
    [notifications, deletingIds],
  );

  const grouped = useMemo(() => {
    const buckets: Record<NotificationGroupKey, Notification[]> = {
      today: [],
      yesterday: [],
      'this-week': [],
      older: [],
    };
    for (const n of visible) buckets[groupKeyFor(n.createdAt, now)].push(n);
    return (Object.keys(buckets) as NotificationGroupKey[])
      .filter((k) => buckets[k].length > 0)
      .map((k) => ({ key: k, label: t(NOTIFICATION_GROUP_LABEL[k]), items: buckets[k] }));
  }, [visible, now]);

  // Independent tick to keep relative timestamps fresh even when the
  // bell is closed. 60s cadence — relative times are minute-precision
  // anyway, so there's no benefit to faster ticks while closed. When
  // the bell opens, the open=true effect adds a 30s tick on top so the
  // time updates feel snappier during active use.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Capture the bell node now so cleanup refocuses the SAME node
    // even if bellRef.current is replaced before close. Avoids the
    // react-hooks/exhaustive-deps warning about stale ref reads in
    // effect cleanup.
    const bellNode = bellRef.current;
    const release = lockBodyScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const focusTimer = setTimeout(() => closeBtnRef.current?.focus(), 280);
    const tickTimer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      release();
      window.removeEventListener('keydown', onKey);
      clearTimeout(focusTimer);
      clearInterval(tickTimer);
      bellNode?.focus();
    };
  }, [open]);

  const lastUnreadRef = useRef(unreadCount);
  const firstSnapshotRef = useRef(true);
  useEffect(() => {
    // Skip the first snapshot — those are existing notifications, not
    // newly-arrived ones. The "X new notifications" announcement
    // should only fire on real-time deltas after the initial load.
    if (firstSnapshotRef.current) {
      firstSnapshotRef.current = false;
      lastUnreadRef.current = unreadCount;
      return;
    }
    if (unreadCount > lastUnreadRef.current) {
      const region = liveRegionRef.current;
      if (region) {
        const delta = unreadCount - lastUnreadRef.current;
        // Clear-then-set forces screen readers to re-announce even when
        // the same value lands twice in succession. The 50ms window is
        // safe with strict-mode double-invocation; we cancel on unmount.
        region.textContent = '';
        const announceTimer = window.setTimeout(() => {
          // liveRegionRef may have been detached if the component
          // unmounted during this 50ms window. Re-check before write.
          const r = liveRegionRef.current;
          if (r) r.textContent = `${delta} new notification${delta === 1 ? '' : 's'}`;
        }, 50);
        // Cleanup if this effect re-runs (or component unmounts)
        // before the timer fires.
        return () => clearTimeout(announceTimer);
      }
    }
    lastUnreadRef.current = unreadCount;
  }, [unreadCount]);

  if (!currentUser) return null;

  const readCount = visible.filter((n) => n.isRead).length;

  return (
    <>
      <div
        ref={liveRegionRef}
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      />

      <button
        ref={bellRef}
        type="button"
        className="nav-icon notif-bell-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unreadCount > 0
            ? t('Notifications ({count} unread)', { count: unreadCount })
            : t('Notifications')
        }
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="nav-badge" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <>
            <div className="notif-overlay" onClick={() => setOpen(false)} aria-hidden="true" />
            <aside
              className="notif-panel"
              role="dialog"
              aria-modal="true"
              aria-label={t('Notifications panel')}
            >
              <header className="notif-panel-head">
                <div>
                  <h2 className="notif-panel-title">{t('Notifications')}</h2>
                  {unreadCount > 0 && (
                    <p className="notif-panel-sub">{t('{count} unread', { count: unreadCount })}</p>
                  )}
                </div>
                <div className="notif-panel-actions">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllAsRead}
                      className="notif-head-btn"
                      title={t('Mark every unread item as read')}
                    >
                      <CheckCheck size={13} /> {t('All read')}
                    </button>
                  )}
                  {readCount > 0 && (
                    <button
                      type="button"
                      onClick={clearAllRead}
                      className="notif-head-btn"
                      title={t('Delete every read notification')}
                    >
                      <Trash size={13} /> {t('Clear read')}
                    </button>
                  )}
                  <button
                    ref={closeBtnRef}
                    type="button"
                    onClick={() => setOpen(false)}
                    className="notif-head-close"
                    aria-label={t('Close notifications panel')}
                  >
                    <X size={18} />
                  </button>
                </div>
              </header>

              <div
                className="notif-panel-body"
                aria-live="polite"
                aria-relevant="additions"
                aria-atomic="false"
              >
                {loading ? (
                  <NotifEmptyState
                    icon={<Bell size={28} />}
                    title={t('Loading…')}
                    hint={t('Fetching your notifications')}
                  />
                ) : visible.length === 0 ? (
                  <NotifEmptyState
                    icon={<Bell size={32} />}
                    title={t('No notifications')}
                    hint={t("You're all caught up 🎉")}
                  />
                ) : (
                  <>
                    {grouped.map((group) => (
                      <section key={group.key} className="notif-group">
                        <h3 className="notif-group-title">{group.label}</h3>
                        <ul className="notif-list">
                          {group.items.map((n) => (
                            <NotifItem
                              key={n.id}
                              n={n}
                              now={now}
                              onMarkRead={() => markAsRead(n.id)}
                              onMarkUnread={() => markAsUnread(n.id)}
                              onView={() => handleOpenDetail(n)}
                              onDelete={(e) => handleDelete(n.id, e)}
                            />
                          ))}
                        </ul>
                      </section>
                    ))}
                  </>
                )}
              </div>
            </aside>
          </>,
          document.body,
        )}

      {selected && <NotifDetailModal n={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function NotifEmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="notif-empty">
      <div className="notif-empty-icon">{icon}</div>
      <p className="notif-empty-title">{title}</p>
      <p className="notif-empty-hint">{hint}</p>
    </div>
  );
}

function NotifItem({
  n,
  now,
  onMarkRead,
  onMarkUnread,
  onView,
  onDelete,
}: {
  n: Notification;
  now: number;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onView: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const t = useT();
  const lang = useLang();
  const emoji = NOTIFICATION_META[n.type]?.emoji ?? '🔔';
  const isAdminBit = ADMIN_TYPES.has(n.type);
  const { title, body } = useNotificationText(n);

  return (
    <li className={`notif-item${n.isRead ? '' : ' is-unread'}${isAdminBit ? ' is-admin' : ''}`}>
      <div className="notif-item-row">
        <span className="notif-item-emoji" aria-hidden="true">
          {emoji}
        </span>
        <div className="notif-item-main">
          <div className="notif-item-title-row">
            <p className="notif-item-title">{title}</p>
            {!n.isRead && <span className="notif-item-dot" aria-label={t('Unread')} />}
          </div>
          {/* Tiny ADMIN tag on admin notification list items so admins
              can scan the panel and see which ones need their action. */}
          {isAdminBit && <span className="notif-item-pill">{t('ADMIN')}</span>}
          <p className="notif-item-body">{body}</p>
          <p className="notif-item-time" title={fmtFull(n.createdAt, lang)}>
            {fmtRelative(n.createdAt, now, lang)}
          </p>
        </div>
      </div>

      <div className="notif-item-actions">
        {n.isRead ? (
          <button
            type="button"
            onClick={onMarkUnread}
            className="notif-action notif-action-unread"
            title={t('Mark as unread')}
          >
            <RotateCcw size={11} /> {t('Mark unread')}
          </button>
        ) : (
          <button
            type="button"
            onClick={onMarkRead}
            className="notif-action notif-action-read"
            title={t('Mark as read')}
          >
            <Check size={11} /> {t('Mark read')}
          </button>
        )}
        <button type="button" onClick={onView} className="notif-action notif-action-view">
          <Eye size={11} /> {t('View')}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="notif-action notif-action-delete"
          aria-label={t('Delete notification: {title}', { title })}
          title={t('Delete')}
        >
          <Trash2 size={11} />
        </button>
      </div>
    </li>
  );
}
