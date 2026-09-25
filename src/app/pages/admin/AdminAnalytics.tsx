/**
 * AdminAnalytics — Ele Café
 * Adapted from reference project's AdminAnalyticsDashboard.
 * Uses Ele Café's order schema: status, totalAmount, shippingFee, gst, etc.
 */
import { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, BarChart2, Calendar, CheckCircle2, ChevronRight, DollarSign, Package, ShoppingBag, Sparkles, TrendingUp, Users, Wallet, X } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
// Schema-fidelity round 2: the parallel `src/types/firestore.ts` was
// removed. Aliases preserve the local names while sourcing types from
// the canonical schemas.
import type { Order as OrderDoc, UserProfile as UserDoc } from '@/types';

import { Modal, ModalBtn } from '@/app/components/modals/Modal';

import { AdminPageHeader } from '@/app/components/admin/AdminPageHeader';
/**
 * AdminAnalytics tolerates partial documents — historical orders may
 * be missing newer fields (e.g. `customerId` was added later). Using
 * Partial<> + the safe accessors below keeps the dashboard rendering
 * even when the data shape drifts across migrations.
 */
type OrderRow    = Partial<OrderDoc> & { id: string };
type CustomerRow = Partial<UserDoc>  & { id: string };

type Period = 'last7' | 'last30' | 'last3m' | 'last6m' | 'last12m' | 'custom';

const PERIODS: { value: Period; label: string }[] = [
  { value:'last7',   label:'Last 7 Days'   },
  { value:'last30',  label:'Last 30 Days'  },
  { value:'last3m',  label:'Last 3 Months' },
  { value:'last6m',  label:'Last 6 Months' },
  { value:'last12m', label:'Last 12 Months'},
];

function getRange(p: Period, customStart?: Date, customEnd?: Date) {
  // Same root cause as AdminVerificationAnalytics / AdminVisitsAnalytics:
  // the old `customEnd ?? new Date()` line let the typed custom-end
  // date leak into preset ranges, and the setHours call mutated the
  // caller's customEnd Date in place. After the admin used "Custom"
  // once, switching back to any preset (e.g. "Last 7 Days") silently
  // anchored the end-of-range to that stale custom date, hiding
  // today's orders from the dashboard.
  if (p === 'custom' && customStart) {
    const s = new Date(customStart); s.setHours(0, 0, 0, 0);
    const e = customEnd ? new Date(customEnd) : new Date();
    e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const start = new Date();
  if (p === 'last7')  start.setDate(start.getDate() - 7);
  else if (p==='last30')  start.setDate(start.getDate() - 30);
  else if (p==='last3m')  start.setMonth(start.getMonth() - 3);
  else if (p==='last6m')  start.setMonth(start.getMonth() - 6);
  else start.setMonth(start.getMonth() - 12);
  start.setHours(0,0,0,0);
  return { start, end };
}

/**
 * Coerce one of the many shapes a Firestore-derived "createdAt" field
 * can take into a Date. Inputs we actually see in this codebase:
 *   - Firestore Timestamp instance (.toDate() exists)
 *   - Serialized Timestamp shape ({ seconds, nanoseconds })
 *   - Date instance, ISO string, or Unix-ms number
 *   - null/undefined for missing values
 * Returns null if the value can't be parsed.
 */
type MaybeTimestamp =
  | { toDate(): Date }
  | { seconds: number; nanoseconds?: number }
  | Date
  | string
  | number
  | null
  | undefined;

function toDate(raw: MaybeTimestamp): Date | null {
  if (!raw) return null;
  if (typeof raw === 'object' && 'toDate' in raw && typeof raw.toDate === 'function') {
    return raw.toDate();
  }
  if (typeof raw === 'object' && 'seconds' in raw && typeof raw.seconds === 'number') {
    return new Date(raw.seconds * 1000);
  }
  const d = new Date(raw as string | number | Date);
  return isNaN(d.getTime()) ? null : d;
}

// ── Sub-components ─────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'var(--gold)' }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="card card-body sa-stat-card">
      <div className="sa-stat-head">
        <span className="sa-stat-label">{label}</span>
        <div className="icon-wrap icon-wrap-md icon-wrap-gold">
          <Icon size={15} style={{ color }} />
        </div>
      </div>
      <div className="sa-stat-value">{value}</div>
      {sub && <p className="sa-stat-sub">{sub}</p>}
    </div>
  );
}

function ProgressRow({ label, count, total, color }: { label:string; count:number; total:number; color:string }) {
  const pct = total > 0 ? Math.min((count/total)*100, 100) : 0;
  return (
    <div className="sa-progress-row">
      <div className="sa-progress-head">
        <span className="sa-progress-label">{label}</span>
        <span className="sa-progress-count">{count} <span className="sa-progress-pct">({pct.toFixed(1)}%)</span></span>
      </div>
      <div className="sa-progress-track">
        <div
          className="sa-progress-fill"
          /* Per-row fill width + color come from props; stored as
             CSS variables so the static layout (height, radius,
             transition timing) lives in the class. */
          // eslint-disable-next-line react/forbid-dom-props
          style={{
            ['--sa-pct' as string]: `${pct}%`,
            ['--sa-color' as string]: color,
          }}
        />
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title:string; icon:React.ElementType; children:React.ReactNode }) {
  return (
    <div className="card sa-section">
      <div className="sa-section-head">
        <Icon size={16} className="sa-section-icon" />
        <h3 className="sa-section-title">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function AdminAnalytics() {
  const [orders, setOrders]       = useState<OrderRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [period, setPeriod]       = useState<Period>('last30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');
  const [showDateModal, setShowDateModal] = useState(false);
  const [modalStart, setModalStart] = useState('');
  const [modalEnd, setModalEnd]     = useState('');

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    setLoadError(null);
    unsubs.push(onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(500)),
      snap => setOrders(snap.docs.map(d => ({ ...(d.data() as Partial<OrderDoc>), id: d.id }))),
      err => {
        console.error('orders snapshot:', err);
        setLoadError('Some analytics data failed to load. Check your connection or permissions.');
      }
    ));
    unsubs.push(onSnapshot(query(collection(db, 'users'), limit(2000)),
      snap => setCustomers(snap.docs.map(d => ({ ...(d.data() as Partial<UserDoc>), id: d.id }))),
      err => {
        console.error('customers snapshot:', err);
        setLoadError('Some analytics data failed to load. Check your connection or permissions.');
      }
    ));
    return () => {
      try {
        unsubs.forEach(u => u());
      } catch (err) {
        console.error('[AdminAnalytics] cleanup error:', err);
      }
    };
  }, []);

  const analytics = useMemo(() => {
    const customStartDate = customStart ? new Date(customStart + 'T00:00:00') : undefined;
    const customEndDate   = customEnd   ? new Date(customEnd   + 'T23:59:59') : undefined;
    const { start, end }  = getRange(period, customStartDate, customEndDate);

    const filtered = orders.filter(o => {
      const d = toDate(o.createdAt);
      return d && d >= start && d <= end;
    });

    const delivered   = filtered.filter(o => o.status === 'delivered');
    const revenue     = delivered.reduce((s, o) => s + (o.totalAmount ?? 0), 0);
    const pending     = filtered.filter(o => o.status === 'pending').length;
    const inProgress  = filtered.filter(o => o.status === 'in_progress').length;
    const shipped     = filtered.filter(o => o.status === 'shipped').length;
    const cancelled   = filtered.filter(o => o.status === 'cancelled').length;
    const rejected    = filtered.filter(o => o.status === 'rejected').length;
    const expired     = filtered.filter(o => o.status === 'expired').length;

    // AOV is computed over revenue-generating orders only — including
    // cancelled/rejected/expired in the denominator deflated the metric
    // (a $40 cancelled order is $0 revenue but was counted as $0 / 1
    // toward the average). Restrict to the same statuses that count for
    // revenue: paid + fulfilled + shipped + delivered. Pending orders are
    // excluded because the card is only held, not charged.
    const aovEligible = filtered.filter(o =>
      o.status === 'in_progress' || o.status === 'shipped' || o.status === 'delivered'
    );
    const avgOrder = aovEligible.length > 0
      ? aovEligible.reduce((s, o) => s + (o.totalAmount ?? 0), 0) / aovEligible.length
      : 0;
    const totalGST = filtered.reduce((s, o) => s + (o.gst ?? 0), 0);
    const totalShipping = filtered.reduce((s, o) => s + (o.shippingFee ?? 0), 0);
    const totalCredit = filtered.reduce((s, o) => s + (o.creditApplied ?? 0), 0);

    // Tea product frequency. Order line items use productId / productName
    // (the actual fields CheckoutPage writes); the previous keys (`item.id`,
    // `item.name`) didn't exist on the doc, so this reduce silently
    // produced `{undefined: { name: undefined, ... }}` and the chart was
    // empty. We key by productId when present (canonical) and fall back
    // to productName so admin-edited custom items without a productId
    // still aggregate.
    const teaCount: Record<string, { name: string; count: number; revenue: number }> = {};
    filtered.forEach(o => {
      (o.items || []).forEach(item => {
        const it = item as { productId?: string; productName?: string; quantity?: number; price?: number };
        const k    = it.productId || it.productName || 'unknown';
        const name = it.productName || it.productId || 'Unknown item';
        const qty  = it.quantity ?? 0;
        const pr   = it.price ?? 0;
        if (!teaCount[k]) teaCount[k] = { name, count: 0, revenue: 0 };
        teaCount[k].count   += qty;
        teaCount[k].revenue += pr * qty;
      });
    });
    const topTeas = Object.values(teaCount).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    // Weekly revenue
    const weekRev: Record<string, number> = {};
    filtered.forEach(o => {
      const d = toDate(o.createdAt);
      if (!d) return;
      const wk = `W${String(getWeekNumber(d)).padStart(2,'0')}`;
      weekRev[wk] = (weekRev[wk] || 0) + (o.totalAmount ?? 0);
    });
    const weekEntries = Object.entries(weekRev).sort((a,b) => a[0].localeCompare(b[0])).slice(-10);
    const maxWeekRev  = Math.max(...Object.values(weekRev), 1);

    // Customer new vs returning
    const custOrders: Record<string, number> = {};
    filtered.forEach(o => {
      const cid = o.userId || o.customerId || '';
      if (cid) custOrders[cid] = (custOrders[cid] || 0) + 1;
    });
    const newCust  = Object.values(custOrders).filter(c => c === 1).length;
    const retCust  = Object.values(custOrders).filter(c => c > 1).length;

    return {
      filtered, revenue, avgOrder, totalGST, totalShipping, totalCredit,
      pending, inProgress, shipped, delivered: delivered.length, cancelled, rejected, expired,
      topTeas, weekEntries, maxWeekRev, newCust, retCust,
    };
  }, [orders, period, customStart, customEnd]);

  const statusItems = [
    { label:'Delivered',    count:analytics.delivered,   color:'var(--success)' },
    { label:'In Progress',  count:analytics.inProgress,  color:'var(--info)' },
    { label:'Shipped',      count:analytics.shipped,     color:'var(--info)' },
    { label:'Pending',      count:analytics.pending,     color:'var(--warning)' },
    { label:'Cancelled',    count:analytics.cancelled,   color:'var(--danger)' },
    { label:'Rejected',     count:analytics.rejected,    color:'var(--danger)' },
    { label:'Expired',      count:analytics.expired,     color:'var(--muted)' },
  ].filter(s => s.count > 0);
  const totalStatuses = statusItems.reduce((s, i) => s + i.count, 0);

  return (
    <div className="sa-shell">
      <AdminPageHeader
        eyebrow="Revenue & insights"
        title="Analytics"
        description="Sales, orders and best-selling teas for the period you choose."
      />
      {loadError && (
        <div className="card aa-error-banner" role="alert">
          <div className="sa-error-banner-inner">
            <AlertTriangle size={16} />
            <p>{loadError}</p>
          </div>
        </div>
      )}

      {/* Period filter */}
      <div className="card sa-filter-card">
        <div className="sa-filter-header">
          <div className="sa-filter-header-left">
            <Calendar size={14} className="sa-section-icon" />
            <span className="sa-filter-eyebrow">Date Range</span>
          </div>
          <div className="sa-filter-live">
            Live
          </div>
        </div>
        <div className="sa-filter-body">
          {PERIODS.map(p => {
            const active = period === p.value;
            return (
              <button
                key={p.value}
                onClick={() => { setPeriod(p.value); setCustomStart(''); setCustomEnd(''); }}
                className="sa-period-btn"
                data-active={active ? 'true' : 'false'}
              >
                {active && '✓ '}{p.label}
              </button>
            );
          })}
          {/* Custom-range button — uses --accent-purple for its
              "active" state to read as a distinct mode (not just
              emphasised). The white text on the always-coloured
              button is the same theme-invariant pattern as
              .btn-danger / .btn-success in design.css. */}
          <button
            onClick={() => { setModalStart(customStart); setModalEnd(customEnd); setShowDateModal(true); }}
            className="sa-custom-btn"
            data-active={period==='custom' ? 'true' : 'false'}
          >
            <Sparkles size={12} />
            {period==='custom' && customStart && customEnd
              ? `${new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(new Date(customStart+'T12:00:00'))} → ${new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(new Date(customEnd+'T12:00:00'))}`
              : 'Custom Range'}
            {period==='custom' && (
              <button
                onClick={e=>{e.stopPropagation();setPeriod('last30');setCustomStart('');setCustomEnd('');}}
                className="sa-custom-btn-clear"
              >
                <X size={10}/>
              </button>
            )}
          </button>
        </div>
      </div>

      {/* Custom date modal — uses shared Modal for consistent
          scroll-lock, focus trap, ESC handling, and mobile slide-up. */}
      <Modal
        open={showDateModal}
        onClose={() => setShowDateModal(false)}
        title="Custom Date Range"
        subtitle="Filter analytics by any period"
        size="sm"
        darkHeader
        footer={
          <>
            <ModalBtn variant="outline" onClick={() => setShowDateModal(false)}>
              Cancel
            </ModalBtn>
            <ModalBtn
              variant="primary"
              onClick={() => {
                if (modalStart && modalEnd) {
                  setCustomStart(modalStart);
                  setCustomEnd(modalEnd);
                  setPeriod('custom');
                }
                setShowDateModal(false);
              }}
              disabled={!modalStart || !modalEnd}
            >
              <ChevronRight size={15}/> Apply
            </ModalBtn>
          </>
        }
      >
        <div className="sa-date-grid">
          {[['From', 'modalStart', setModalStart, undefined, modalEnd], ['To', 'modalEnd', setModalEnd, modalStart, undefined]].map(([label, _k, _setter, min, max]) => {
            const inputId = `sa-date-${(label as string).toLowerCase()}`;
            return (
              <div key={label as string}>
                <label className="field-label" htmlFor={inputId}>{label as string}</label>
                <input id={inputId} type="date" className="field sa-date-input"
                  value={label === 'From' ? modalStart : modalEnd}
                  onChange={e => (label === 'From' ? setModalStart : setModalEnd)(e.target.value)}
                  min={min as string} max={max as string} />
              </div>
            );
          })}
        </div>
      </Modal>

      {/* KPI stat cards */}
      <div className="sa-kpi-grid">
        <StatCard icon={ShoppingBag} label="Total Orders"    value={analytics.filtered.length} />
        <StatCard icon={DollarSign}  label="Gross Revenue"   value={`$${analytics.revenue.toFixed(0)}`} color="var(--success)" />
        <StatCard icon={Users}       label="Customers"       value={customers.length} color="var(--steel)" />
        <StatCard icon={Package}     label="Avg Order"       value={`$${analytics.avgOrder.toFixed(0)}`} />
        {analytics.totalGST > 0 && (
          <StatCard icon={Wallet} label="GST Collected" value={`$${analytics.totalGST.toFixed(0)}`} color="var(--success)" />
        )}
        <StatCard icon={TrendingUp}  label="Shipping Fees"   value={`$${analytics.totalShipping.toFixed(0)}`} />
      </div>

      {/* Two-column sections */}
      <div className="sa-sections-grid">

        {/* Top teas */}
        <Section title="Top teas" icon={Package}>
          {analytics.topTeas.length === 0
            ? <p className="sa-section-empty">No data for this period</p>
            : <div className="sa-tea-list">
                {analytics.topTeas.map((tea, i) => (
                  <div key={tea.name} className="sa-tea-row">
                    {/* Rank circle — colors come from --gold (1st),
                        --muted (2nd), --gold-deep (3rd), and
                        --surface-3 (default) via [data-rank='N']
                        selectors. */}
                    <div className="sa-tea-rank" data-rank={i + 1}>{i+1}</div>
                    <div className="sa-tea-info">
                      <div className="sa-tea-row-top">
                        <span className="sa-tea-name">{tea.name}</span>
                        <span className="sa-tea-rev">${tea.revenue.toFixed(0)}</span>
                      </div>
                      <div className="sa-tea-bar">
                        <div
                          className="sa-tea-bar-fill"
                          /* Per-tea bar width is dynamic ratio. */
                          // eslint-disable-next-line react/forbid-dom-props
                          style={{ ['--sa-bar-width' as string]: `${analytics.topTeas[0]?.revenue>0?(tea.revenue/analytics.topTeas[0].revenue)*100:0}%` }}
                        />
                      </div>
                      <p className="sa-tea-units">{tea.count} units</p>
                    </div>
                  </div>
                ))}
              </div>
          }
        </Section>

        {/* Order status distribution */}
        <Section title="Order status" icon={BarChart2}>
          {statusItems.length === 0
            ? <p className="sa-section-empty">No orders this period</p>
            : statusItems.map(s => <ProgressRow key={s.label} label={s.label} count={s.count} total={totalStatuses} color={s.color} />)
          }
        </Section>

        {/* New vs returning */}
        <Section title="New vs returning customers" icon={Users}>
          <div className="sa-nvr-grid">
            <div className="sa-nvr-tile sa-nvr-tile-new">
              <p className="sa-nvr-num">{analytics.newCust}</p>
              <p className="sa-nvr-label">New</p>
              <p className="sa-nvr-sub">1st order</p>
            </div>
            <div className="sa-nvr-tile sa-nvr-tile-ret">
              <p className="sa-nvr-num">{analytics.retCust}</p>
              <p className="sa-nvr-label">Returning</p>
              <p className="sa-nvr-sub">2+ orders</p>
            </div>
          </div>
          <ProgressRow label="New" count={analytics.newCust} total={Math.max(analytics.newCust+analytics.retCust,1)} color="var(--steel)" />
          <ProgressRow label="Returning" count={analytics.retCust} total={Math.max(analytics.newCust+analytics.retCust,1)} color="var(--success)" />
        </Section>

        {/* Financial breakdown */}
        <Section title="Financial breakdown" icon={DollarSign}>
          <div className="sa-fin-stack">
            {[
              { label:'Gross Revenue',    value:analytics.revenue,        icon:TrendingUp,  color:'var(--success)'   },
              ...(analytics.totalGST > 0 ? [{ label:'GST Collected', value:analytics.totalGST, icon:Wallet, color:'var(--steel)' }] : []),
              { label:'Shipping Fees',    value:analytics.totalShipping,  icon:Package,     color:'var(--gold-text)' },
              { label:'Credit Applied',   value:analytics.totalCredit,    icon:CheckCircle2, color:'var(--warning)'   },
            ].map((row) => (
              <div key={row.label} className="sa-fin-row">
                <div className="sa-fin-row-left">
                  <row.icon size={14} className="sa-fin-row-icon" />
                  <span className="sa-fin-row-label">{row.label}</span>
                </div>
                <span
                  className="sa-fin-row-value"
                  // eslint-disable-next-line react/forbid-dom-props
                  style={{ ['--sa-fin-color' as string]: row.color }}
                >
                  ${row.value.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Weekly revenue bar chart */}
      {analytics.weekEntries.length > 0 && (
        <Section title="Revenue by week" icon={TrendingUp}>
          <div className="sa-week-chart">
            {analytics.weekEntries.map(([wk, rev]) => (
              <div key={wk} className="sa-week-col">
                <span className="sa-week-rev">
                  {rev>=1000?`$${(rev/1000).toFixed(1)}k`:`$${rev.toFixed(0)}`}
                </span>
                <div
                  className="sa-week-bar"
                  /* Per-bar height is dynamic; layout (radius,
                     transition timing, base) lives in .sa-week-bar. */
                  // eslint-disable-next-line react/forbid-dom-props
                  style={{ ['--sa-week-h' as string]: `${Math.max(4,(rev/analytics.maxWeekRev)*110)}px` }}
                />
                <span className="sa-week-label">{wk}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

    </div>
  );
}

export default AdminAnalytics;
