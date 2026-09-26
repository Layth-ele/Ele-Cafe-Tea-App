import { lazy, Suspense, useEffect, useState } from 'react';
import { AlertTriangle, Clock, Coins, DollarSign, ShoppingBag, Users } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

import { Skeleton } from '@/app/components/ui/skeleton';
import { SeoHead } from '@/app/components/SeoHead';
// Schema-fidelity round 2: the parallel `src/types/firestore.ts` was
// removed. `Order as OrderDoc` and `Product as TeaDoc` preserve the
// local names while sourcing types from the canonical schemas.
import type { Order as OrderDoc, Product as TeaDoc } from '@/types';

import { AdminPageHeader } from '@/app/components/admin/AdminPageHeader';
// SeedButton is admin-only AND statically pulls in mockProducts (~44 KB / 8.4 KB
// gzip of seed data + the full seed flow with Modal). Admins almost never click
// it — most overview loads don't need it. Lazy-loading drops the AdminOverview
// chunk from ~16 KB → ~10 KB and keeps mockProducts entirely out of the admin
// chunk graph until the button is rendered.
const SeedButton = lazy(() =>
  import('../../../scripts/seedEverything').then((m) => ({ default: m.SeedButton })),
);

/**
 * Firestore reads on the admin overview tolerate partial / legacy
 * documents — older orders may be missing fields like `customerId`
 * or have a different status value than the current enum. Using
 * `Partial<>` plus runtime-safe accessors (`?? 0`, `?? ''`) keeps
 * the dashboard rendering even when data drift happens.
 */
type OrderRow = Partial<OrderDoc> & { id: string };
type TeaRow = Partial<TeaDoc> & { slug: string };

interface Stats {
  totalRevenue: number;
  totalOrders: number;
  pendingReview: number; // status === 'pending'
  toFulfil: number; // paid (in_progress / ready_for_pickup), not yet shipped or collected
  totalCustomers: number;
  totalCreditPts: number;
  totalProducts: number;
  /** Turn 6: was `stock: number`, now reflects the inventory projection
   *  (status enum). The widget below renders these via the
   *  .ial-status-badge palette for consistency with AdminProducts. */
  lowStock: {
    slug: string;
    name: string;
    status: 'low_stock' | 'out_of_stock';
    category: string;
  }[];
  recentOrders: {
    id: string;
    orderId: string;
    customerName: string;
    totalAmount: number;
    status: string;
    createdAt: Date | Timestamp | null | undefined;
  }[];
}

const EMPTY: Stats = {
  totalRevenue: 0,
  totalOrders: 0,
  pendingReview: 0,
  toFulfil: 0,
  totalCustomers: 0,
  totalCreditPts: 0,
  totalProducts: 0,
  lowStock: [],
  recentOrders: [],
};

// Matches the order flow: pending (card on hold) → in_progress (approved + charged)
// → ready_for_pickup / shipped → delivered
const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting Approval',
  in_progress: 'Paid — To Fulfil',
  ready_for_pickup: 'Ready for Pickup',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  expired: 'Expired',
};

function formatRecentOrderDate(value: Date | Timestamp | null | undefined): string {
  const date = value instanceof Date ? value : value?.toDate?.();
  return date
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
    : '';
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="stat-card aov-stat">
      <div className="aov-stat-head">
        <span className="aov-stat-label">{label}</span>
        <div className="icon-wrap icon-wrap-md icon-wrap-gold aov-stat-icon-wrap">{icon}</div>
      </div>
      <div className="aov-stat-value" data-accent={accent ? 'gold' : 'default'}>
        {value}
      </div>
      {sub && <p className="aov-stat-sub">{sub}</p>}
    </div>
  );
}

function StatSkeleton() {
  // Phase 5.2: shape-matched skeleton mirroring StatCard layout —
  // header label + icon block, then value + sub. Uses the namespaced
  // Skeleton primitives sized to match StatCard's actual geometry.
  return (
    <div className="card ao-stat-skel">
      <div className="ao-stat-skel-head">
        <Skeleton.Line w={96} h={14} />
        <Skeleton w={36} h={36} className="ao-stat-skel-icon" />
      </div>
      <Skeleton.Line w={128} h={28} className="ao-stat-skel-value" />
      <Skeleton.Line w={80} h={12} />
    </div>
  );
}

export function AdminOverview() {
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    setLoadError(null);

    // Live orders — last 200, most recent first
    const ordersQ = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(200));
    unsubs.push(
      onSnapshot(
        ordersQ,
        (snap) => {
          const orders: OrderRow[] = snap.docs.map((d) => ({
            ...(d.data() as Partial<OrderDoc>),
            id: d.id,
          }));
          const delivered = orders.filter((o) => o.status === 'delivered');
          const revenue = delivered.reduce((s, o) => s + (o.totalAmount ?? 0), 0);
          const pendingReview = orders.filter((o) => o.status === 'pending').length;
          const toFulfil = orders.filter(
            (o) => o.status === 'in_progress' || o.status === 'ready_for_pickup',
          ).length;
          const recent = orders.slice(0, 8).map((o) => ({
            id: o.id,
            orderId: o.orderId || o.id.slice(0, 8),
            // Pickup orders don't have shippingAddress.name, so falling
            // back to the raw customerId (a UUID) wasn't useful for admin
            // skimming the list. Show a clear "Pickup order" label
            // instead — admin can still click through to see the full
            // detail with customer info.
            customerName:
              o.shippingAddress?.name || (o.fulfillmentMethod === 'pickup' ? 'Pickup order' : '—'),
            totalAmount: o.totalAmount ?? 0,
            status: o.status ?? 'pending',
            createdAt: o.createdAt,
          }));
          setStats((prev) => ({
            ...prev,
            totalRevenue: revenue,
            totalOrders: orders.length,
            pendingReview,
            toFulfil,
            recentOrders: recent,
          }));
          setLoading(false);
        },
        (err) => {
          console.error('AdminOverview snapshot:', err);
          setLoadError('Could not load overview data. Please refresh or check permissions.');
          setLoading(false);
        },
      ),
    );

    // Users count — limit 1000 (just need the count)
    unsubs.push(
      onSnapshot(
        query(collection(db, 'users'), limit(1000)),
        (snap) => setStats((prev) => ({ ...prev, totalCustomers: snap.size })),
        (err) => {
          console.error('AdminOverview snapshot:', err);
          setLoadError('Could not load overview data. Please refresh or check permissions.');
          setLoading(false);
        },
      ),
    );

    // Teas — total + low/out of stock from inventory projection (limit 300)
    unsubs.push(
      onSnapshot(
        query(collection(db, 'teas'), limit(300)),
        (snap) => {
          const teas: TeaRow[] = snap.docs.map((d) => ({
            ...(d.data() as Partial<TeaDoc>),
            slug: d.id,
          }));
          // Turn 6 cleanup: previous version filtered by `t.stock < 15`.
          // The `stock` field has been dropped from the schema. We now
          // use the inventory-projected `availabilityLabel` field — same
          // intent (surface what needs the admin's attention), driven
          // by the inventory level (0-10) not a count.
          //
          // Sort order: out_of_stock first (most urgent), then low_stock,
          // then alphabetical-by-name as a stable tiebreaker so the same
          // ordering appears across reloads.
          const low = teas
            .filter(
              (t) =>
                t.isActive !== false &&
                (t.availabilityLabel === 'low_stock' || t.availabilityLabel === 'out_of_stock'),
            )
            .sort((a, b) => {
              const rank = (s: string | undefined) =>
                s === 'out_of_stock' ? 0 : s === 'low_stock' ? 1 : 2;
              const ra = rank(a.availabilityLabel);
              const rb = rank(b.availabilityLabel);
              if (ra !== rb) return ra - rb;
              return (a.name ?? '').localeCompare(b.name ?? '');
            });
          const lowStock = low.slice(0, 10).map((t) => ({
            slug: t.slug,
            name: t.name ?? '',
            // `availabilityLabel` is filtered to one of two values above,
            // but TypeScript can't narrow that through the .filter call.
            // Cast is safe by construction.
            status: t.availabilityLabel as 'low_stock' | 'out_of_stock',
            category: t.category ?? '',
          }));
          setStats((prev) => ({
            ...prev,
            totalProducts: teas.filter((t) => t.isActive !== false).length,
            lowStock,
          }));
        },
        (err) => {
          console.error('AdminOverview snapshot:', err);
          setLoadError('Could not load overview data. Please refresh or check permissions.');
          setLoading(false);
        },
      ),
    );

    // Total credit points — limit 2000
    unsubs.push(
      onSnapshot(
        query(collection(db, 'credits'), limit(2000)),
        (snap) => {
          const total = snap.docs.reduce((s, d) => s + (d.data().balance ?? 0), 0);
          setStats((prev) => ({ ...prev, totalCreditPts: total }));
        },
        (err) => {
          console.error('AdminOverview snapshot:', err);
          setLoadError('Could not load overview data. Please refresh or check permissions.');
          setLoading(false);
        },
      ),
    );

    return () => {
      try {
        unsubs.forEach((u) => u());
      } catch (err) {
        console.error('AdminOverview cleanup:', err);
      }
    };
  }, []);

  if (loading)
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
      </div>
    );

  return (
    <>
      <SeoHead
        title="Overview | Ele Café Admin"
        description="Live dashboard — orders, revenue, stock and customers."
        noIndex={true}
      />
      {loadError && <div className="aa-error-banner">{loadError}</div>}
      <div className="space-y-6">
        <AdminPageHeader
          eyebrow="Stats & activity"
          title="Overview"
          description="Live data · last 200 orders"
          actions={
            <Suspense fallback={null}>
              <SeedButton />
            </Suspense>
          }
        />

        {/* Empty database banner */}
        {stats.totalProducts === 0 && (
          <div className="aov-empty-banner">
            <span className="aov-empty-emoji">🌿</span>
            <div className="aov-empty-body">
              <p className="aov-empty-title">Database is empty — no teas found</p>
              <p className="aov-empty-msg">
                Click "Seed Database" above to populate the starter teas, categories and counters.
                Check "Overwrite" if you want to reset existing data.
              </p>
            </div>
          </div>
        )}

        {/* KPI grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<DollarSign className="icon-md" />}
            label="Delivered Revenue"
            value={`$${stats.totalRevenue.toFixed(2)}`}
            accent
          />
          <StatCard
            icon={<ShoppingBag className="icon-md" />}
            label="Total Orders"
            value={stats.totalOrders}
          />
          <StatCard
            icon={<Clock className="icon-md" />}
            label="Pending Review"
            value={stats.pendingReview}
            sub={stats.pendingReview > 0 ? 'Needs approval in Orders' : 'None pending'}
          />
          <StatCard
            icon={<Clock className="icon-md" />}
            label="To Fulfil"
            value={stats.toFulfil}
            sub={stats.toFulfil > 0 ? 'Paid — ready to ship or hand over' : undefined}
          />
          <StatCard
            icon={<Users className="icon-md" />}
            label="Customers"
            value={stats.totalCustomers}
          />
          <StatCard
            icon={<Coins className="icon-md" />}
            label="Credits in Circulation"
            value={`${stats.totalCreditPts.toLocaleString()} pts`}
            sub={`≈ $${(stats.totalCreditPts / 1000).toFixed(2)} outstanding`}
          />
          <StatCard
            icon={<ShoppingBag className="icon-md" />}
            label="Active Teas"
            value={stats.totalProducts}
          />
          <StatCard
            icon={<AlertTriangle className="icon-md" />}
            label="Low Stock Teas"
            value={stats.lowStock.length}
            sub={stats.lowStock.length > 0 ? 'See table below' : 'All stocked'}
          />
        </div>

        {/* Alerts */}
        {stats.pendingReview > 0 && (
          <div className="rounded-xl p-4 flex items-center gap-3 aov-alert">
            <Clock className="h-5 w-5 flex-shrink-0 aov-alert-icon" />
            <p className="text-sm aov-alert-text">
              {stats.pendingReview > 0 && (
                <>
                  <strong>{stats.pendingReview}</strong> order{stats.pendingReview > 1 ? 's' : ''}{' '}
                  waiting for approval — the customer&apos;s card is on hold until you approve or
                  reject.{' '}
                </>
              )}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent orders */}
          <div className="card aov-card">
            <div className="card-head">
              <h3>Recent Orders</h3>
            </div>
            <div>
              {stats.recentOrders.length === 0 ? (
                <p className="aov-empty-msg-c">No orders yet</p>
              ) : (
                <div className="divide-y">
                  {stats.recentOrders.map((o) => {
                    const ts = formatRecentOrderDate(o.createdAt);
                    return (
                      <div key={o.id} className="aov-order-row">
                        <div className="flex-1 min-w-0">
                          <p className="aov-order-id">{o.orderId}</p>
                          <p className="aov-order-meta">
                            {o.customerName} · {ts}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="aov-order-total">${o.totalAmount.toFixed(2)}</p>
                          <p className="aov-order-status">{STATUS_LABEL[o.status] ?? o.status}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Low stock */}
          <div className="card aov-card">
            <div className="card-head">
              <AlertTriangle size={14} className="icon-warning" />
              <h3>Low Stock Teas</h3>
            </div>
            <div>
              {stats.lowStock.length === 0 ? (
                <p className="aov-empty-msg-c">All teas well stocked</p>
              ) : (
                <div className="divide-y">
                  {stats.lowStock.map((t) => (
                    <div key={t.slug} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="aov-stock-name">{t.name}</p>
                        <p className="aov-stock-cat">{t.category}</p>
                      </div>
                      {/* Turn 6: status badge (.ial-status-badge palette from
                        the audit log) instead of a numeric "X left" count.
                        The two-status filter upstream guarantees status is
                        either low_stock or out_of_stock. */}
                      <span className="ial-status-badge" data-status={t.status}>
                        {t.status === 'out_of_stock' ? 'Out of stock' : 'Low stock'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
export default AdminOverview;
