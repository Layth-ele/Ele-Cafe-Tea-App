/**
 * AdminCustomers — Ele Café
 * Enhanced with profile modal, stats cards, paginated list.
 * Adapted from reference project's CustomersList + CustomerProfileModal.
 */
import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { User } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';
import { Calendar, Clock, Coins, DollarSign, Eye, Mail, Minus, Package, Plus, RefreshCw, ShoppingBag, User as UserIcon, Users } from 'lucide-react';
import { SearchBar } from '@/app/components/ui/SearchBar';
import { Pagination } from '@/app/components/ui/Pagination';
import { Field } from '@/app/components/ui/Field';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { adminAdjustCredit } from '@/contexts/CreditContext';
import { adminCreditFormSchema, type AdminCreditFormInput } from '@/schemas/credit.schema';
import { useCreditConfig } from '@/hooks/useCreditConfig';
import type { CreditAccount, Order } from '@/types';

import { toast } from 'sonner';
import { Modal, ModalBtn } from '@/app/components/modals/Modal';

import { AdminPageHeader } from '@/app/components/admin/AdminPageHeader';
interface CustomerRow {
  uid: string; email: string; displayName?: string; createdAt?: Timestamp | null;
  balance: number; lifetimeEarned: number; lifetimeRedeemed: number;
  lifetimeSpend: number; orderCount: number;
  // R3 file2 Bug #16: `lastEarnedAt` was previously read from the
  // /credits doc into this row but never rendered. Removed from both
  // sides — see CreditAccount schema.
  // Session tracking — written by useSessionTracker. Optional because
  // existing users from before the feature don't have these fields.
  totalActiveMs?: number;
  lastSessionMs?: number;
  lastSessionEndedAt?: Timestamp | null;
}
interface TxRecord {
  id: string; type: string; points: number; balanceAfter: number;
  orderId?: string; adminNote?: string; createdAt: Timestamp | null;
}

type ProfileOrderRow = Pick<Order, 'id' | 'orderId' | 'status' | 'totalAmount'> & {
  // Firestore snapshots surface Timestamp; legacy/import paths may carry Date.
  createdAt?: Timestamp | Date | null;
};

const TX_META: Record<string, { label: string; color: string }> = {
  earn:          { label: 'Earned',         color: 'var(--success)' },
  redeem:        { label: 'Redeemed',       color: 'var(--gold-text)' },
  admin_add:     { label: 'Admin Added',    color: 'var(--steel)' },
  admin_deduct:  { label: 'Admin Deducted', color: 'var(--danger)' },
  welcome:       { label: 'Welcome Bonus',  color: 'var(--success)' },
  expired:       { label: 'Annual Reset',   color: 'var(--muted)' },
  // R3 file2 Bug #7: previously refund + earn_reversed rows fell
  // through to the fallback `tx.type` literal (rendered as "refund"
  // / "earn_reversed" in default text color), so admin saw debug-
  // looking enum values mixed in with the labelled row history.
  // The cancel-cycle path (restoreStockAndCredit) writes both types
  // so they're regular occurrences once admin can move delivered
  // orders backward through the workflow.
  refund:        { label: 'Order Refund',   color: 'var(--info)' },
  earn_reversed: { label: 'Earn Reversed',  color: 'var(--warning)' },
};

/**
 * Format a Firestore Timestamp (or null) for display. Accepts the
 * client SDK's Timestamp class and a plain Date as fallbacks for
 * legacy/imported data.
 */
function fmtDate(ts: Timestamp | Date | null | undefined): string {
  if (!ts) return '—';
  const d = ts instanceof Date ? ts : ts.toDate();
  return new Intl.DateTimeFormat(undefined, { year:'numeric', month:'short', day:'numeric' }).format(d);
}

/**
 * Format a duration in milliseconds for human display. Picks the
 * largest non-zero unit and adds one sub-unit when meaningful:
 *   45000        → "45s"
 *   75 * 60_000  → "1h 15m"
 *   undefined/0  → "—"
 *
 * Used by the customer profile modal's "Time on site" card. Distinguishes
 * between "no data" (—) and "actually zero" (also —, intentional —
 * a customer who logged in for 0 seconds isn't useful analytics).
 */
function fmtDuration(ms: number | undefined | null): string {
  if (!ms || ms <= 0) return '—';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) {
    const remSec = sec - min * 60;
    return remSec > 0 && min < 5 ? `${min}m ${remSec}s` : `${min}m`;
  }
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    const remMin = min - hr * 60;
    return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
  }
  const day = Math.floor(hr / 24);
  const remHr = hr - day * 24;
  return remHr > 0 ? `${day}d ${remHr}h` : `${day}d`;
}

// ── Customer profile modal ─────────────────────────────────────────────────
function ProfileModal({ customer, onClose, onAdjust }: {
  customer: CustomerRow;
  onClose: () => void;
  onAdjust: (c: CustomerRow) => void;
}) {
  const [orders, setOrders]   = useState<ProfileOrderRow[]>([]);
  const [txList, setTxList]   = useState<TxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const cc = useCreditConfig();

  useEffect(() => {
    async function load() {
      try {
        const [ordSnap, txSnap] = await Promise.all([
          getDocs(query(collection(db, 'orders'), where('userId','==',customer.uid), orderBy('createdAt','desc'))),
          getDocs(query(collection(db, 'creditTransactions'), where('userId','==',customer.uid), orderBy('createdAt','desc'))),
        ]);
        setOrders(ordSnap.docs.map(d => ({ ...(d.data() as Omit<ProfileOrderRow, 'id'>), id: d.id })));
        setTxList(txSnap.docs.map(d => ({ ...d.data(), id: d.id } as TxRecord)));
      } finally { setLoading(false); }
    }
    load();
  }, [customer.uid]);

  const completedOrders = orders.filter(o => o.status === 'delivered').length;
  const totalSpent = orders.filter(o => ['delivered','in_progress'].includes(o.status))
    .reduce((s, o) => s + (o.totalAmount ?? 0), 0);

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={customer.displayName || customer.email}
      subtitle={customer.email}
      size="md"
      darkHeader
      footer={
        <>
          <ModalBtn variant="outline" onClick={onClose}>Close</ModalBtn>
          <ModalBtn onClick={() => { onClose(); onAdjust(customer); }}>Adjust Credits</ModalBtn>
        </>
      }
    >
        <div className="ac-pm-stack">
          {loading ? (
            <div className="ac-pm-loading">
              <RefreshCw size={24} className="icon-spin ac-pm-loading-spinner" />
              <p className="ac-pm-loading-msg">Loading profile…</p>
            </div>
          ) : (
            <div className="ac-pm-content">

              {/* Stats grid — 4 cards on wide viewports, 2x2 on narrow */}
              <div className="ac-pm-stats-grid">
                {[
                  { icon:ShoppingBag, label:'Total Orders',  value:orders.length, color:'var(--gold-text)' },
                  { icon:Package,     label:'Completed',     value:completedOrders, color:'var(--success)' },
                  { icon:DollarSign,  label:'Total Spent',   value:`$${totalSpent.toFixed(2)}`, color:'var(--gold-text)' },
                  { icon:Clock,       label:'Time on Site',  value:fmtDuration(customer.totalActiveMs), color:'var(--steel)' },
                ].map(({ icon:Icon, label, value, color }) => (
                  <div key={label} className="ac-pm-stat-tile">
                    {/* Per-stat icon color comes from the stat config above
                        (gold-text / success / steel). The static layout —
                        margin auto, sizing — is in .ac-pm-stat-icon. The
                        `style` prop on a React component (not a DOM node)
                        doesn't trip react/forbid-dom-props. */}
                    <Icon size={16} className="ac-pm-stat-icon" style={{ color }} />
                    <p className="ac-pm-stat-val">{value}</p>
                    <p className="ac-pm-stat-label">{label}</p>
                  </div>
                ))}
              </div>

              {/* Contact info */}
              <div className="ac-pm-info-card">
                <p className="ac-pm-section-eyebrow">Account Info</p>
                <div className="ac-pm-info-rows">
                  <InfoRow icon={Mail}     label="Email"        value={customer.email} />
                  <InfoRow icon={Calendar} label="Joined"       value={fmtDate(customer.createdAt)} />
                  <InfoRow icon={Coins}    label="Balance"      value={`${customer.balance.toLocaleString()} pts (≈ $${cc.calcCreditValue(customer.balance).toFixed(2)})`} />
                  {/* Session metrics — only show "Last seen" if there's
                      ever been a session; otherwise the row is noise. */}
                  {customer.lastSessionEndedAt && (
                    <InfoRow icon={Clock} label="Last seen"     value={fmtDate(customer.lastSessionEndedAt)} />
                  )}
                  {customer.lastSessionMs != null && customer.lastSessionMs > 0 && (
                    <InfoRow icon={Clock} label="Last session"  value={fmtDuration(customer.lastSessionMs)} />
                  )}
                </div>
              </div>

              {/* Credit summary */}
              <div className="ac-pm-credit-card">
                <p className="ac-pm-section-eyebrow">Credit History</p>
                <div className="ac-pm-credit-grid">
                  {[
                    ['Current Balance',  `${customer.balance.toLocaleString()} pts`],
                    ['Credit Value',     `$${cc.calcCreditValue(customer.balance).toFixed(2)}`],
                    ['Lifetime Earned',  `${customer.lifetimeEarned.toLocaleString()} pts`],
                    ['Lifetime Redeemed',`${customer.lifetimeRedeemed.toLocaleString()} pts`],
                  ].map(([label, value]) => (
                    <div key={label} className="ac-pm-credit-tile">
                      <p className="ac-pm-credit-tile-label">{label}</p>
                      <p className="ac-pm-credit-tile-val">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent orders */}
              {orders.length > 0 && (
                <div>
                  <p className="ac-pm-section-eyebrow-tight">Recent Orders</p>
                  <div className="ac-pm-orders-list">
                    {orders.slice(0,5).map(o => (
                      <div key={o.id} className="ac-pm-order-row">
                        <div>
                          <p className="ac-pm-order-id">#{(o.orderId || o.id).slice(-8)}</p>
                          <p className="ac-pm-order-date">{fmtDate(o.createdAt)}</p>
                        </div>
                        <div className="ac-pm-order-right">
                          <p className="ac-pm-order-total">${(o.totalAmount??0).toFixed(2)}</p>
                          <span className="ac-pm-order-status" data-status={o.status}>
                            {o.status.replace('_',' ')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transaction history */}
              {txList.length > 0 && (
                <div>
                  <p className="ac-pm-section-eyebrow-tight">Credit Transactions</p>
                  <div className="ac-pm-tx-list">
                    {txList.map(tx => {
                      const meta = TX_META[tx.type] || { label:tx.type, color:'var(--text)' };
                      return (
                        <div key={tx.id} className="ac-pm-tx-row">
                          <div>
                            <span
                              className="ac-pm-tx-pill"
                              /* Per-row pill color is from TX_META; passes
                                 through --ac-tx-color so the pill border,
                                 pill text, AND the points number further
                                 down all share the one source. */
                              // eslint-disable-next-line react/forbid-dom-props
                              style={{ ['--ac-tx-color' as string]: meta.color }}
                            >
                              {meta.label}
                            </span>
                            {tx.adminNote && <p className="ac-pm-tx-note">{tx.adminNote}</p>}
                            <p className="ac-pm-tx-date">{fmtDate(tx.createdAt)}</p>
                          </div>
                          <div className="ac-pm-tx-right">
                            <p
                              className="ac-pm-tx-pts"
                              // eslint-disable-next-line react/forbid-dom-props
                              style={{ ['--ac-tx-color' as string]: meta.color }}
                            >
                              {tx.points>0?'+':''}{tx.points.toLocaleString()} pts
                            </p>
                            <p className="ac-pm-tx-bal">{tx.balanceAfter.toLocaleString()} bal</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
    </Modal>
  );
}

function InfoRow({ icon:Icon, label, value }: { icon: React.ComponentType<{ size?: number; className?: string }>; label:string; value:string }) {
  return (
    <div className="ac-info-row">
      <Icon size={13} className="ac-info-row-icon" />
      <span className="ac-info-row-label">{label}:</span>
      <span className="ac-info-row-value">{value}</span>
    </div>
  );
}

// ── Adjust credits modal ───────────────────────────────────────────────────
function AdjustModal({ customer, currentUser, onClose, onSuccess }: {
  customer: CustomerRow; currentUser: User | null; onClose: () => void; onSuccess: (uid:string, delta:number) => void;
}) {
  const [saving, setSaving] = useState(false);
  const cc = useCreditConfig();

  // Phase 6 migration: ad-hoc useState → RHF + Zod + <Field> primitives.
  // The schema (adminCreditFormSchema) tracks {mode, points, note}; the
  // signed `points` for the backend is derived in the submit handler.
  const form = useForm<AdminCreditFormInput>({
    resolver: zodResolver(adminCreditFormSchema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: { mode: 'add', points: 0, note: '' },
  });
  const mode  = form.watch('mode');
  const ptsRaw = form.watch('points');
  const note   = form.watch('note');

  async function handleSave(data: AdminCreditFormInput) {
    if (!currentUser) { toast.error('Sign in to adjust credit'); return; }
    const final = data.mode === 'deduct' ? -Math.abs(data.points) : Math.abs(data.points);
    setSaving(true);
    try {
      // adminAdjustCredit returns the ACTUALLY-applied delta (which can
      // be smaller than `final` when admin tries to deduct more than
      // the user has — newBalance is floored at 0). Use the actual
      // value in the toast so we don't tell admin "−1000 pts applied"
      // when only 200 actually moved.
      const { actualDelta, newBalance } = await adminAdjustCredit(
        { userId: customer.uid, points: final, note: data.note },
        currentUser.uid,
      );
      if (actualDelta === 0) {
        toast.info('No change — balance is already at 0.');
      } else if (actualDelta !== final) {
        toast.success(
          `${actualDelta > 0 ? '+' : ''}${actualDelta} pts applied (clamped from ${final}). Balance: ${newBalance}.`,
        );
      } else {
        toast.success(`${actualDelta > 0 ? '+' : ''}${actualDelta} pts applied. Balance: ${newBalance}.`);
      }
      onSuccess(customer.uid, actualDelta);
      onClose();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Adjust Credits"
      subtitle={customer.email}
      size="sm"
      darkHeader
      footer={
        <>
          <ModalBtn variant="outline" onClick={onClose} disabled={saving}>Cancel</ModalBtn>
          <ModalBtn
            onClick={form.handleSubmit(handleSave)}
            disabled={!ptsRaw || !note}
            loading={saving}
            variant={mode === 'add' ? 'success' : 'danger'}
          >
            {/* R3 file2 Bug #12: preview the clamped deduction. The
                post-action toast already tells the truth (Bug 20 fix),
                but the button preview still implied the full amount —
                admin clicking "Deduct 1000 pts" on a 200-pt account
                saw the button text promise more movement than would
                happen. Now: when deducting more than the balance, the
                button reads the clamped amount with a hint. Add path
                is unchanged because additions don't clamp. */}
            {(() => {
              const requested = ptsRaw || 0;
              if (mode === 'add') {
                return `Add ${requested.toLocaleString() || '0'} pts`;
              }
              const willMove = Math.min(requested, customer.balance);
              if (requested > customer.balance && customer.balance > 0) {
                return `Deduct ${willMove.toLocaleString()} pts (max)`;
              }
              return `Deduct ${requested.toLocaleString() || '0'} pts`;
            })()}
          </ModalBtn>
        </>
      }
    >
        <form onSubmit={form.handleSubmit(handleSave)} className="ac-am-stack">
          <p className="ac-am-current">
            Current: <strong>{customer.balance.toLocaleString()} pts</strong>
          </p>
          <div className="ac-am-mode-row">
            {(['add','deduct'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => form.setValue('mode', m, { shouldValidate: true })}
                className="ac-am-mode-btn"
                data-mode={m}
                data-active={mode === m ? 'true' : 'false'}
              >
                {m==='add' ? <Plus size={13}/> : <Minus size={13}/>}
                {m==='add' ? 'Add Points' : 'Deduct Points'}
              </button>
            ))}
          </div>
          <Field name="points" required>
            <Field.Label>Points to {mode}</Field.Label>
            <Field.Input
              type="number"
              min="1"
              step="100"
              placeholder="e.g. 1000"
              {...form.register('points', { valueAsNumber: true })}
            />
            {ptsRaw > 0 && <Field.Hint>≈ ${cc.calcCreditValue(ptsRaw).toFixed(2)} credit value</Field.Hint>}
            <Field.Error>{form.formState.errors.points?.message}</Field.Error>
          </Field>
          <Field name="note" required>
            <Field.Label>Reason (required)</Field.Label>
            <Field.Textarea
              rows={2}
              placeholder="e.g. Loyalty reward, compensation…"
              {...form.register('note')}
            />
            <Field.Error>{form.formState.errors.note?.message}</Field.Error>
          </Field>
          {/* Hidden submit button so Enter-in-input submits the form
              even though the visible Save button lives in the Modal
              footer (outside this <form>). The form.handleSubmit is
              also wired to the footer ModalBtn click for redundancy. */}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
    </Modal>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
const DEFAULT_PAGE_SIZE = 15;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function AdminCustomers() {
  const { currentUser } = useAuth();
  const [customers, setCustomers]  = useState<CustomerRow[]>([]);
  const [loading, setLoading]      = useState(true);
  const [loadError, setLoadError]  = useState<string | null>(null);
  const [search, setSearch]        = useState('');
  const [page, setPage]            = useState(1);
  // Page size is admin-controllable so a power user can pull 100 rows
  // at once for a quick scan, while default keeps the table compact.
  const [pageSize, setPageSize]    = useState<number>(DEFAULT_PAGE_SIZE);
  const [profileTarget, setProfileTarget] = useState<CustomerRow | null>(null);
  const [adjustTarget, setAdjustTarget]   = useState<CustomerRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [usersSnap, creditSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'credits')),
      ]);
      const creditMap: Record<string, Partial<CreditAccount>> = {};
      creditSnap.docs.forEach(d => { creditMap[d.id] = d.data() as Partial<CreditAccount>; });
      const list = usersSnap.docs.map(d => {
        const u = d.data();
        const c = creditMap[d.id] || {};
        return {
          uid: d.id, email: u.email || '', displayName: u.displayName,
          createdAt: u.createdAt,
          balance:          c.balance          || 0,
          lifetimeEarned:   c.lifetimeEarned   || 0,
          lifetimeRedeemed: c.lifetimeRedeemed || 0,
          lifetimeSpend:    c.lifetimeSpend    || 0,
          orderCount:       c.orderCount       || 0,
          // Session-tracking fields live on /users (written by useSessionTracker).
          // Optional — pre-feature users won't have them, default to 0/null
          // and the modal renders "—" via fmtDuration's empty-input handling.
          totalActiveMs:      u.totalActiveMs      ?? 0,
          lastSessionMs:      u.lastSessionMs      ?? 0,
          lastSessionEndedAt: u.lastSessionEndedAt ?? null,
        } as CustomerRow;
      });
      setCustomers(list.sort((a, b) => b.lifetimeSpend - a.lifetimeSpend));
    } catch (err) {
      console.error('[AdminCustomers] load failed:', err);
      setLoadError('Could not load customers. Please check your connection or permissions.');
      toast.error('Failed to load customers');
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = customers.filter(c =>
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    (c.displayName||'').toLowerCase().includes(search.toLowerCase())
  );
  // Pagination component computes total pages internally from
  // (totalItems / pageSize); we only need the sliced rows here.
  const paged       = filtered.slice((page-1)*pageSize, page*pageSize);

  const stats = {
    total:       customers.length,
    withOrders:  customers.filter(c => c.orderCount > 0).length,
    withCredits: customers.filter(c => c.balance > 0).length,
    totalPts:    customers.reduce((s, c) => s + c.balance, 0),
  };

  function handleAdjustSuccess(uid: string, delta: number) {
    setCustomers(prev => prev.map(c => c.uid === uid ? { ...c, balance: Math.max(0, c.balance + delta) } : c));
  }

  return (
    <div className="ac-shell">
      <AdminPageHeader
        eyebrow="Accounts & credits"
        title="Customers"
        description="Customer accounts, their orders and reward points. Adjust credits from each customer’s card."
      />

      {/* Stats */}
      <div className="ac-stats-grid">
        {[
          { icon:Users,    label:'Total Customers', value:stats.total        },
          { icon:Package,  label:'With Orders',     value:stats.withOrders   },
          { icon:Coins,    label:'With Credits',    value:stats.withCredits  },
          { icon:DollarSign,label:'Total Pts',      value:`${stats.totalPts.toLocaleString()} pts` },
        ].map(({ icon:Icon, label, value }) => (
          <div key={label} className="card card-body ac-stat-card">
            <div className="ac-stat-card-row">
              <div className="ac-stat-icon">
                <Icon size={14} className="ac-stat-icon-svg" />
              </div>
              <div>
                <p className="ac-stat-value">{value}</p>
                <p className="ac-stat-label">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + refresh */}
      <div className="ac-toolbar">
        <div className="ac-search-wrap">
          <SearchBar
            size="sm"
            value={search}
            onChange={v => { setSearch(v); setPage(1); }}
            placeholder="Search by email or name…"
          />
        </div>
        <button onClick={load} className="btn btn-outline btn-sm ac-refresh-btn">
          <RefreshCw size={13} /> Refresh
        </button>
        <span className="ac-count">
          {filtered.length} customer{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Customer list */}
      {loadError && <div className="aa-error-banner">{loadError}</div>}
      {loading ? (
        <div className="ac-empty">
          <RefreshCw size={28} className="icon-spin ac-empty-spinner" />
          <p className="ac-empty-msg-sm">Loading customers…</p>
        </div>
      ) : paged.length === 0 ? (
        <div className="ac-empty">
          <Users size={32} className="ac-empty-icon" />
          <p className="ac-empty-msg">{search ? 'No customers match your search' : 'No customers yet'}</p>
        </div>
      ) : (
        <div className="ac-list">
          {paged.map(c => (
            <div key={c.uid} className="card ac-row">
              {/* Avatar */}
              <div className="ac-avatar">
                <UserIcon size={16} className="ac-avatar-icon" />
              </div>

              {/* Info */}
              <div className="ac-info">
                <p className="ac-name">{c.displayName || c.email}</p>
                <p className="ac-email">{c.email}</p>
                {c.createdAt && <p className="ac-joined">Joined {fmtDate(c.createdAt)}</p>}
              </div>

              {/* Stats */}
              <div className="ac-row-stats">
                <div className="ac-row-stat">
                  <p className="ac-row-stat-val">${c.lifetimeSpend.toFixed(0)}</p>
                  <p className="ac-row-stat-cap">SPEND</p>
                </div>
                <div className="ac-row-stat">
                  <p className="ac-row-stat-val">{c.orderCount}</p>
                  <p className="ac-row-stat-cap">ORDERS</p>
                </div>
                <div className="ac-row-stat">
                  <p className="ac-row-stat-val-gold">{c.balance.toLocaleString()}</p>
                  <p className="ac-row-stat-cap">POINTS</p>
                </div>
              </div>

              {/* Actions */}
              <div className="ac-actions">
                <button onClick={() => setProfileTarget(c)} className="btn btn-outline btn-sm ac-action-btn">
                  <Eye size={12} /> View
                </button>
                <button onClick={() => setAdjustTarget(c)} className="btn btn-outline btn-sm ac-action-btn">
                  <Coins size={12} /> Credits
                </button>
              </div>
            </div>
          ))}

          {/* Pagination — Google Cloud Console-style data-table footer.
              Always rendered when results exist so the size selector
              stays accessible; chevrons disable when there's only
              one page. totalPages is read by the surrounding fragment
              for the empty-state guard above. */}
          {filtered.length > 0 && (
            <Pagination
              page={page}
              pageSize={pageSize}
              totalItems={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          )}
        </div>
      )}

      {/* Modals */}
      {profileTarget && (
        <ProfileModal customer={profileTarget} onClose={() => setProfileTarget(null)} onAdjust={c => { setProfileTarget(null); setAdjustTarget(c); }} />
      )}
      {adjustTarget && (
        <AdjustModal customer={adjustTarget} currentUser={currentUser} onClose={() => setAdjustTarget(null)} onSuccess={handleAdjustSuccess} />
      )}
    </div>
  );
}
export default AdminCustomers;
