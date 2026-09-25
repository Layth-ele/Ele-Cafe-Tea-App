/**
 * AccountPage — /account
 *
 * Layout:
 *   1. Page hero (overline + name + gold rule) — unchanged.
 *   2. Four collapsible cards (Collapsible component):
 *        • Ele Café Credits         (open by default — at-a-glance balance)
 *        • Order History            (open by default — recency matters)
 *        • Profile Details          (collapsed)
 *        • Saved Addresses          (collapsed)
 *      The collapsed-by-default sections cut the initial scroll length
 *      by ~60% on mobile while keeping the high-value info above the
 *      fold. Open/closed state is persisted to localStorage per-section
 *      so customers don't have to re-open the same sections each visit.
 *
 * Order History:
 *   Subscribes to the user's last 5 orders for the inline preview, and
 *   shows a "View all orders" link that points at /orders for the full
 *   history (which keeps its 100-order limit). Each row carries a
 *   Reorder button that calls useReorder() — same code path as the
 *   button on /orders, so the UX is consistent.
 */
import { useEffect, useMemo, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router';
import {
  ArrowRight,
  ChevronRight,
  Coins,
  History,
  MapPin,
  Phone,
  Plus,
  RotateCcw,
  Save,
  ShoppingBag,
  Trash2,
  User,
} from 'lucide-react';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ROUTES } from '@/lib/routes';
import { isInventoryEmail } from '@/lib/inventoryAccount';
import { useAuth } from '@/contexts/AuthContext';
import { useCredit } from '@/contexts/CreditContext';
import { useCreditConfig } from '@/hooks/useCreditConfig';
import { useReorder } from '@/hooks/useReorder';
import { CreditWidget } from '@/app/components/CreditWidget';
import { Collapsible } from '@/app/components/Collapsible';
import { NotificationPreferencesSection } from '@/app/components/NotificationPreferencesSection';
import { SeoHead } from '@/app/components/SeoHead';
import { Breadcrumbs } from '@/app/components/Breadcrumbs';
import { Field as FormField } from '@/app/components/ui/Field';
import { SubmitButton } from '@/app/components/ui/SubmitButton';
import { toast } from 'sonner';
import type { Address } from '@/schemas/address.schema';
import { addressesFormSchema, type AddressesFormInput } from '@/schemas/address.schema';
import type { Order, OrderStatus } from '@/schemas/order.schema';

import { useT, tNow, localeFor, currentLang } from '@/i18n/useT';
import { formatMoney } from '@/lib/money';
// Subset of the Order shape we need for the history preview. Same
// approach as OrdersPage — we don't validate every snapshot, so the
// raw Firestore Timestamp leaks through as `createdAt` rather than
// the validated Date.
type AccountOrderDoc = Pick<Order,
  'id' | 'orderId' | 'status' | 'items' | 'totalAmount' | 'fulfillmentMethod'
> & { createdAt: Timestamp };

// Lightweight status lookup for the preview row. Shorter labels than
// OrdersPage uses since space is tighter inside the collapsed section.
const STATUS_PREVIEW: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  pending:          { label: 'Confirming', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  in_progress:      { label: 'Preparing',  color: 'var(--success)', bg: 'var(--success-bg)' },
  ready_for_pickup: { label: 'Ready',       color: 'var(--success)', bg: 'var(--success-bg)' },
  shipped:          { label: 'Shipped',     color: 'var(--info)',    bg: 'var(--info-bg)'    },
  delivered:        { label: 'Delivered',   color: 'var(--success)', bg: 'var(--success-bg)' },
  cancelled:        { label: 'Cancelled',   color: 'var(--danger)',  bg: 'var(--danger-bg)'  },
  rejected:         { label: 'Rejected',    color: 'var(--danger)',  bg: 'var(--danger-bg)'  },
  expired:          { label: 'Expired',     color: 'var(--muted)',   bg: 'var(--surface-3)'  },
};

function fmtShortDate(ts: Timestamp | undefined): string {
  if (!ts) return '';
  return ts.toDate().toLocaleDateString(localeFor(currentLang()), {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function summarizeItems(items: AccountOrderDoc['items']): string {
  if (!items || items.length === 0) return 'No items';
  return items
    .map(i => `${i.productName}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`)
    .join(' · ');
}

function newAddress(): Address {
  return { id: crypto.randomUUID(), name: '', phone: '', address: '', city: '', country: '', isDefault: false };
}

// Local label-wrapper used by the addresses sub-form (still ad-hoc).
// Renamed from `Field` to `AddressField` so it doesn't shadow the
// new `<FormField>` import (the Phase-6 compound primitive).
// AddressField is a plain visual wrapper; the migrated profile
// sub-form uses FormField instead.
function AddressField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field-group">
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

export function AccountPage() {
  const t = useT();
  const { currentUser } = useAuth();
  const reorder = useReorder();
  const { balance } = useCredit();
  const cc = useCreditConfig();

  const [loading,       setLoading]       = useState(true);
  // Display name (rendered in the page hero) is mirrored into local
  // state so the hero updates immediately on profile save without
  // having to re-subscribe to the user doc. The form's source of
  // truth is RHF below; this state is downstream of it.
  const [displayName,   setDisplayName]   = useState('');

  // Phase 6: ad-hoc addresses array → RHF + useFieldArray. Schema
  // (addressesFormSchema) validates each address against the same
  // shape used everywhere else in the app — consistent messages
  // across contexts. The fieldArray gives us append/remove/update
  // helpers without manual setAddresses(prev => ...) plumbing.
  const addressesForm = useForm<AddressesFormInput>({
    resolver: zodResolver(addressesFormSchema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: { addresses: [] },
  });
  const { fields: addressFields, append: appendAddress, remove: removeAddress, update: updateAddress } =
    useFieldArray({ control: addressesForm.control, name: 'addresses' });
  const watchedAddresses = addressesForm.watch('addresses');

  // Phase 6: ad-hoc displayName/phone useState → RHF profileForm.
  // Schema: displayName required (≥2 chars), phone optional (10–20
  // chars when present). Default values land from the user doc in the
  // profile-fetch effect below; until then RHF holds empty strings,
  // and the dirty-flag check in handleSaveProfile guards against
  // saving a stale empty form before the doc loads.
  const profileForm = useForm({
    resolver: zodResolver(
      z.object({
        displayName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
        phone: z.string().refine(
          (v) => v === '' || (v.length >= 10 && v.length <= 20),
          'Phone must be 10–20 characters',
        ),
      }),
    ),
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: { displayName: '', phone: '' },
  });
  // Watch displayName so the page hero updates as the user types AND
  // commits — the same name that appears in the form is the name in
  // the hero. Backed by useWatch under the hood (via form.watch).
  const watchedName = profileForm.watch('displayName');
  // Sync local mirror — only update when watched value diverges to
  // avoid spurious re-renders of unrelated subscribers.
  useEffect(() => {
    if (watchedName !== displayName) setDisplayName(watchedName);
  }, [watchedName, displayName]);

  // Order history preview — last N orders. We keep this separate from
  // /orders' subscription so opening the account page doesn't blow the
  // bandwidth budget if /orders later raises its limit. 5 strikes the
  // right balance between "useful at a glance" and "fits on screen
  // without scrolling".
  const HISTORY_PREVIEW_LIMIT = 5;
  const [orders,    setOrders]    = useState<AccountOrderDoc[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState(false);
  const isInventoryAccount = isInventoryEmail(currentUser?.email);

  // ── Profile fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, 'users', currentUser.uid)).then(snap => {
      if (cancelled) return;
      if (snap.exists()) {
        const d = snap.data();
        // Reset RHF with the loaded values — this also clears any
        // dirty/touched state from the empty defaults.
        profileForm.reset({
          displayName: d.displayName ?? '',
          phone: d.phone ?? '',
        });
        setDisplayName(d.displayName ?? '');
        addressesForm.reset({ addresses: d.addresses ?? [] });
      }
    }).catch((err) => {
      if (!cancelled) {
        console.warn('[AccountPage] profile load failed:', err);
        toast.error(tNow('Could not load profile'));
      }
    })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [addressesForm, currentUser, profileForm]);

  // ── Order history subscription ────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) {
      setOrders([]);
      setOrdersLoading(false);
      setOrdersError(false);
      return;
    }
    setOrdersError(false);
    const q = query(
      collection(db, 'orders'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(HISTORY_PREVIEW_LIMIT),
    );
    return onSnapshot(q,
      snap => {
        setOrders(snap.docs.map(d => ({ ...(d.data() as Omit<AccountOrderDoc, 'id'>), id: d.id })));
        setOrdersLoading(false);
      },
      err => {
        // Soft failure — we still want the rest of the page usable
        // even if order history can't load. Just log + flag.
        console.warn('[AccountPage] order history subscription failed:', err);
        setOrdersError(true);
        setOrdersLoading(false);
      },
    );
  }, [currentUser]);

  const handleSaveProfile = async (data: { displayName: string; phone: string }) => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        displayName: data.displayName.trim(),
        phone: data.phone.trim(),
        updatedAt: serverTimestamp(),
      });
      toast.success(tNow('Profile saved'));
      // Reset the form's "dirty" flag so the Save button doesn't
      // imply unsaved changes after a successful round-trip.
      profileForm.reset(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : tNow('Failed to save'));
    }
  };

  const handleSaveAddresses = async (data: AddressesFormInput) => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), { addresses: data.addresses, updatedAt: serverTimestamp() });
      toast.success(tNow('Addresses saved'));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : tNow('Failed to save'));
    }
  };

  // Compact subtitles for the collapsed-state preview text.
  const creditsSubtitle = useMemo(() => {
    if (!cc) return '';
    return `${balance.toLocaleString()} pts`;
  }, [balance, cc]);

  const profileSubtitle = useMemo(() => {
    const bits: string[] = [];
    if (displayName) bits.push(displayName);
    if (currentUser?.email) bits.push(currentUser.email);
    return bits.join(' · ') || t('Edit your name, email and phone');
  }, [displayName, currentUser?.email, t]);

  const addressSubtitle = useMemo(() => {
    if (addressFields.length === 0) return t('No saved addresses yet');
    return t(addressFields.length > 1 ? '{count} saved addresses' : '{count} saved address', { count: addressFields.length });
  }, [addressFields.length, t]);

  const historySubtitle = useMemo(() => {
    if (ordersLoading) return t('Loading…');
    if (ordersError) return t('Order history unavailable');
    if (orders.length === 0) return t('No orders yet');
    return t(orders.length > 1 ? '{count} recent orders' : '{count} recent order', { count: orders.length });
  }, [orders.length, ordersLoading, ordersError, t]);

  if (loading) return (
    <div className="page-shell">
      <div className="ap-loading-shell">
        <div className="container ap-loading-container">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton ap-loading-row" />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-shell">
      <SeoHead title="My Account | Ele Café" description="Manage your profile, addresses and loyalty credits." noIndex />

      <div className="bc-page-wrap">
        <Breadcrumbs
          items={[
            { name: 'Home',       url: ROUTES.HOME },
            { name: 'My Account', url: ROUTES.ACCOUNT },
          ]}
        />
      </div>

      {/* ── Page hero header ─────────────────────────────────── */}
      <div className="page-hero">
        <span className="overline">{t('My account')}</span>
        <h1>{displayName || t('Your Profile')}</h1>
        <div className="page-hero-rule" />
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      <div className="ap-content">
        <div className="container ap-content-inner">

          {/* ── Credits (open by default) ─────────────────────── */}
          {!isInventoryAccount && (
            <Collapsible
              icon={Coins}
              title={t('Ele Café Credits')}
              subtitle={creditsSubtitle}
              defaultOpen={true}
              storageKey="ele:account:credits-open"
            >
              <CreditWidget />
            </Collapsible>
          )}

          {/* ── Order History (open by default) ───────────────── */}
          <Collapsible
            icon={History}
            title={t('Order History')}
            subtitle={historySubtitle}
            defaultOpen={true}
            storageKey="ele:account:history-open"
          >
            {ordersLoading ? (
              <div className="ap-orders-skel-list">
                {[1, 2, 3].map(i => (
                  <div key={i} className="skeleton ap-orders-skel-row" />
                ))}
              </div>
            ) : ordersError ? (
              <div className="ap-orders-error">
                <p className="ap-orders-error-msg">
                  {t('We couldn\'t load your recent orders right now.')}
                </p>
                <Link to={ROUTES.ORDERS} className="btn btn-outline btn-sm ap-orders-retry-link">
                  {t('Try the orders page')} <ArrowRight size={13} />
                </Link>
              </div>
            ) : orders.length === 0 ? (
              <div className="ap-orders-empty">
                <div className="ap-orders-empty-icon">
                  <ShoppingBag size={20} className="ap-orders-empty-icon-svg" />
                </div>
                <p className="ap-orders-empty-msg">{t('No orders yet.')}</p>
                <Link to={ROUTES.PRODUCTS} className="btn btn-dark btn-sm ap-orders-empty-cta">
                  {t('Shop our teas')} <ArrowRight size={13} />
                </Link>
              </div>
            ) : (
              <>
                <div className="order-history-list">
                  {orders.map(order => {
                    const status = STATUS_PREVIEW[order.status as OrderStatus];
                    const displayId = order.orderId || order.id;
                    return (
                      <div key={order.id} className="order-history-row">
                        <div className="order-history-meta">
                          <span className="order-history-id">{displayId}</span>
                          {status && (
                            <span
                              className="order-history-status"
                              // eslint-disable-next-line react/forbid-dom-props -- per-status colour pair (bg + foreground) varies at runtime; the table mapping STATUS_PREVIEW supplies one of ~10 token pairs
                              style={{ background: status.bg, color: status.color }}
                            >
                              {t(status.label)}
                            </span>
                          )}
                          <span className="order-history-date">{fmtShortDate(order.createdAt)}</span>
                        </div>
                        <div className="order-history-actions">
                          <span className="order-history-total">{formatMoney((order.totalAmount ?? 0))}</span>
                          <button
                            type="button"
                            onClick={() => reorder(order.items)}
                            className="order-history-reorder"
                            aria-label={t('Reorder {id}', { id: displayId })}
                          >
                            <RotateCcw size={12} /> {t('Reorder')}
                          </button>
                        </div>
                        <div className="order-history-summary">
                          {summarizeItems(order.items)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="order-history-view-all">
                  <Link
                    to={ROUTES.ORDERS}
                    className="btn btn-outline btn-sm ap-orders-view-all"
                  >
                    {t('View all orders')} <ChevronRight size={14} />
                  </Link>
                </div>
              </>
            )}
          </Collapsible>

          {/* ── Profile Details (collapsed by default) ────────── */}
          <Collapsible
            icon={User}
            title={t('Profile Details')}
            subtitle={profileSubtitle}
            defaultOpen={false}
            storageKey="ele:account:profile-open"
          >
          <form onSubmit={profileForm.handleSubmit(handleSaveProfile)}>
            <div className="account-profile-grid">
              <FormField name="displayName" required>
                <FormField.Label>{t('Full name')}</FormField.Label>
                <FormField.Input
                  autoComplete="name"
                  placeholder={t('Your name')}
                  {...profileForm.register('displayName')}
                />
                <FormField.Error>{profileForm.formState.errors.displayName?.message}</FormField.Error>
              </FormField>
              <AddressField label={t('Email address')}>
                <input
                  className="field account-email-readonly"
                  type="email"
                  autoComplete="email"
                  value={currentUser?.email ?? ''}
                  disabled
                  readOnly
                />
              </AddressField>
            </div>
            <div className="account-phone-block">
              <FormField name="phone">
                <FormField.Label>{t('Phone')}</FormField.Label>
                <div className="account-phone-wrap">
                  <Phone size={14} className="account-phone-icon" />
                  <FormField.Input
                    type="tel"
                    autoComplete="tel"
                    placeholder="+1 604 555 0100"
                    className="field account-phone-input"
                    {...profileForm.register('phone')}
                  />
                </div>
                <FormField.Error>{profileForm.formState.errors.phone?.message}</FormField.Error>
              </FormField>
            </div>
            <SubmitButton variant="dark" loadingLabel={t('Saving…')}>
              <Save size={13} />{t('Save Profile')}
            </SubmitButton>
          </form>
          </Collapsible>

          {/* ── Saved Addresses (collapsed by default) ────────── */}
          <Collapsible
            icon={MapPin}
            title={t('Saved Addresses')}
            subtitle={addressSubtitle}
            defaultOpen={false}
            storageKey="ele:account:addresses-open"
          >
            {addressFields.length === 0 && (
              <div className="ap-addr-empty">
                <div className="ap-addr-empty-icon-wrap">
                  <MapPin size={20} className="ap-addr-empty-icon" />
                </div>
                <p className="ap-addr-empty-msg">{t('No saved addresses yet.')}</p>
                <p className="ap-addr-empty-sub">{t('Add one to speed up checkout.')}</p>
              </div>
            )}

            <form onSubmit={addressesForm.handleSubmit(handleSaveAddresses)}>
              <div className="ap-addr-list">
                {addressFields.map((addr, idx) => (
                  <div key={addr.id} className={`address-card${addr.isDefault ? ' is-default' : ''}`}>
                    <div className="ap-addr-card-head">
                      <div className="ap-addr-card-head-left">
                        <span className="ap-addr-card-eyebrow">
                          {t('Address {n}', { n: idx + 1 })}
                        </span>
                        {addr.isDefault && <span className="badge badge-gold ap-addr-default-badge">{t('Default')}</span>}
                      </div>
                      <div className="ap-addr-card-actions">
                        {!addr.isDefault && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              // Set this address default; clear default
                              // on every other. Use update() per index
                              // since useFieldArray doesn't have a
                              // "setMany" — small N, no perf concern.
                              addressFields.forEach((a, i) => {
                                const current = watchedAddresses?.[i] ?? a;
                                updateAddress(i, { ...current, isDefault: a.id === addr.id });
                              });
                            }}
                          >
                            {t('Set default')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAddress(idx)}
                          className="ap-addr-delete-btn"
                          aria-label={t('Delete address {n}', { n: idx + 1 })}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div className="ap-addr-grid-2">
                      <FormField name={`addresses.${idx}.name`} required>
                        <FormField.Label>{t('Full name')}</FormField.Label>
                        <FormField.Input
                          autoComplete="name"
                          placeholder={t('Jane Doe')}
                          {...addressesForm.register(`addresses.${idx}.name`)}
                        />
                        <FormField.Error>{addressesForm.formState.errors.addresses?.[idx]?.name?.message}</FormField.Error>
                      </FormField>
                      <FormField name={`addresses.${idx}.phone`} required>
                        <FormField.Label>{t('Phone')}</FormField.Label>
                        <FormField.Input
                          type="tel"
                          autoComplete="tel"
                          placeholder="+1 604 555 0100"
                          {...addressesForm.register(`addresses.${idx}.phone`)}
                        />
                        <FormField.Error>{addressesForm.formState.errors.addresses?.[idx]?.phone?.message}</FormField.Error>
                      </FormField>
                    </div>
                    <div className="ap-addr-row">
                      <FormField name={`addresses.${idx}.address`} required>
                        <FormField.Label>{t('Street address')}</FormField.Label>
                        <FormField.Input
                          autoComplete="street-address"
                          placeholder={t('123 Main St')}
                          {...addressesForm.register(`addresses.${idx}.address`)}
                        />
                        <FormField.Error>{addressesForm.formState.errors.addresses?.[idx]?.address?.message}</FormField.Error>
                      </FormField>
                    </div>
                    <div className="ap-addr-grid-2-narrow">
                      <FormField name={`addresses.${idx}.city`} required>
                        <FormField.Label>{t('City')}</FormField.Label>
                        <FormField.Input
                          autoComplete="address-level2"
                          placeholder={t('Vancouver')}
                          {...addressesForm.register(`addresses.${idx}.city`)}
                        />
                        <FormField.Error>{addressesForm.formState.errors.addresses?.[idx]?.city?.message}</FormField.Error>
                      </FormField>
                      <FormField name={`addresses.${idx}.country`} required>
                        <FormField.Label>{t('Country')}</FormField.Label>
                        <FormField.Input
                          autoComplete="country-name"
                          placeholder={t('Canada')}
                          {...addressesForm.register(`addresses.${idx}.country`)}
                        />
                        <FormField.Error>{addressesForm.formState.errors.addresses?.[idx]?.country?.message}</FormField.Error>
                      </FormField>
                    </div>
                  </div>
                ))}
              </div>

              <div className="ap-addr-actions" data-has-items={addressFields.length > 0 ? 'true' : 'false'}>
                <button
                  type="button"
                  onClick={() => appendAddress(newAddress())}
                  className="btn btn-outline"
                >
                  <Plus size={13} /> {t('Add Address')}
                </button>
                {addressFields.length > 0 && (
                  <SubmitButton variant="dark" loadingLabel={t('Saving…')}>
                    <Save size={13} />{t('Save Addresses')}
                  </SubmitButton>
                )}
              </div>
            </form>
          </Collapsible>

          {/* Phase 11.5 — Notification preferences. Reads from
              /users/{uid}/preferences/notifications, writes optimistic
              with 500ms debounce. Toggle primitive (Phase 10) handles
              the spring + a11y. */}
          <NotificationPreferencesSection />

        </div>
      </div>
    </div>
  );
}
export default AccountPage;
