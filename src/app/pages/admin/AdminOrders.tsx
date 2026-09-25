import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle, CheckCircle2, Eye, MapPin, Package, Pencil, Plus,
  RefreshCw, Trash2, Truck, XCircle,
} from 'lucide-react';
import { SearchBar } from '@/app/components/ui/SearchBar';
import { Field } from '@/app/components/ui/Field';
import {
  collection, onSnapshot, query, orderBy, limit,
  doc, updateDoc, serverTimestamp, Timestamp, getDocs,
} from 'firebase/firestore';
import { db, getFunctionsLazy } from '@/lib/firebase';
import { toast } from 'sonner';
import type { OrderStatus, Order } from '@/schemas/order.schema';
import { adminOrderEditFormSchema, type AdminOrderEditFormInput } from '@/schemas/order.schema';
import { SeoHead } from '@/app/components/SeoHead';
import { Modal, ModalBtn } from '@/app/components/modals/Modal';

import { AdminPageHeader } from '@/app/components/admin/AdminPageHeader';
// R1 Bug #22: pickup orders get a dedicated workflow action instead of
// being forced through the delivery-shaped "ship" → "deliver" path.
type AdminActionType =
  | 'cancel'
  | 'approve'
  | 'mark_ready_for_pickup'
  | 'ship'
  | 'deliver'
  | 'reject';

const ORDERS_LIMIT = 150;

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  pending:           { label: 'Awaiting Approval', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  in_progress:       { label: 'Paid — To Fulfil',  color: 'var(--success)', bg: 'var(--success-bg)' },
  ready_for_pickup:  { label: 'Ready for Pickup', color: 'var(--success)', bg: 'var(--success-bg)' },
  shipped:           { label: 'Shipped',          color: 'var(--info)',    bg: 'var(--info-bg)'    },
  delivered:         { label: 'Delivered',        color: 'var(--success)', bg: 'var(--success-bg)' },
  cancelled:         { label: 'Cancelled',        color: 'var(--danger)',  bg: 'var(--danger-bg)'  },
  rejected:          { label: 'Rejected',         color: 'var(--danger)',  bg: 'var(--danger-bg)'  },
  expired:           { label: 'Expired',          color: 'var(--muted)',   bg: 'var(--surface-3)'  },
};

interface OrderItem {
  productId?: string;
  productName: string;
  quantity: number;
  price: number;
  image: string;
}

// R2 Bug #8/#10 mirror: derive from the schema rather than redeclaring.
type OrderDoc = Pick<Order,
  | 'id' | 'orderId' | 'userId' | 'customerId' | 'status'
  | 'subtotal' | 'creditApplied' | 'shippingFee' | 'gst' | 'totalAmount'
  | 'promoDiscount' | 'promoCode' | 'discount' | 'discountCode'
  | 'fulfillmentMethod' | 'shippingAddress'
  | 'trackingNumber' | 'carrier' | 'adminNote'
  | 'cancellationReason' | 'rejectionReason'
  | 'isGift' | 'recipientName' | 'senderName' | 'giftMessage'
  | 'occasion' | 'customOccasion' | 'payment'
> & {
  items: OrderItem[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

// ── Card payment summary ──────────────────────────────────────────────────────
const PAYMENT_LABEL: Record<string, string> = {
  authorized:   'On hold — not charged yet',
  captured:     'Charged',
  released:     'Hold released — not charged',
  refunded:     'Refunded',
  not_required: 'Nothing to charge (covered by credit)',
};

function PaymentSummary({ order }: { order: OrderDoc }) {
  const p = order.payment;
  if (!p) return null;
  const amountCents = p.status === 'captured' ? p.capturedAmount
    : p.status === 'refunded' ? (p.refundedAmount ?? p.capturedAmount)
    : p.authorizedAmount;
  return (
    <div className="ao-detail-card">
      <p className="ao-detail-card-eyebrow">Payment</p>
      <p className="ao-detail-card-body">
        {PAYMENT_LABEL[p.status] ?? p.status}
        {typeof amountCents === 'number' && ` · $${(amountCents / 100).toFixed(2)}`}
        {p.last4 && <><br />{p.cardBrand ?? 'Card'} ending {p.last4}</>}
      </p>
      {p.settleError && (
        <p className="ao-detail-reason">
          <strong>Needs attention: </strong>automatic {p.status === 'captured' ? 'refund' : 'hold release'} failed — finish it in the Clover dashboard.
        </p>
      )}
    </div>
  );
}

// ── Order detail view ─────────────────────────────────────────────────────────
function OrderDetail({ order }: { order: OrderDoc }) {
  return (
    <div className="ao-detail">
      <div>
        {order.items.map((item, i) => (
          <div key={`${item.productId ?? i}-${i}`} className="ao-detail-item">
            <span className="ao-muted">{item.productName} × {item.quantity}</span>
            <span>${(item.price * item.quantity).toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="ao-detail-totals">
        <div className="ao-totals-row"><span className="ao-muted">Subtotal</span><span>${order.subtotal.toFixed(2)}</span></div>
        {(() => {
          const promoDisc = order.promoDiscount ?? order.discount ?? 0;
          const promoLabel = order.promoCode ?? order.discountCode ?? '';
          if (promoDisc <= 0) return null;
          return (
            <div className="ao-totals-row ao-totals-credit">
              <span>Discount{promoLabel ? ` (${promoLabel})` : ''}</span>
              <span>−${promoDisc.toFixed(2)}</span>
            </div>
          );
        })()}
        {order.creditApplied > 0 && <div className="ao-totals-row ao-totals-credit"><span>Credit</span><span>−${order.creditApplied.toFixed(2)}</span></div>}
        {order.shippingFee > 0 && <div className="ao-totals-row"><span className="ao-muted">Shipping</span><span>${order.shippingFee.toFixed(2)}</span></div>}
        {(order.gst ?? 0) > 0 && <div className="ao-totals-row"><span className="ao-muted">GST (5%)</span><span>${order.gst.toFixed(2)}</span></div>}
        <div className="ao-totals-row ao-totals-grand">
          {/* R1 Bug #16/#17: defend against missing totalAmount. */}
          <span>Total</span><span>${(order.totalAmount ?? 0).toFixed(2)}</span>
        </div>
      </div>
      <PaymentSummary order={order} />
      <div className="ao-detail-rule" />
      <div className="ao-detail-card">
        <p className="ao-detail-card-eyebrow">
          {order.fulfillmentMethod === 'pickup' ? 'Fulfillment' : 'Ship to'}
        </p>
        <p className="ao-detail-card-body">
          {order.fulfillmentMethod === 'pickup' ? (
            <>Pickup at store</>
          ) : order.shippingAddress ? (
            <>
              {order.shippingAddress.name ?? '—'}<br/>
              {order.shippingAddress.address ?? '—'}<br/>
              {[order.shippingAddress.city, order.shippingAddress.province, order.shippingAddress.postalCode]
                .filter(Boolean).join(' ') || '—'}
              <br/>
              {order.shippingAddress.country ?? ''}
              {order.shippingAddress.phone ? ` · ${order.shippingAddress.phone}` : ''}
            </>
          ) : (
            <span className="ao-muted">—</span>
          )}
        </p>
      </div>
      {order.trackingNumber && (
        <div><span className="ao-tracking-label">Tracking: </span>
          <span className="ao-tracking-num">{order.trackingNumber}</span>
          {order.carrier && <span className="ao-tracking-carrier"> ({order.carrier})</span>}
        </div>
      )}
      {order.isGift && (
        <div className="ao-gift-card">
          <p className="ao-gift-eyebrow">
            🎁 Gift details
          </p>
          <div className="ao-gift-body">
            {order.recipientName && <div><strong>To:</strong> {order.recipientName}</div>}
            {order.senderName    && <div><strong>From:</strong> {order.senderName}</div>}
            {(order.occasion || order.customOccasion) && (
              <div><strong>Occasion:</strong> {order.customOccasion || order.occasion}</div>
            )}
            {order.giftMessage && (
              <div className="ao-gift-msg">
                "{order.giftMessage}"
              </div>
            )}
          </div>
        </div>
      )}
      {(order.cancellationReason || order.rejectionReason) && (
        <div className="ao-detail-reason">
          <strong>Reason: </strong>{order.cancellationReason || order.rejectionReason}
        </div>
      )}
    </div>
  );
}

// ── Edit Order Modal — only for pending orders ────────────────────────────────
// R1 Bug #6 fix: GST_RATE used to recompute taxes server-shape-correctly
// when admin edits items.
const GST_RATE = 0.05;

function EditOrderModal({
  order, open, onClose, onSave,
}: {
  order: OrderDoc; open: boolean; onClose: () => void;
  onSave: (data: Partial<OrderDoc>) => Promise<void>;
}) {
  // Phase 6 migration: ad-hoc useState<EditState> → RHF + useFieldArray.
  // The schema (adminOrderEditFormSchema) validates everything that
  // the old `validate(items)` function checked plus the silent
  // `Math.max(0, parseFloat())` clamps on shippingFee/discount —
  // those clamps now surface as inline RHF errors instead of
  // hiding negative values.
  const form = useForm<AdminOrderEditFormInput>({
    resolver: zodResolver(adminOrderEditFormSchema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: {
      items:        order.items.map(i => ({
        productId:   i.productId,
        productName: i.productName,
        quantity:    i.quantity,
        price:       i.price,
        image:       i.image,
      })),
      shippingFee:  order.shippingFee ?? 0,
      // R1 Bug #3: read canonical promoDiscount FIRST, fall back to legacy
      // `discount`. Previously this only read `discount`, so a normal
      // promo-bearing order opened with discount=0 and Save wiped the
      // customer's promo.
      discount:     order.promoDiscount ?? order.discount ?? 0,
      discountCode: order.promoCode    ?? order.discountCode ?? '',
      adminNote:    order.adminNote    ?? '',
    },
  });
  const { fields: itemFields, update: updateItemField, remove: removeItemField, append: appendItem } =
    useFieldArray({ control: form.control, name: 'items' });
  // Watch the things we need for the live total computation. Watching
  // a single field is cheap; watching the whole form would re-render
  // every keystroke. The items array IS read in full because the
  // subtotal sums every line.
  const watchedItems       = form.watch('items');
  const watchedShippingFee = form.watch('shippingFee');
  const watchedDiscount    = form.watch('discount');

  const [saving, setSaving] = useState(false);
  const [availableTeas, setAvailableTeas] = useState<{ slug: string; name: string; price: number; image: string }[]>([]);
  const [teaSearch, setTeaSearch] = useState('');
  const [teasError, setTeasError] = useState<string | null>(null);

  // Reset the form when a different order is opened. Without this the
  // form keeps the previous order's values when the parent swaps the
  // order prop. Keyed on order.id to avoid unnecessary resets.
  useEffect(() => {
    form.reset({
      items:        order.items.map(i => ({ ...i })),
      shippingFee:  order.shippingFee ?? 0,
      discount:     order.promoDiscount ?? order.discount ?? 0,
      discountCode: order.promoCode    ?? order.discountCode ?? '',
      adminNote:    order.adminNote    ?? '',
    });
  }, [form, order.id, order.items, order.shippingFee, order.promoDiscount, order.discount, order.promoCode, order.discountCode, order.adminNote]);

  // Load available teas for the picker. R1 Bug #11: cap the read,
  // sort by name, and surface load errors instead of silent catch.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTeasError(null);
    getDocs(query(collection(db, 'teas'), orderBy('name'), limit(500)))
      .then(snap => {
        if (cancelled) return;
        const teas = snap.docs.map(d => ({
          slug:  d.id,
          name:  (d.data().name  as string) ?? '',
          price: (d.data().price as number) ?? 0,
          image: (d.data().image as string) ?? '',
        })).filter(t => t.name);
        setAvailableTeas(teas);
      })
      .catch(err => {
        console.error('[EditOrderModal] Failed to load teas:', err);
        setTeasError('Could not load tea catalogue. Custom items still work.');
      });
    return () => { cancelled = true; };
  }, [open]);

  // R1 Bug #4: defend against missing gst on legacy orders. Without
  // `?? 0`, the total computed below becomes NaN.
  // R1 Bug #5: GST is recomputed per-item rather than frozen on the
  // original value. If admin removes/adjusts items the GST tracks the
  // current taxable subtotal correctly. Plain-tea-only orders (no
  // gstApplicable items) still produce 0.
  const subtotal = (watchedItems ?? []).reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);

  // The OrderDoc shape doesn't carry per-item gstApplicable in this
  // surface (it's derived at cart time). Preserve the original GST
  // rate-of-subtotal for stability across edits — i.e. if the original
  // order had ratio=GST/subtotal, apply the same ratio to the new
  // subtotal. For orders with no GST originally, gst stays 0. This
  // avoids accidentally taxing tea on edits while still updating the
  // dollar amount when a taxable order's subtotal changes.
  const originalSubtotal = order.subtotal || 1; // div-by-zero guard
  const originalGst      = order.gst ?? 0;
  const gstRatio         = originalGst > 0 ? originalGst / originalSubtotal : 0;
  const gst              = Math.round(subtotal * gstRatio * 100) / 100;
  void GST_RATE; // kept exported for future taxable-edit support

  const afterPromo = Math.max(0, subtotal - (watchedDiscount || 0));
  const afterCred  = Math.max(0, afterPromo - (order.creditApplied ?? 0));
  const total      = Math.max(0, afterCred + gst + (watchedShippingFee || 0));
  // The card is held for the checkout total — an edit can lower it
  // (approval charges less) but never raise it (Firestore rules enforce
  // the same cap).
  const holdCents  = order.payment?.status === 'authorized' ? (order.payment.authorizedAmount ?? 0) : null;
  const overHold   = holdCents !== null && Math.round(total * 100) > holdCents;

  // Item-level mutation helpers — same signatures as before so the
  // JSX call sites don't need to know about RHF internals. Each
  // helper merges the change with the current watched value before
  // calling RHF's update().
  const updateItem = (idx: number, field: 'quantity' | 'price', val: number) => {
    const current = watchedItems?.[idx] ?? itemFields[idx];
    if (!current) return;
    // R1 Bug #24: NaN-safe clamp. `Math.max(1, NaN)` is NaN. Force
    // a finite fallback first so a stuck NaN can be recovered from.
    const safeVal = Number.isFinite(val) ? val : (field === 'quantity' ? 1 : 0);
    const floor   = field === 'quantity' ? 1 : 0;
    updateItemField(idx, { ...current, [field]: Math.max(floor, safeVal) });
  };

  const updateItemName = (idx: number, name: string) => {
    const current = watchedItems?.[idx] ?? itemFields[idx];
    if (!current) return;
    updateItemField(idx, { ...current, productName: name });
  };

  const removeItem = (idx: number) => removeItemField(idx);

  const addTea = (tea: { slug: string; name: string; price: number; image: string }) => {
    const items = watchedItems ?? [];
    const existing = items.findIndex(i =>
      (i.productId && i.productId === tea.slug) ||
      (!i.productId && i.productName === tea.name)
    );
    if (existing >= 0) {
      const cur = items[existing];
      updateItemField(existing, {
        ...cur,
        productId: cur.productId ?? tea.slug,
        quantity: cur.quantity + 1,
      });
    } else {
      appendItem({ productId: tea.slug, productName: tea.name, quantity: 1, price: tea.price, image: tea.image });
    }
    setTeaSearch('');
  };

  const addCustomItem = () => {
    // R1 Bug #6: schema-shape-valid placeholder. Image is left empty
    // (the schema now allows missing image, R2 Bug #23 fix), but the
    // name is non-empty so the schema's `productName.min(1)` still
    // passes. Admin must edit the name + price before saving.
    appendItem({ productName: 'New custom item', quantity: 1, price: 0, image: '' });
  };

  const handleSave = async (data: AdminOrderEditFormInput) => {
    setSaving(true);
    try {
      await onSave({
        // Map items so `image` is always a string (required by
        // OrderItem; the form schema makes it optional because legacy
        // items may not have one). Same for productId.
        items: data.items.map(i => ({
          productId:   i.productId,
          productName: i.productName,
          quantity:    i.quantity,
          price:       i.price,
          image:       i.image ?? '',
        })),
        subtotal,
        gst, // R1 Bug #5: write the recomputed GST.
        shippingFee:  data.shippingFee,
        discount:     data.discount,
        discountCode: data.discountCode || '',
        promoDiscount: data.discount,
        promoCode:    data.discountCode || '',
        totalAmount:  total,
        adminNote:    data.adminNote || '',
      });
    } catch (saveErr) {
      // R1 Bug #8: catch the rejection here too. handleEditSave's outer
      // throw was bubbling to a click handler with no .catch, producing
      // an "Uncaught (in promise)" warning. Now the click site is clean
      // and the user-visible toast was already shown by the save path.
      console.error('[EditOrderModal] save failed:', saveErr);
    } finally {
      setSaving(false);
    }
  };

  const filteredTeas = availableTeas.filter(t =>
    t.name.toLowerCase().includes(teaSearch.toLowerCase())
  ).slice(0, 8);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Order"
      subtitle={`${order.orderId} · Pending — changes saved immediately`}
      size="lg"
      footer={
        <>
          <ModalBtn variant="outline" onClick={onClose}>Cancel</ModalBtn>
          <ModalBtn onClick={form.handleSubmit(handleSave)} loading={saving} disabled={overHold}>Save Changes</ModalBtn>
        </>
      }
    >
      <form onSubmit={form.handleSubmit(handleSave)} className="ao-edit-form">

        {/* ── ITEMS ──────────────────────────────────────────────── */}
        <section>
          <p className="ao-edit-eyebrow">
            Items
          </p>
          {form.formState.errors.items?.message && (
            <p className="ao-edit-form-err">
              {form.formState.errors.items.message}
            </p>
          )}
          <div className="ao-edit-items">
            {itemFields.map((item, idx) => {
              const watched = watchedItems?.[idx] ?? item;
              const itemErrors = form.formState.errors.items?.[idx];
              return (
              // Composite key — RHF gives us a stable id; fall back
              // to productId+idx for items that pre-date the field
              // array. Either way, duplicates don't collide.
              <div key={item.id} className="ao-edit-item">
                <input
                  className="field ao-edit-item-name"
                  value={watched.productName ?? ''}
                  onChange={e => updateItemName(idx, e.target.value)}
                  aria-label={`Item ${idx + 1} name`}
                  aria-invalid={itemErrors?.productName ? true : undefined}
                />
                <div className="ao-edit-qty">
                  <button type="button" onClick={() => updateItem(idx, 'quantity', (watched.quantity ?? 1) - 1)} className="ao-edit-qty-btn" aria-label="Decrease quantity">−</button>
                  <span className="ao-edit-qty-val">{watched.quantity ?? 1}</span>
                  <button type="button" onClick={() => updateItem(idx, 'quantity', (watched.quantity ?? 1) + 1)} className="ao-edit-qty-btn" aria-label="Increase quantity">+</button>
                </div>
                <div className="ao-edit-price-wrap">
                  <span className="ao-edit-price-prefix">$</span>
                  <input
                    type="number" min="0" step="0.01"
                    className="field ao-edit-price-input"
                    value={watched.price ?? 0}
                    onChange={e => updateItem(idx, 'price', parseFloat(e.target.value) || 0)}
                    aria-label={`Item ${idx + 1} price`}
                    aria-invalid={itemErrors?.price ? true : undefined}
                  />
                </div>
                <button type="button" onClick={() => removeItem(idx)}
                  aria-label={`Remove ${watched.productName ?? `item ${idx + 1}`}`}
                  className="ao-edit-item-remove">
                  <Trash2 size={13} />
                </button>
              </div>
              );
            })}
          </div>

          <div className="ao-tea-search">
            <div className="ao-tea-search-row">
              <SearchBar
                size="sm"
                value={teaSearch}
                onChange={setTeaSearch}
                placeholder="Search catalogue to add a tea…"
              />
            </div>
            {teasError && (
              <p className="ao-tea-error">{teasError}</p>
            )}
            {teaSearch && filteredTeas.length > 0 && (
              <div className="ao-tea-results">
                {/* R1 Bug #9: key by slug (unique doc id) not name. */}
                {filteredTeas.map(tea => (
                  <button key={tea.slug} onClick={() => addTea(tea)} className="ao-tea-result">
                    <span>{tea.name}</span>
                    <span className="ao-tea-price">${tea.price.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={addCustomItem} className="btn btn-ghost btn-sm ao-add-custom">
            <Plus size={12} /> Add custom item
          </button>
        </section>

        {/* ── FEES & DISCOUNTS ────────────────────────────────────── */}
        <section>
          <p className="ao-edit-eyebrow">
            Fees &amp; Discounts
          </p>
          <div className="ao-edit-fees-grid">
            <Field name="shippingFee">
              <Field.Label>Shipping Fee ($)</Field.Label>
              <div className="ao-edit-currency-wrap">
                <span className="ao-edit-currency-prefix">$</span>
                <Field.Input
                  type="number" min="0" step="0.01"
                  placeholder="0.00"
                  className="field ao-edit-currency-input"
                  {...form.register('shippingFee', { valueAsNumber: true })}
                />
              </div>
              {(watchedShippingFee ?? 0) === 0 && !form.formState.errors.shippingFee && <Field.Hint>Free shipping</Field.Hint>}
              <Field.Error>{form.formState.errors.shippingFee?.message}</Field.Error>
            </Field>
            <Field name="discount">
              <Field.Label>Discount ($)</Field.Label>
              <div className="ao-edit-currency-wrap">
                <span className="ao-edit-currency-prefix">−$</span>
                <Field.Input
                  type="number" min="0" max={subtotal || undefined} step="0.01"
                  placeholder="0.00"
                  className="field ao-edit-currency-input ao-edit-currency-input-wide"
                  {...form.register('discount', { valueAsNumber: true })}
                />
              </div>
              {(watchedDiscount ?? 0) > subtotal && !form.formState.errors.discount && (
                <Field.Hint>
                  <span className="ao-edit-warn">Discount exceeds subtotal — total floored at $0.</span>
                </Field.Hint>
              )}
              <Field.Error>{form.formState.errors.discount?.message}</Field.Error>
            </Field>
            <Field name="discountCode">
              <Field.Label>Promo Code</Field.Label>
              {/* R1 Bug #23: don't auto-uppercase. Preserves the original
                  casing of case-sensitive promo codes admin types in. */}
              <Field.Input
                placeholder="SUMMER20"
                {...form.register('discountCode')}
              />
            </Field>
            <div className="ao-edit-shipping-shortcut">
              {(watchedShippingFee ?? 0) > 0 ? (
                <button type="button" className="btn btn-outline btn-sm ao-edit-shipping-remove"
                  onClick={() => form.setValue('shippingFee', 0, { shouldValidate: true, shouldDirty: true })}>
                  Remove shipping fee
                </button>
              ) : (
                <button type="button" className="btn btn-outline btn-sm"
                  onClick={() => form.setValue('shippingFee', 15, { shouldValidate: true, shouldDirty: true })}>
                  <Truck size={12} /> Add shipping
                </button>
              )}
            </div>
          </div>
        </section>

        <Field name="adminNote">
          <Field.Label>Internal note (not shown to customer)</Field.Label>
          <Field.Textarea
            rows={2}
            placeholder="Notes about this edit…"
            {...form.register('adminNote')}
          />
        </Field>

        {/* ── SUMMARY ────────────────────────────────────────────── */}
        <div className="ao-edit-summary">
          <p className="ao-edit-summary-eyebrow">
            Updated totals
          </p>
          {([
            { label:'Items subtotal', value:`$${subtotal.toFixed(2)}` },
            (order.creditApplied ?? 0) > 0 ? { label:'Credit applied', value:`−$${(order.creditApplied ?? 0).toFixed(2)}`, color:'var(--success)' } : null,
            (watchedDiscount ?? 0) > 0 ? { label:`Discount${form.watch('discountCode') ? ` (${form.watch('discountCode')})` : ''}`, value:`−$${(watchedDiscount ?? 0).toFixed(2)}`, color:'var(--success)' } : null,
            (watchedShippingFee ?? 0) > 0 ? { label:'Shipping', value:`$${(watchedShippingFee ?? 0).toFixed(2)}` } : { label:'Shipping', value:'Free' },
            gst > 0 ? { label:'GST (5%)', value:`$${gst.toFixed(2)}` } : null,
          ] as Array<{ label: string; value: string; color?: string } | null>)
            .filter((r): r is { label: string; value: string; color?: string } => r !== null)
            .map(row => (
              <div
                key={row.label}
                className="ao-edit-summary-row"
                // eslint-disable-next-line react/forbid-dom-props -- dynamic per-row colour from row.color
                style={{ ['--ao-row-color' as string]: row.color || 'var(--text-2)' }}
              >
                <span>{row.label}</span><span>{row.value}</span>
              </div>
            ))}
          <div className="ao-edit-summary-total">
            <span>New Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
          {holdCents !== null && (
            <p className={overHold ? 'ao-edit-form-err' : 'ao-muted'}>
              {overHold
                ? `The customer's card is only held for $${(holdCents / 100).toFixed(2)}. Lower the total, or reject the order and ask them to reorder.`
                : `Card hold: $${(holdCents / 100).toFixed(2)} — approval charges the new total.`}
            </p>
          )}
        </div>

      </form>
    </Modal>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function AdminOrders() {
  const [orders,      setOrders]      = useState<OrderDoc[]>([]);
  const [loading,     setLoading]     = useState(true);
  // R1 Bug #14: track subscription error and let admin retry.
  const [loadError,   setLoadError]   = useState<string | null>(null);
  const [retryKey,    setRetryKey]    = useState(0);
  const [search,      setSearch]      = useState('');
  const [filter,      setFilter]      = useState<string>('all');
  const [viewOrder,   setViewOrder]   = useState<OrderDoc | null>(null);
  const [editOrder,   setEditOrder]   = useState<OrderDoc | null>(null);
  const [actionModal, setActionModal] = useState<{ order: OrderDoc; type: AdminActionType } | null>(null);

  const [adminNote,      setAdminNote]      = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier,        setCarrier]        = useState('');
  const [reason,         setReason]         = useState('');
  const [saving,         setSaving]         = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(ORDERS_LIMIT));
    return onSnapshot(q,
      snap => {
        setOrders(snap.docs.map(d => ({ ...(d.data() as Omit<OrderDoc, 'id'>), id: d.id })));
        setLoading(false);
        setLoadError(null);
      },
      err => {
        // R1 Bug #14: surface the error.
        console.error('[AdminOrders] subscription failed:', err);
        setLoadError('Could not load orders. Check your connection or permissions.');
        setLoading(false);
      },
    );
  }, [retryKey]);

  function openAction(order: OrderDoc, type: AdminActionType) {
    setActionModal({ order, type });
    setAdminNote(''); setTrackingNumber(''); setCarrier(''); setReason('');
  }

  const handleEditSave = useCallback(async (data: Partial<OrderDoc>) => {
    if (!editOrder) return;
    try {
      await updateDoc(doc(db, 'orders', editOrder.id), { ...data, updatedAt: serverTimestamp() });
      toast.success('Order updated');
      setEditOrder(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      toast.error(msg);
      throw err;
    }
  }, [editOrder]);

  async function applyAction() {
    if (!actionModal) return;
    const { order, type } = actionModal;
    if ((type === 'reject' || type === 'cancel') && !reason.trim()) { toast.error('A reason is required'); return; }
    if (type === 'ship' && !trackingNumber.trim() && !order.trackingNumber) {
      toast.error('Tracking number is required');
      return;
    }

    setSaving(true);
    try {
      if (type === 'approve') {
        // Approval = stock check + card capture, server-side only
        // (Firestore rules block moving a pending order forward here).
        const { functions, httpsCallable } = await getFunctionsLazy();
        const approve = httpsCallable<{ orderId: string; adminNote?: string }, { charged: number }>(functions, 'approveOrder');
        const res = await approve({ orderId: order.id, ...(adminNote.trim() ? { adminNote: adminNote.trim() } : {}) });
        toast.success(`Order ${order.orderId} approved — $${res.data.charged.toFixed(2)} charged`);
        setActionModal(null);
        return;
      }

      let update: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (type === 'mark_ready_for_pickup') {
        update = { ...update, status: 'ready_for_pickup', ...(adminNote.trim() ? { adminNote: adminNote.trim() } : {}) };
      } else if (type === 'ship') {
        update = {
          ...update,
          status: 'shipped',
          shippedAt: serverTimestamp(),
          ...(trackingNumber.trim() ? { trackingNumber: trackingNumber.trim() } : {}),
          ...(carrier.trim() ? { carrier: carrier.trim() } : {}),
        };
      } else if (type === 'deliver') {
        // For pickup, "deliver" really means "customer picked up".
        update = {
          ...update,
          status: 'delivered',
          deliveredAt: serverTimestamp(),
          ...(order.fulfillmentMethod === 'pickup' ? { pickedUpAt: serverTimestamp() } : {}),
        };
      } else if (type === 'reject') {
        // onOrderWrite releases the card hold and notifies the customer.
        update = { ...update, status: 'rejected', rejectionReason: reason.trim() };
      } else if (type === 'cancel') {
        // onOrderWrite releases the hold, or refunds if already charged.
        update = { ...update, status: 'cancelled', cancellationReason: reason.trim() };
      }
      await updateDoc(doc(db, 'orders', order.id), update);
      toast.success(`Order ${order.orderId} updated`);
      setActionModal(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => orders.filter(o => {
    if (filter !== 'all' && o.status !== filter) return false;
    const q = search.toLowerCase();
    return !q ||
      (o.orderId || '').toLowerCase().includes(q) ||
      (o.customerId || '').toLowerCase().includes(q) ||
      (o.shippingAddress?.name || '').toLowerCase().includes(q) ||
      (o.recipientName || '').toLowerCase().includes(q);
  }), [orders, filter, search]);

  const urgentCount = useMemo(
    () => orders.filter(o => o.status === 'pending').length,
    [orders],
  );

  // R1 honourable-mention: ACTION_CONFIG was previously rebuilt every
  // render. useMemo keys it on the only state it actually depends on.
  const ACTION_CONFIG = useMemo(() => {
    const isPickup = actionModal?.order.fulfillmentMethod === 'pickup';
    return {
      approve: {
        title:'Approve & charge', cta:`Approve & Charge $${(actionModal?.order.totalAmount ?? 0).toFixed(2)}`,
        desc: 'Confirms every tea is in stock, then charges the held amount to the customer\'s card. If a tea is out of stock, nothing is charged — reject the order instead.',
        variant:'success' as const,
        fields: (
          <div className="field-group">
            <label className="field-label" htmlFor="approve-admin-note">Note to customer (optional)</label>
            <textarea id="approve-admin-note" className="field" value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={2} />
          </div>
        ),
      },
      mark_ready_for_pickup: {
        title:'Mark ready for pickup', cta:'Mark Ready', variant:'success' as const,
        desc:'Customer will be notified that their order is at the counter.',
        fields:null,
      },
      ship: {
        title:'Mark shipped', cta:'Mark Shipped', variant:'primary' as const,
        desc:'Enter the tracking number — the customer sees it immediately.',
        fields: (
          <>
            <div className="field-group"><label className="field-label" htmlFor="ship-tracking">Tracking number{actionModal?.order.trackingNumber ? ' (leave blank to keep current)' : ' *'}</label><input id="ship-tracking" className="field" value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} placeholder={actionModal?.order.trackingNumber || '—'} /></div>
            <div className="field-group"><label className="field-label" htmlFor="ship-carrier">Carrier</label><input id="ship-carrier" className="field" value={carrier} onChange={e => setCarrier(e.target.value)} placeholder="Canada Post…" /></div>
          </>
        ),
      },
      deliver: {
        title: isPickup ? 'Mark picked up' : 'Mark delivered',
        cta: isPickup ? 'Confirm Pickup' : 'Confirm Delivered',
        variant:'success' as const,
        desc: isPickup
          ? 'Confirm the customer has picked up their order.'
          : 'Confirm the customer has received their order.',
        fields:null,
      },
      reject: {
        title:'Reject order', cta:'Reject Order', variant:'danger' as const,
        desc:'The hold on the customer\'s card is released (they are not charged) and they are notified with your reason.',
        fields: <div className="field-group"><label className="field-label" htmlFor="rej-reason">Reason *</label><textarea id="rej-reason" className="field" value={reason} onChange={e => setReason(e.target.value)} rows={3} required /></div>,
      },
      cancel: {
        title:'Cancel order', cta:'Cancel Order', variant:'danger' as const,
        desc: actionModal?.order.payment?.status === 'captured'
          ? 'The customer\'s card is refunded in full and they are notified with your reason.'
          : 'Customer will be notified with your reason.',
        fields: <div className="field-group"><label className="field-label" htmlFor="cancel-reason">Reason *</label><textarea id="cancel-reason" className="field" value={reason} onChange={e => setReason(e.target.value)} rows={3} required /></div>,
      },
    };
  }, [actionModal, trackingNumber, carrier, adminNote, reason]);

  return (
    <div className="ao-page">
      <SeoHead title="Orders | Admin" description="" noIndex />

      {/* Header */}
      <AdminPageHeader
        eyebrow="Manage & fulfil"
        title="Orders"
        meta={urgentCount > 0 && <p className="ao-page-urgent">{urgentCount} order{urgentCount>1?'s':''} need attention</p>}
      />
      <div className="aph-toolbar">
        <div className="ao-page-controls">
          <div className="ao-page-search">
            <SearchBar
              size="sm"
              value={search}
              onChange={setSearch}
              placeholder="Search…"
            />
          </div>
          {/* R2 Bug #25 (a11y honourable mention): aria-label on the
              status filter so screen readers announce purpose. */}
          <select className="field ao-page-filter" value={filter} onChange={e => setFilter(e.target.value)}
            aria-label="Filter by order status">
            <option value="all">All statuses</option>
            {Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="ao-skel-list">
          {[1,2,3].map(i => <div key={i} className="skeleton ao-skel-row" />)}
        </div>
      ) : loadError ? (
        // R1 Bug #14: real error state.
        <div className="ao-load-error">
          <AlertTriangle size={24} className="ao-load-error-icon" />
          <p className="ao-load-error-msg">{loadError}</p>
          <button
            onClick={() => {
              setLoadError(null);
              setLoading(true);
              setRetryKey((k) => k + 1);
            }}
            className="btn btn-outline btn-sm"
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="ao-list-empty">
          No orders found
          {/* R1 Bug #15 hint: explain when the cap may be filtering. */}
          {orders.length >= ORDERS_LIMIT && search && (
            <p className="ao-list-empty-note">
              Showing the {ORDERS_LIMIT} most recent orders. Older orders aren't searched.
            </p>
          )}
        </div>
      ) : (
        <div className="ao-list">
          {filtered.map(order => {
            // R1 Bug #9 + #16/#17: unknown statuses get a generic
            // fallback rather than masquerading as expired. Currency
            // displays defend against missing totalAmount.
            const meta = STATUS[order.status as OrderStatus] ?? STATUS.pending;
            const ts = order.createdAt?.toDate?.()
              ? order.createdAt.toDate().toLocaleString(undefined, { dateStyle:'short', timeStyle:'short' }) : '';
            // R1 Bug #19: closed orders include shipped (it's en-route,
            // mid-cancel would lose the customer their goods AND charge
            // them). Real cancellations on shipped/delivered orders go
            // through the dedicated reverse-flow tooling, not this UI.
            const isClosed = ['cancelled','rejected','expired','delivered','shipped'].includes(order.status);
            const isPickup = order.fulfillmentMethod === 'pickup';
            // R1 Bug #18: pickup orders have no shippingAddress.name —
            // fall back to recipientName (gift) or "Pickup customer".
            const customerLabel =
              order.shippingAddress?.name
              || order.recipientName
              || (isPickup ? 'Pickup customer' : '—');
            const totalDisplay = (order.totalAmount ?? 0).toFixed(2);

            return (
              <div
                key={order.id}
                className="ao-card"
                data-urgent={order.status === 'pending' ? 'true' : 'false'}
              >

                {/* Top row */}
                <div className="ao-card-top">
                  <div className="ao-card-info">
                    <div className="ao-card-id-row">
                      <span className="ao-card-id">
                        {/* R2 Bug #25: same fallback shape as OrdersPage. */}
                        {order.orderId || order.id}
                      </span>
                      <span className="ao-card-status" data-status={order.status}>
                        {meta.label}
                      </span>
                      {isPickup && (
                        <span title="Pickup order" className="ao-card-pill ao-card-pill-pickup">
                          📦 Pickup
                        </span>
                      )}
                      {order.isGift && (
                        <span
                          title={order.recipientName ? `Gift for ${order.recipientName}` : 'Gift order'}
                          className="ao-card-pill ao-card-pill-gift"
                        >
                          🎁 Gift
                        </span>
                      )}
                    </div>
                    {/* R1 Bug #18: clean meta line — no orphan-dot
                        when name is missing. */}
                    <p className="ao-card-meta">
                      {[customerLabel, order.customerId, ts].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="ao-card-totals">
                    {/* R1 Bug #16: `?? 0` then toFixed — no $undefined. */}
                    <p className="ao-card-total">
                      ${totalDisplay}
                    </p>
                    <p className="ao-card-items">
                      {order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Button row */}
                <div className="ao-card-buttons">
                  <button className="btn btn-outline btn-sm" onClick={() => setViewOrder(order)}>
                    <Eye size={12} /> View
                  </button>

                  {order.status === 'pending' && (
                    <button className="btn btn-outline btn-sm ao-card-edit-btn"
                      onClick={() => setEditOrder(order)}>
                      <Pencil size={12} /> Edit
                    </button>
                  )}

                  {order.status === 'pending' && (
                    <>
                      <button className="btn btn-sm ao-card-action-btn ao-card-action-success" onClick={() => openAction(order,'approve')}>
                        <CheckCircle2 size={12} /> Approve &amp; Charge
                      </button>
                      <button className="btn btn-sm ao-card-action-btn ao-card-action-danger" onClick={() => openAction(order,'reject')}>
                        <XCircle size={12} /> Reject
                      </button>
                    </>
                  )}

                  {/* Paid orders: delivery ships, pickup goes to the counter. */}
                  {order.status === 'in_progress' && !isPickup && (
                    <button className="btn btn-sm ao-card-action-btn ao-card-action-info" onClick={() => openAction(order,'ship')}>
                      <Truck size={12} /> Mark Shipped
                    </button>
                  )}
                  {order.status === 'in_progress' && isPickup && (
                    <button className="btn btn-sm ao-card-action-btn ao-card-action-success" onClick={() => openAction(order,'mark_ready_for_pickup')}>
                      <Package size={12} /> Mark Ready for Pickup
                    </button>
                  )}

                  {/* R1 Bug #22: pickup → ready_for_pickup → delivered. */}
                  {order.status === 'ready_for_pickup' && (
                    <button className="btn btn-sm ao-card-action-btn ao-card-action-success" onClick={() => openAction(order,'deliver')}>
                      <Package size={12} /> Confirm Pickup
                    </button>
                  )}

                  {order.status === 'shipped' && (
                    <button className="btn btn-sm ao-card-action-btn ao-card-action-success" onClick={() => openAction(order,'deliver')}>
                      <MapPin size={12} /> Mark Delivered
                    </button>
                  )}

                  {/* R1 Bug #19: cancel button no longer shows on
                      shipped/delivered/etc (closed). isClosed now
                      includes shipped. */}
                  {!isClosed && order.status !== 'pending' && (
                    <button className="btn btn-sm btn-outline ao-card-cancel-btn" onClick={() => openAction(order,'cancel')}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* View modal */}
      <Modal open={!!viewOrder} onClose={() => setViewOrder(null)}
        title={viewOrder?.orderId ?? ''} subtitle="Order details" size="md"
        footer={<ModalBtn variant="outline" onClick={() => setViewOrder(null)}>Close</ModalBtn>}>
        {viewOrder && <OrderDetail order={viewOrder} />}
      </Modal>

      {/* Edit modal — pending only */}
      {editOrder && (
        <EditOrderModal
          key={editOrder.id}
          order={editOrder}
          open={true}
          onClose={() => setEditOrder(null)}
          onSave={handleEditSave}
        />
      )}

      {/* Action modal */}
      {actionModal && (() => {
        const cfg = ACTION_CONFIG[actionModal.type];
        return (
          <Modal open={true} onClose={() => setActionModal(null)}
            title={cfg.title}
            // R1 Bug #17: defend against missing totalAmount.
            subtitle={`Order ${actionModal.order.orderId} · $${(actionModal.order.totalAmount ?? 0).toFixed(2)}`}
            size="sm"
            footer={
              <>
                <ModalBtn variant="outline" onClick={() => setActionModal(null)}>Cancel</ModalBtn>
                <ModalBtn onClick={applyAction} loading={saving} variant={cfg.variant}>{cfg.cta}</ModalBtn>
              </>
            }>
            <p className="ao-modal-desc">{cfg.desc}</p>
            {cfg.fields && <div className="ao-modal-fields">{cfg.fields}</div>}
          </Modal>
        );
      })()}
    </div>
  );
}
export default AdminOrders;
