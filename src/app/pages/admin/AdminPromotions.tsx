import { useState, useEffect } from 'react';
import { useForm, FormProvider, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy, Loader2, Mail, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, type Timestamp,
} from 'firebase/firestore';
import { db, getFunctionsLazy } from '@/lib/firebase';
import { toast } from 'sonner';
import { SeoHead } from '@/app/components/SeoHead';
import { Modal, ModalBtn, ConfirmModal } from '@/app/components/modals/Modal';
import { Field } from '@/app/components/ui/Field';
import { promotionFormSchema, type PromotionFormInput } from '@/schemas/promotion.schema';

import { AdminPageHeader } from '@/app/components/admin/AdminPageHeader';
interface Promo {
  id:            string;
  code:          string;
  description:   string;
  discountType:  'percentage' | 'fixed';
  discountValue: number;
  minPurchase:   number;
  /** Max dollar amount a percentage discount can reach. null = uncapped.
   *  Only meaningful for discountType === 'percentage'; ignored otherwise. */
  maxDiscount:   number | null;
  usageLimit:    number | null;
  usageCount:    number;
  perUserLimit:  number | null;
  isActive:      boolean;
  /** Email customers automatically when it goes live. */
  announce?:     boolean;
  /** Set by the server once customers were emailed. */
  announcedAt?:  Timestamp;
  announcedCount?: number;
  announceError?: string;
  startDate:     string;
  endDate:       string;
  createdAt?:    Timestamp;
}

const EMPTY: Omit<Promo, 'id' | 'usageCount' | 'createdAt'> = {
  code: '', description: '', discountType: 'percentage', discountValue: 10,
  minPurchase: 0, maxDiscount: null, usageLimit: null, perUserLimit: null, isActive: true, announce: true,
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
};

/** Promotion dates are stored as "YYYY-MM-DD" strings by this page; a
 *  document written elsewhere may hold a Firestore Timestamp or Date.
 *  Normalise to the string form so one odd record can't crash the page. */
function toDateString(v: unknown): string {
  if (typeof v === 'string') return v;
  const d = v instanceof Date ? v
    : v && typeof (v as { toDate?: () => Date }).toDate === 'function' ? (v as { toDate: () => Date }).toDate()
    : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '';
}

/** Format a stored day for display; empty string for anything unreadable. */
function formatDay(day: string, opts: Intl.DateTimeFormatOptions): string {
  const d = new Date(day);
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(undefined, opts).format(d);
}

function isPromoActive(p: Promo): boolean {
  return getPromoStatus(p) === 'active';
}

/**
 * getPromoStatus — richer status used by the admin badge so admin can
 * see WHY a promo is inactive at a glance, not just THAT it is.
 *
 *   active     — usable today
 *   paused     — admin flipped the isActive toggle off
 *   scheduled  — startDate is in the future
 *   expired    — endDate is in the past
 *   used-up    — hit the total usageLimit
 *
 * Resolved in priority order: paused beats scheduled beats expired
 * beats used-up. If an admin pauses a promo that's also expired, the
 * UI shows "Paused" because that's the action the admin actually took.
 */
type PromoStatus = 'active' | 'paused' | 'scheduled' | 'expired' | 'used-up';
function getPromoStatus(p: Promo): PromoStatus {
  if (!p.isActive) return 'paused';
  const now = new Date();
  if (p.startDate && new Date(p.startDate) > now) return 'scheduled';
  if (p.endDate   && new Date(p.endDate)   < now) return 'expired';
  if (p.usageLimit !== null && p.usageCount >= p.usageLimit) return 'used-up';
  return 'active';
}

// ─────────────────────────────────────────────────────────────────────────────
// KEY FIX: Form is extracted to MODULE LEVEL — never re-defined on re-render.
// When defined inside the parent component, React sees a new component type
// on every render and unmounts + remounts all inputs → one-letter-at-a-time lag.
//
// Phase 6: Reads RHF state via useFormContext (parent provides
// FormProvider). The compound <Field> primitive handles label/input/
// error wiring. Validation timing follows mode='onTouched' +
// reValidateMode='onChange' set on the parent's useForm.
// ─────────────────────────────────────────────────────────────────────────────
function PromotionForm() {
  const { register, watch, setValue, formState: { errors } } = useFormContext<PromotionFormInput>();
  const discountType = watch('discountType');
  return (
    <div className="ap-form-stack">

      {/* Code */}
      <Field name="code" required>
        <Field.Label>Code</Field.Label>
        <Field.Input
          className="field ap-code-input"
          placeholder="SUMMER20"
          {...register('code', {
            // Auto-uppercase on change — promo codes are conventionally
            // upper-cased, but the input would otherwise echo whatever
            // the user types. setValue is RHF's mutation API.
            onChange: (e) => setValue('code', e.target.value.toUpperCase(), { shouldValidate: true }),
          })}
        />
        <Field.Error>{errors.code?.message}</Field.Error>
      </Field>

      {/* Description */}
      <Field name="description">
        <Field.Label>Description</Field.Label>
        <Field.Input
          placeholder="Summer sale — 20% off everything"
          {...register('description')}
        />
        <Field.Error>{errors.description?.message}</Field.Error>
      </Field>

      {/* Discount type + value */}
      <div className="ap-form-grid">
        <Field name="discountType">
          <Field.Label>Discount Type</Field.Label>
          {/* Field.Select wires `id={inputId}` so the Label's `htmlFor`
              actually points at a real element. Pre-fix this was a
              raw <select> and clicking the label did nothing. */}
          <Field.Select {...register('discountType')}>
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed ($)</option>
          </Field.Select>
          <Field.Error>{errors.discountType?.message}</Field.Error>
        </Field>
        <Field name="discountValue" required>
          <Field.Label>Value</Field.Label>
          <Field.Input
            type="number"
            min="1"
            step="1"
            placeholder={discountType === 'percentage' ? '20' : '10'}
            {...register('discountValue', { valueAsNumber: true })}
          />
          <Field.Error>{errors.discountValue?.message}</Field.Error>
        </Field>
      </div>

      {/* Min purchase + usage limit */}
      <div className="ap-form-grid">
        <Field name="minPurchase">
          <Field.Label>Min Purchase ($)</Field.Label>
          <Field.Input
            type="number"
            min="0"
            step="1"
            placeholder="0"
            {...register('minPurchase', { valueAsNumber: true })}
          />
          <Field.Error>{errors.minPurchase?.message}</Field.Error>
        </Field>
        <Field name="usageLimit">
          <Field.Label>Usage Limit</Field.Label>
          <Field.Input
            type="number"
            min="1"
            step="1"
            placeholder="Unlimited"
            {...register('usageLimit', {
              // Empty string → null (matches the schema's nullable
              // shape). RHF's setValueAs is the canonical place to
              // do per-field input transforms.
              setValueAs: (v) => (v === '' || v === null ? null : Number(v)),
            })}
          />
          <Field.Error>{errors.usageLimit?.message}</Field.Error>
        </Field>
      </div>

      {/* Per-user limit + Max discount (percentage only) */}
      <div className="ap-form-grid">
        <Field name="perUserLimit">
          <Field.Label>Per-User Limit</Field.Label>
          <Field.Input
            type="number"
            min="1"
            step="1"
            placeholder="Unlimited"
            {...register('perUserLimit', {
              setValueAs: (v) => (v === '' || v === null ? null : Number(v)),
            })}
          />
          <Field.Error>{errors.perUserLimit?.message}</Field.Error>
        </Field>
        {discountType === 'percentage' ? (
          <Field name="maxDiscount">
            <Field.Label>Max Discount ($)</Field.Label>
            <Field.Input
              type="number"
              min="0"
              step="1"
              placeholder="No cap"
              {...register('maxDiscount', {
                setValueAs: (v) => (v === '' || v === null ? null : Number(v)),
              })}
            />
            <Field.Error>{errors.maxDiscount?.message}</Field.Error>
          </Field>
        ) : <div /> /* keeps the grid balanced */}
      </div>

      {/* Start + End Date */}
      <div className="ap-form-grid">
        <Field name="startDate" required>
          <Field.Label>Start Date</Field.Label>
          <Field.Input type="date" {...register('startDate')} />
          <Field.Error>{errors.startDate?.message}</Field.Error>
        </Field>
        <Field name="endDate" required>
          <Field.Label>End Date</Field.Label>
          <Field.Input type="date" {...register('endDate')} />
          <Field.Error>{errors.endDate?.message}</Field.Error>
        </Field>
      </div>

      {/* Active toggle */}
      <label className="ap-active-toggle">
        <input
          type="checkbox"
          {...register('isActive')}
          className="ap-active-checkbox"
        />
        <span>
          <strong className="ap-active-title">Active</strong>
          <span className="ap-active-desc">Show this code at checkout</span>
        </span>
      </label>

      {/* Announce toggle */}
      <label className="ap-active-toggle">
        <input
          type="checkbox"
          {...register('announce')}
          className="ap-active-checkbox"
        />
        <span>
          <strong className="ap-active-title">Email customers</strong>
          <span className="ap-active-desc">When it goes live, email + notify every customer who has Promotions on (once). Leave off for private codes.</span>
        </span>
      </label>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function AdminPromotions() {
  const [promos,  setPromos]  = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Promo | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [copied,  setCopied]  = useState<string | null>(null);

  // Phase 6 migration: ad-hoc useState({...EMPTY}) → RHF useForm.
  // The schema (promotionFormSchema) enforces every field-level rule
  // that handleSave used to surface as toasts (required code,
  // positive value, percentage cap, end-after-start). Errors now
  // appear inline via <Field.Error> rather than as toasts.
  const form = useForm<PromotionFormInput>({
    resolver: zodResolver(promotionFormSchema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: { ...EMPTY },
  });

  useEffect(() => {
    const q = query(collection(db, 'promotions'), orderBy('createdAt', 'desc'));
    setLoadError(null);
    return onSnapshot(q, snap => {
      setPromos(snap.docs.map(d => {
        const raw = d.data();
        return { ...raw, id: d.id, startDate: toDateString(raw.startDate), endDate: toDateString(raw.endDate) } as Promo;
      }));
      setLoading(false);
      setLoadError(null);
    }, err => {
      console.error('[AdminPromotions] subscription error:', err);
      setLoadError('Could not load promotions. Check your connection or permissions.');
      setLoading(false);
    });
  }, []);

    const closeModal = () => {
    setOpen(false); setEditing(null); form.reset({ ...EMPTY });
    };

  const openNew = () => { setEditing(null); form.reset({ ...EMPTY }); setOpen(true); };

  const openEdit = (p: Promo) => {
    setEditing(p);
    form.reset({
      code: p.code, description: p.description,
      discountType: p.discountType, discountValue: p.discountValue,
      minPurchase: p.minPurchase ?? 0,
      maxDiscount: p.maxDiscount ?? null,
      usageLimit: p.usageLimit, perUserLimit: p.perUserLimit,
      isActive: p.isActive,
      announce: p.announce ?? false,
      startDate: p.startDate?.slice(0, 10) ?? EMPTY.startDate,
      endDate:   p.endDate?.slice(0, 10)   ?? EMPTY.endDate,
    });
    setOpen(true);
  };

  const handleSave = async (formData: PromotionFormInput) => {
    setSaving(true);
    try {
      const data = {
        ...formData,
        code: formData.code.toUpperCase().trim(),
        usageLimit:   formData.usageLimit   ?? null,
        perUserLimit: formData.perUserLimit ?? null,
        // Max discount only meaningful for percentage. Force null for
        // fixed-amount promos so old/dirty data doesn't linger after a
        // type change.
        maxDiscount:  formData.discountType === 'percentage' ? (formData.maxDiscount ?? null) : null,
        updatedAt:    serverTimestamp(),
      };
      if (editing) {
        await updateDoc(doc(db, 'promotions', editing.id), data);
        toast.success('Promo updated');
      } else {
        await addDoc(collection(db, 'promotions'), { ...data, usageCount: 0, createdAt: serverTimestamp() });
        toast.success('Promo created');
      }
      closeModal();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to save'); } finally { setSaving(false); }
  };

  const [confirmDelete, setConfirmDelete] = useState<Promo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const handleDelete = (p: Promo) => setConfirmDelete(p);
  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'promotions', confirmDelete.id));
      toast.success('Deleted');
      setConfirmDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  };

  const [notifying, setNotifying] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState<Promo | null>(null);
  const notifyCustomers = (p: Promo) => setConfirmSend(p);
  const sendPromo = async () => {
    const p = confirmSend;
    if (!p) return;
    const again = !!p.announcedAt;
    setNotifying(p.id);
    try {
      const { functions } = await getFunctionsLazy();
      const fn = httpsCallable<{ promotionId: string; force: boolean }, { sent: number; skipped?: string; error?: string }>(functions, 'notifyPromotion');
      const { data } = await fn({ promotionId: p.id, force: again });
      if (data.skipped) toast.error(`Not sent: ${data.skipped}`);
      else if (data.error) toast.error(`Sent ${data.sent}, then stopped: ${data.error}`);
      else toast.success(`Sent to ${data.sent} customer${data.sent === 1 ? '' : 's'}`);
      setConfirmSend(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to notify customers');
    } finally {
      setNotifying(null);
    }
  };

  const toggleActive = async (p: Promo) => {
    await updateDoc(doc(db, 'promotions', p.id), { isActive: !p.isActive, updatedAt: serverTimestamp() });
  };

  const activeCount = promos.filter(isPromoActive).length;

  return (
    <div className="ap-shell">
      <SeoHead title="Promotions | Admin" description="" noIndex />

      {/* Header */}
      <AdminPageHeader
        eyebrow="Discount codes"
        title="Promotions"
        description={`${promos.length} total · ${activeCount} active`}
        actions={<button onClick={openNew} className="btn btn-dark"><Plus size={14} /> New code</button>}
      />

      {/* List */}
      {loadError && (
        <div className="ap-error" role="alert">
          <p>{loadError}</p>
        </div>
      )}
      {loading ? (
        <div className="ap-skeleton-list">
          {[1,2,3].map(i => <div key={i} className="skeleton ap-skeleton-row" />)}
        </div>
      ) : promos.length === 0 ? (
        <div className="ap-empty">
          <div className="ap-empty-icon-wrap">
            <Tag size={22} className="ap-empty-icon" />
          </div>
          <p className="ap-empty-msg">No promo codes yet.</p>
          <button onClick={openNew} className="btn btn-outline ap-empty-cta">
            <Plus size={13} /> Create your first code
          </button>
        </div>
      ) : (
        <div className="ap-list">
          {promos.map(p => {
            const status = getPromoStatus(p);
            const active = status === 'active';
            const statusLabel = {
              active:    'Active',
              paused:    'Paused',
              scheduled: 'Scheduled',
              expired:   'Expired',
              'used-up': 'Used up',
            }[status];
            const statusColor = {
              active:    { bg: 'var(--success-bg)', fg: 'var(--success)', dot: 'var(--success)' },
              paused:    { bg: 'var(--surface-2)',  fg: 'var(--muted)',   dot: 'var(--border)'  },
              scheduled: { bg: 'var(--gold-soft)',  fg: 'var(--gold-text)', dot: 'var(--gold-deep)' },
              expired:   { bg: 'var(--surface-2)',  fg: 'var(--muted)',   dot: 'var(--border)'  },
              'used-up': { bg: 'var(--warning-bg, var(--gold-soft))', fg: 'var(--warning, var(--gold-text))', dot: 'var(--warning, var(--gold-deep))' },
            }[status];
            return (
              <div key={p.id} className="ap-row">

                {/* Status dot — color from --ap-status-dot, glow via [data-active='true']. */}
                <span
                  className="ap-status-dot"
                  data-active={active ? 'true' : 'false'}
                  // eslint-disable-next-line react/forbid-dom-props
                  style={{ ['--ap-status-dot' as string]: statusColor.dot }}
                />

                {/* Code + meta */}
                <div className="ap-row-info">
                  <div className="ap-row-head">
                    <span className="ap-code">{p.code}</span>
                    <button
                      onClick={() => copyCode(p.code)}
                      className={copied === p.code ? 'ap-copy-btn ap-copy-btn-success' : 'ap-copy-btn'}
                      title="Copy code"
                    >
                      {copied === p.code ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                  <p className="ap-meta">
                    {/* Structured discount summary — always rendered from
                        the actual fields, NOT from admin's description.
                        Previously: `description || computed` meant a typo
                        in the description field could hide (or contradict)
                        the real discount value. */}
                    {p.discountType === 'percentage' ? `${p.discountValue}% off` : `$${p.discountValue} off`}
                    {p.minPurchase > 0 && ` · min $${p.minPurchase}`}
                    {p.usageLimit ? ` · ${p.usageCount}/${p.usageLimit} uses` : ` · ${p.usageCount} uses`}
                    {p.endDate && ` · expires ${formatDay(p.endDate, { month:'short', day:'numeric', year:'numeric' })}`}
                  </p>
                  {/* Optional description — supplementary tagline, never
                      replaces the structured summary above. */}
                  {p.announcedAt ? (
                    <p className="ap-desc">Emailed to {p.announcedCount ?? 0} customer{p.announcedCount === 1 ? '' : 's'}{p.announceError ? ` · stopped early: ${p.announceError}` : ''}</p>
                  ) : p.announce ? (
                    <p className="ap-desc">Customers will be emailed when it goes live</p>
                  ) : null}
                  {p.description && (
                    <p className="ap-desc">{p.description}</p>
                  )}
                </div>

                {/* Right side — badge, status toggle, actions */}
                <div className="ap-actions">
                  <span className="ap-badge">
                    {p.discountType === 'percentage' ? `${p.discountValue}%` : `$${p.discountValue}`}
                  </span>

                  <button
                    onClick={() => toggleActive(p)}
                    title={
                      status === 'active'    ? 'Click to pause this promo' :
                      status === 'paused'    ? 'Click to activate this promo' :
                      status === 'scheduled' ? `Will activate on ${formatDay(p.startDate, { month:'short', day:'numeric' })}` :
                      status === 'expired'   ? 'Edit to extend the end date' :
                                               `Hit ${p.usageLimit} use limit — edit to raise it`
                    }
                    className="ap-status-btn"
                    // eslint-disable-next-line react/forbid-dom-props
                    style={{
                      ['--ap-status-bg' as string]: statusColor.bg,
                      ['--ap-status-fg' as string]: statusColor.fg,
                    }}
                  >
                    {statusLabel}
                  </button>

                  <button
                    onClick={() => notifyCustomers(p)}
                    className="ap-icon-btn"
                    title={status === 'active' ? 'Email & notify customers now' : 'Only live promos can be sent'}
                    aria-label={`Notify customers about ${p.code}`}
                    disabled={status !== 'active' || notifying === p.id}
                  >
                    {notifying === p.id ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                  </button>
                  <button
                    onClick={() => openEdit(p)}
                    className="ap-icon-btn"
                    title="Edit promo"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(p)}
                    className="ap-icon-btn ap-icon-btn-delete"
                    title="Delete promo"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal — wraps form + footer in FormProvider so the
          PromotionForm component (defined at module level) can pull
          register/errors via useFormContext, and the footer button
          calls form.handleSubmit with the schema-validated data. */}
      <FormProvider {...form}>
        <Modal
          open={open}
          onClose={closeModal}
          title={editing ? 'Edit Promotion' : 'New Promotion'}
          subtitle={editing ? `Editing code: ${editing.code}` : 'Create a new discount code'}
          size="md"
          footer={
            <>
              <ModalBtn variant="outline" onClick={closeModal}>Cancel</ModalBtn>
              <ModalBtn onClick={form.handleSubmit(handleSave)} loading={saving}>
                {editing ? 'Save Changes' : 'Create Promotion'}
              </ModalBtn>
            </>
          }
        >
          <PromotionForm />
        </Modal>
      </FormProvider>
      <ConfirmModal
        open={!!confirmSend}
        onClose={() => { if (!notifying) setConfirmSend(null); }}
        onConfirm={sendPromo}
        loading={!!notifying}
        danger={false}
        title={confirmSend?.announcedAt ? 'Send this promotion again?' : 'Send this promotion?'}
        message={confirmSend?.announcedAt
          ? `"${confirmSend.code}" was already sent to ${confirmSend.announcedCount ?? 0} customer${confirmSend.announcedCount === 1 ? '' : 's'}. Sending again emails and notifies everyone who has Promotions on — including them.`
          : `Every customer who has Promotions on will get an email, an in-app notification and a phone notification about "${confirmSend?.code ?? ''}".`}
        confirmLabel={confirmSend?.announcedAt ? 'Send again' : 'Send now'}
      />

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => { if (!deleting) setConfirmDelete(null); }}
        onConfirm={doDelete}
        loading={deleting}
        title="Delete promotion"
        message={`Delete "${confirmDelete?.code ?? ''}"? Customers can no longer use this code. This cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
export default AdminPromotions;
