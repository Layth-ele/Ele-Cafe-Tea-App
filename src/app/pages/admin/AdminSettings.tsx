// (moved below imports)
/**
 * AdminSettings — Ele Café
 * Store settings saved to Firestore /settings/global
 * Covers: online payments, store info, order rules, credits, notifications.
 */
import { useEffect, useState, useMemo, cloneElement, isValidElement } from 'react';
import type { ReactElement } from 'react';
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Coins,
  CreditCard,
  Gift,
  ImageIcon,
  Layers,
  Loader2,
  Mail,
  Package,
  RefreshCw,
  Save,
  ShieldCheck,
  Store,
  Upload,
  Wrench,
} from 'lucide-react';
import { addDoc, collection, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, getFunctionsLazy, getStorageLazy } from '@/lib/firebase';
import { cloverConfigured, walletsEnabled } from '@/lib/cloverCheckout';
import { invalidateSettingsCache } from '@/hooks/useSettings';
import {
  createEmptyAnnouncement,
  migrateLegacyAnnouncementText,
  type Announcement,
} from '@/schemas/announcement.schema';
import { ComboGalleryAdmin } from '@/app/components/admin/ComboGalleryAdmin';
import { CategoryNamesAdmin } from '@/app/components/admin/CategoryNamesAdmin';
import {
  DEFAULT_BUSINESS_HOURS,
  WEEKDAY_FULL,
  WEEKDAY_ORDER,
  normaliseBusinessHours,
  type BusinessHoursDay,
  type WeekdayKey,
} from '@/lib/businessHours';

import { toast } from 'sonner';
import { SeoHead } from '@/app/components/SeoHead';

import { AdminPageHeader } from '@/app/components/admin/AdminPageHeader';
// ── Default settings ────────────────────────────────────────────────────────
const DEFAULTS = {
  // Store
  storeName: 'Ele Café',
  storeEmail: 'info@elecafe.ca',
  storeAddress: '895 West Broadway, Vancouver, BC V5Z 1J9',
  storePhone: '604-566-9998',
  storeWebsite: 'https://elecafe.ca',

  adminEmail: 'info@elecafe.ca',

  // Order rules — must match SETTING_DEFAULTS in useSettings.ts so the
  // form doesn't show stale values that drift from runtime behaviour.
  orderExpiryHours: 72,
  freeShippingThreshold: 100,
  freeSampleWithOrders: true,
  defaultShippingFee: 12.99,

  // Credits — must match SETTING_DEFAULTS in useSettings.ts.
  pointsPerDollar: 100,
  // R3 Bug #8: this default was 1000, which is 10× lower than
  // useSettings.ts SETTING_DEFAULTS (10000). The comment above
  // claimed they "must match" but they didn't — admins clicking
  // Save on a fresh form silently dropped the redemption threshold
  // by an order of magnitude, letting customers redeem in 1000-pt
  // increments earning fractional dollars.
  minRedemptionPts: 10000, // pts needed before can redeem
  creditValuePer1000: 1, // $ value per 1000 pts
  welcomeBonusPoints: 500, // pts granted to new customers on signup

  // Notifications
  sendOrderEmails: true,
  sendShippingEmails: true,

  // Announcement
  announcementText: 'Free shipping on all orders · Free sample with every order',
  announcementEnabled: true,
  /** Rotating announcements list — each with optional luxury highlight
   *  chip (price, promo code, date) and optional date range for
   *  scheduled campaigns. Empty array → falls back to announcementText.
   *
   *  Schema-fidelity fix: type imported from announcement.schema rather
   *  than re-declared inline. Pre-fix the inline anonymous type
   *  duplicated the shape and could silently drift from the Zod schema
   *  (which has `.or(z.literal(''))` semantics on optional fields, plus
   *  any future field additions). Using the canonical type means the
   *  filter/render layer (Navbar's `filterActiveAnnouncements`) and the
   *  editor here can't disagree about the shape. */
  announcements: [] as Announcement[],

  // Day 16 v9: gift-builder feature flag (see useSettings.ts notes).
  giftBuilderEnabled: false,

  // Combo Gallery feature flag (see useSettings.ts notes).
  comboGalleryEnabled: false,

  // Social links — see useSettings.ts notes. Instagram handle is
  // @elecafe_ (with trailing underscore). WhatsApp uses wa.me click-to-
  // chat URL — same phone number as the voice line.
  socialInstagram: 'https://www.instagram.com/elecafe_',
  socialWhatsapp: 'https://wa.me/16045669998',
  socialFacebook: '',
  socialX: '',
  socialPinterest: '',
  socialTiktok: '',

  // Google Maps URL — when set, the footer address becomes a clickable
  // Maps link. Get the URL from Google Maps' Share → "Copy link" button.
  mapsUrl: '',

  // Business hours — 7-row Mon→Sun array. See lib/businessHours.ts and
  // useSettings.ts for the full schema. Admin edits per-day via the
  // BusinessHoursEditor below; saved verbatim into /settings/global.
  businessHours: DEFAULT_BUSINESS_HOURS.map((d) => ({ ...d })) as BusinessHoursDay[],

  // Branding — uploaded via Storage, URL stored in Firestore
  // Two-logo system (see useSettings.ts notes):
  //   logoUrlNoBg     — transparent, header light mode
  //   logoUrlWhiteBg  — white-bg, footer + header dark mode
  // Legacy logoUrl / footerLogoUrl kept for backward compat.
  logoUrlNoBg: '',
  logoUrlWhiteBg: '',
  logoUrl: '',
  faviconUrl: '',
  // Schema-fidelity round 2: emailLogoUrl is read by the CF
  // (getStoreSettings → branded email header). Pre-fix admin couldn't
  // override it from the UI — only via Firestore Console — so the
  // hosted-default at /email-assets/logo.png was effectively the only
  // logo emails could carry. ogImageUrl ships with useSettings's
  // SETTING_DEFAULTS for OG-card fallbacks; mirror it here so the admin
  // form can edit it.
  emailLogoUrl: '',
  ogImageUrl: '',
  footerLogoUrl: '',
  footerText: '',
  footerTextFr: '',
};

type Settings = typeof DEFAULTS;

// ── Section wrapper ─────────────────────────────────────────────────────────
function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card as-section">
      <button onClick={() => setOpen((v) => !v)} className="as-section-toggle" aria-expanded={open}>
        <div className="as-section-head">
          <div className="as-section-icon-wrap">
            <Icon size={15} className="as-section-icon" />
          </div>
          <span className="as-section-title">{title}</span>
        </div>
        {open ? (
          <ChevronUp size={15} className="as-section-chev" />
        ) : (
          <ChevronDown size={15} className="as-section-chev" />
        )}
      </button>
      {open && (
        <div className="as-section-body">
          <div className="as-section-stack">{children}</div>
        </div>
      )}
    </div>
  );
}

// ── Field ───────────────────────────────────────────────────────────────────
// Phase 6: renamed from `Field` → `AdminSettingsField` so it doesn't
// shadow the new `<FormField>` compound primitive (same playbook as
// AccountPage's AddressField rename). AdminSettings's many sub-forms
// each persist a partial-update to one shared `settings` Firestore
// doc, so a full RHF migration would mean 7+ useForm instances; the
// rename + htmlFor wiring is the right cost-benefit here.
//
// `htmlFor` is generated from the label so the label-to-input
// association works for screen readers without every callsite
// having to spell out an id. cloneElement injects `id` on the
// child input.
function AdminSettingsField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const id = useMemo(
    () =>
      'as-' +
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
    [label],
  );
  // Walk children: if the first valid child is an <input>/<select>/
  // <textarea> with no id, inject one. Wrapping a generic
  // ReactNode is safe because cloneElement passes through other
  // children unchanged.
  const wired = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string }>, { id })
    : children;
  return (
    <div className="field-group">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {wired}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

// ── Toggle ──────────────────────────────────────────────────────────────────
function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="as-toggle-row">
      <div>
        <p className="as-toggle-label">{label}</p>
        {hint && <p className="as-toggle-hint">{hint}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className="as-toggle-track"
        data-on={value ? 'true' : 'false'}
        role="switch"
        aria-checked={value}
        aria-label={label}
      >
        {/* R3 file4: was background:'#fff' on a thumb that sits on
            either var(--success) (dark green, high contrast) OR
            var(--border) (cream in light, dark navy in dark) depending
            on toggle state. White-on-cream when off in light mode was
            low contrast (~1.4:1). Switched to var(--surface) which
            resolves to white in light mode and a lifted dark-grey in
            dark mode — both give the disc-on-track lift that the UI
            expects without the white-on-cream issue. */}
        <div className="as-toggle-thumb" />
      </button>
    </div>
  );
}

// ── Business Hours editor ───────────────────────────────────────────────────
//
// Renders 7 rows (Mon → Sun). Each row has:
//   • Toggle: open / closed
//   • Two <input type="time"> fields for open and close (HH:MM)
//
// Time inputs use the native picker — works well on every browser and
// outputs HH:MM in 24h, exactly the storage format. No extra parsing
// or validation needed beyond the existing normaliser. Mobile gets
// the platform-native time picker for free.
//
// "Apply Mon–Fri to weekdays" quick action duplicates Mon's open/close
// across Tue–Fri — saves admin from typing five times when most stores
// have identical weekday hours. Saturday and Sunday are left untouched.
function BusinessHoursEditor({
  hours,
  onChange,
}: {
  hours: BusinessHoursDay[];
  onChange: (next: BusinessHoursDay[]) => void;
}) {
  // Patch a single row by day key. Keeps any unrelated state stable
  // — never rebuilds the whole array from scratch beyond a single
  // shallow copy.
  const updateRow = (day: WeekdayKey, patch: Partial<BusinessHoursDay>) => {
    onChange(hours.map((r) => (r.day === day ? { ...r, ...patch } : r)));
  };

  // Bulk action: copy Monday's open/close to Tue–Fri. We only mirror
  // the times — closed status stays per-day so admin can have one
  // weekday off without losing the others.
  const applyMonToWeekdays = () => {
    const monday = hours.find((r) => r.day === 'mon');
    if (!monday) return;
    onChange(
      hours.map((r) => {
        if (r.day === 'mon' || r.day === 'sat' || r.day === 'sun') return r;
        return { ...r, open: monday.open, close: monday.close };
      }),
    );
  };

  // Reset to factory defaults. Useful after experimentation; admin
  // gets a confirm before destructive replace.
  const resetToDefaults = () => {
    if (
      !window.confirm(
        'Reset all 7 days to the default hours? This will discard your current hours.',
      )
    )
      return;
    onChange(DEFAULT_BUSINESS_HOURS.map((d) => ({ ...d })));
  };

  return (
    <div className="as-bh">
      <p className="as-bh-intro">
        These hours appear on the contact card across the site. Contiguous days with identical times
        are automatically merged into ranges (e.g. "Monday – Friday") when displayed to customers —
        you don't need to enter them as ranges here.
      </p>

      {/* Quick-action row */}
      <div className="as-bh-actions">
        <button type="button" onClick={applyMonToWeekdays} className="btn btn-outline as-bh-btn-sm">
          Copy Mon to Tue–Fri
        </button>
        <button type="button" onClick={resetToDefaults} className="btn btn-outline as-bh-btn-sm">
          Reset to defaults
        </button>
      </div>

      {/* Per-day rows */}
      <div className="as-bh-rows">
        {WEEKDAY_ORDER.map((day) => {
          const row = hours.find((r) => r.day === day) ?? {
            day,
            closed: false,
            open: '09:00',
            close: '17:00',
          };
          return (
            <div key={day} className="as-bh-row" data-closed={row.closed ? 'true' : 'false'}>
              {/* Day label */}
              <span className="as-bh-day">{WEEKDAY_FULL[day]}</span>

              {/* Closed toggle */}
              <label className="as-bh-closed-label">
                <input
                  type="checkbox"
                  checked={row.closed}
                  onChange={(e) => updateRow(day, { closed: e.target.checked })}
                  className="as-bh-closed-cb"
                />
                Closed
              </label>

              {/* Time inputs — disabled when closed, but values preserved
                  in state so un-checking restores the previous range. */}
              <div className="as-bh-times">
                <input
                  type="time"
                  className="field as-bh-time"
                  value={row.open}
                  onChange={(e) => updateRow(day, { open: e.target.value })}
                  disabled={row.closed}
                  aria-label={`${WEEKDAY_FULL[day]} opening time`}
                />
                <span className="as-bh-to">to</span>
                <input
                  type="time"
                  className="field as-bh-time"
                  value={row.close}
                  onChange={(e) => updateRow(day, { close: e.target.value })}
                  disabled={row.closed}
                  aria-label={`${WEEKDAY_FULL[day]} closing time`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="as-bh-note">
        Closing time is exclusive — e.g. <strong>19:00</strong> means doors close at 7 pm. Use
        24-hour format in the picker (most browsers will show 12-hour with am/pm based on your
        system locale).
      </p>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────
// NotificationDiagnostic — admin-only utility to verify the notification
// pipeline end-to-end without needing real order activity.
//
// Writes a self-targeted (recipientId: 'admin') notification doc that
// passes the create rule in firestore.rules. The bell component will
// pick it up via onSnapshot in real time.
// ─────────────────────────────────────────────────────────────────────────

function NotificationDiagnostic() {
  const [busy, setBusy] = useState(false);
  const [lastResult, setLast] = useState<string | null>(null);

  async function sendTest() {
    setBusy(true);
    setLast(null);
    try {
      await addDoc(collection(db, 'notifications'), {
        recipientId: 'admin',
        type: 'admin_order_placed',
        title: 'Test notification',
        body: `Sent from /admin/settings at ${new Date().toLocaleTimeString()}.`,
        data: { orderId: 'TEST-' + Math.random().toString(36).slice(2, 6).toUpperCase() },
        isRead: false,
        createdAt: serverTimestamp(),
      });
      setLast('✓ Sent — open the bell to see it (it should appear in real time).');
      toast.success('Test notification sent');
    } catch (err) {
      console.error('[notif diagnostic] failed', err);
      const e = err as { code?: string; message?: string };
      const msg =
        e.code === 'permission-denied'
          ? 'Permission denied. Have you deployed the updated firestore.rules? Run: firebase deploy --only firestore:rules'
          : `Failed: ${e.message ?? 'unknown error'}`;
      setLast('✗ ' + msg);
      toast.error('Test notification failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="as-nt">
      <p className="as-nt-intro">
        Click below to write a test notification addressed to admins. It appears immediately in your
        bell via the onSnapshot subscription. Useful for verifying Firestore reads, security rules,
        and the bell UI without staging real order activity.
      </p>
      <div className="as-nt-row">
        <button type="button" onClick={sendTest} disabled={busy} className="btn btn-dark as-nt-btn">
          {busy ? (
            <>
              <RefreshCw size={14} className="icon-spin" /> Sending…
            </>
          ) : (
            <>
              <Bell size={14} /> Send Test Notification
            </>
          )}
        </button>
        {lastResult && (
          <span className="as-nt-result" data-status={lastResult.startsWith('✓') ? 'ok' : 'err'}>
            {lastResult}
          </span>
        )}
      </div>
      <p className="as-nt-note">
        Production notifications come from the <code>onOrderWrite</code> Cloud Function when order
        status changes. If the bell is empty in production, confirm Cloud Functions are deployed:{' '}
        <code>firebase functions:list</code>.
      </p>
    </div>
  );
}

/** Read-only card-payment connection status (build-time Clover config). */
function PaymentStatus() {
  const env = import.meta.env.VITE_CLOVER_ENVIRONMENT === 'production' ? 'Live' : 'Test (sandbox)';
  const rows: [string, string, boolean][] = [
    ['Provider', 'Clover', true],
    ['Mode', env, env === 'Live'],
    [
      'Card form',
      cloverConfigured ? 'Configured' : 'Not configured — add VITE_CLOVER_PUBLIC_KEY',
      cloverConfigured,
    ],
    ['Google Pay', walletsEnabled ? 'On' : 'Off', true],
  ];
  return (
    <div className="as-pay-status">
      {rows.map(([label, value, ok]) => (
        <div key={label} className="as-pay-status-row" data-ok={ok ? 'true' : 'false'}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

export function AdminSettings() {
  // New two-logo system upload state — independent so admin can
  // upload both logos in parallel (e.g. drag two files, no need to
  // wait for one to finish before starting the other).
  const [noBgUploading, setNoBgUploading] = useState(false);
  const [noBgUploadPct, setNoBgUploadPct] = useState(0);
  const [whiteBgUploading, setWhiteBgUploading] = useState(false);
  const [whiteBgUploadPct, setWhiteBgUploadPct] = useState(0);
  // ── Upload brand asset helper ──
  async function uploadBrandAsset(
    file: File,
    filename: string,
    field: 'logoUrl' | 'faviconUrl' | 'logoUrlNoBg' | 'logoUrlWhiteBg',
    setUploading: (b: boolean) => void,
    setPct: (n: number) => void,
  ) {
    setUploading(true);
    setPct(0);
    try {
      const sm = await getStorageLazy();
      const storageRef = sm.ref(sm.storage, `branding/${filename}`);
      const uploadTask = sm.uploadBytesResumable(storageRef, file);
      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            setPct(pct);
          },
          (error) => reject(error),
          () => resolve(),
        );
      });
      const url = await sm.getDownloadURL(storageRef);
      setSettings((prev) => ({ ...prev, [field]: url }));
      // Friendly success label per field type
      const label =
        field === 'faviconUrl'
          ? 'Favicon'
          : field === 'logoUrlNoBg'
            ? 'Transparent logo'
            : field === 'logoUrlWhiteBg'
              ? 'White-bg logo'
              : /* logoUrl (legacy) */ 'Logo';
      toast.success(`${label} uploaded!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setPct(0);
    }
  }
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Validation and loading error state (must be after loading is declared)
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading)
        setLoadError(
          'Settings are taking too long to load. Please check your connection or try again.',
        );
    }, 10000);
    return () => clearTimeout(timeout);
  }, [loading]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getDoc(doc(db, 'settings', 'global'))
      .then((snap) => {
        if (cancelled) return;
        setLoadError(null);
        if (snap.exists()) {
          const raw = snap.data() as Partial<Settings>;
          // Run businessHours through the normaliser so a partial /
          // legacy doc (no businessHours field, or a hand-edited row
          // with bad HH:MM) loads cleanly into the editor with default
          // fallbacks instead of leaving the form half-populated.
          const merged: Settings = {
            ...DEFAULTS,
            ...raw,
            businessHours: normaliseBusinessHours(raw.businessHours),
          };
          setSettings(merged);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[AdminSettings] load failed:', err);
          setLoadError('Could not load settings. Please check your connection or permissions.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setSettings((prev) => ({ ...prev, [k]: v }));

  async function handleSave() {
    setSaving(true);
    try {
      // One-time legacy-text migration. Pre-fix the `migrateLegacyAnnouncementText`
      // helper existed in announcement.schema.ts but was never invoked, so
      // sites still using the old single-string `announcementText` field
      // never auto-upgraded to the structured `announcements` array even
      // though the Navbar's comment claimed they would. Now: on every
      // save, if `announcements` is empty AND `announcementText` has
      // content, convert the legacy text into structured rows before
      // writing. After the first save the legacy field is effectively
      // archived — `announcements` becomes the source of truth and the
      // Navbar's new-shape branch always wins.
      const next = { ...settings };
      if (
        (!Array.isArray(next.announcements) || next.announcements.length === 0) &&
        next.announcementText
      ) {
        const migrated = migrateLegacyAnnouncementText(next.announcementText);
        if (migrated && migrated.length > 0) {
          next.announcements = migrated;
        }
      }
      await setDoc(doc(db, 'settings', 'global'), {
        ...next,
        updatedAt: serverTimestamp(),
      });
      // Reflect the migration in the editor so admin sees their text
      // converted into rows they can now edit individually.
      if (next.announcements !== settings.announcements) {
        setSettings(next);
      }
      invalidateSettingsCache(); // force all pages to re-fetch fresh settings
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // ── Admin role management ──────────────────────────────────────────────
  const [roleEmail, setRoleEmail] = useState('');
  const [roleAction, setRoleAction] = useState<'promote' | 'demote'>('promote');
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleResult, setRoleResult] = useState<string | null>(null);

  // Email health check state — admin-facing diagnostic tool that pings
  // Resend with the configured API key and reports back. Lets you find
  // out exactly what's broken without scrolling Cloud Function logs.
  const [emailTestTo, setEmailTestTo] = useState<string>('');
  const [emailHealthLoading, setEmailHealthLoading] = useState(false);
  const [emailHealthReport, setEmailHealthReport] = useState<Record<string, unknown> | null>(null);

  // Inventory projection repair — one-shot callable that reads all
  // /inventory/{teaId} docs and writes the correct `available` +
  // `availabilityLabel` fields to every matching /teas/{teaId} doc.
  // Fixes the bug where teas show "Out of stock" on public pages even
  // though the admin inventory dashboard shows a non-zero level.
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairResult, setRepairResult] = useState<{
    repaired: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  async function handleRepairProjections() {
    setRepairLoading(true);
    setRepairResult(null);
    try {
      const { functions } = await getFunctionsLazy();
      const fn = httpsCallable<unknown, { repaired: number; skipped: number; errors: string[] }>(
        functions,
        'repairInventoryProjections',
      );
      const result = await fn({});
      setRepairResult(result.data);
      const { repaired, skipped, errors } = result.data;
      if (errors.length > 0) {
        toast.error(`Repair finished with ${errors.length} error(s). ${repaired} fixed.`);
      } else {
        toast.success(
          `Done — ${repaired} tea${repaired !== 1 ? 's' : ''} repaired, ${skipped} skipped.`,
        );
      }
    } catch (err) {
      const msg = (err as { message?: string })?.message || 'Repair failed';
      toast.error(msg);
    } finally {
      setRepairLoading(false);
    }
  }

  async function handleEmailHealth(sendTest: boolean) {
    setEmailHealthLoading(true);
    setEmailHealthReport(null);
    try {
      // Lazy-load functions at the call site rather than eagerly at
      // module top — keeps firebase-functions out of the customer's
      // critical path even though this admin route already chunks
      // separately. Cost is one async tick on the click handler,
      // which is invisible to the admin.
      const { functions } = await getFunctionsLazy();
      const fn = httpsCallable(functions, 'emailHealthCheck');
      const result = await fn(sendTest && emailTestTo.trim() ? { to: emailTestTo.trim() } : {});
      setEmailHealthReport(result.data as Record<string, unknown>);
      toast.success(sendTest ? 'Health check + test email sent.' : 'Health check complete.');
    } catch (err) {
      const msg = (err as { message?: string })?.message || 'Health check failed';
      setEmailHealthReport({ error: msg });
      toast.error(msg);
    } finally {
      setEmailHealthLoading(false);
    }
  }

  async function handleRoleChange() {
    if (!roleEmail.trim()) {
      toast.error('Enter an email address');
      return;
    }
    setRoleLoading(true);
    setRoleResult(null);
    try {
      const { functions } = await getFunctionsLazy();
      const fn = httpsCallable(functions, 'setAdminRole');
      await fn({ email: roleEmail.trim(), makeAdmin: roleAction === 'promote' });
      const msg =
        roleAction === 'promote'
          ? `✓ ${roleEmail} promoted to admin. They'll see the change within a few seconds.`
          : `✓ ${roleEmail} demoted to regular user. They'll see the change within a few seconds.`;
      setRoleResult(msg);
      toast.success(msg);
      setRoleEmail('');
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Failed';
      setRoleResult(`✗ ${msg}`);
      toast.error(msg);
    } finally {
      setRoleLoading(false);
    }
  }

  if (loading || loadError)
    return (
      <>
        <SeoHead
          title="Settings | Ele Café Admin"
          description="Store configuration — payments, shipping, credits and admin roles."
          noIndex={true}
        />
        <div className="as-loading">
          <RefreshCw size={28} className="icon-spin icon-muted as-loading-icon" />
          <span className="as-loading-msg">{loadError ? loadError : 'Loading settings…'}</span>
          {loadError && (
            <button
              className="btn btn-outline as-loading-retry"
              onClick={() => {
                setLoadError(null);
                setLoading(true);
                setRetryKey((k) => k + 1);
              }}
            >
              Retry
            </button>
          )}
        </div>
      </>
    );

  return (
    <div className="as-page">
      <SeoHead
        title="Settings | Ele Café Admin"
        description="Store configuration — payments, shipping, credits and admin roles."
        noIndex={true}
      />

      {/* Header */}
      <AdminPageHeader
        eyebrow="Store configuration"
        title="Settings"
        description="Branding, store details, shipping, rewards and notifications. Changes go live when you save."
        actions={
          <button onClick={handleSave} disabled={saving} className="btn btn-dark as-page-save-all">
            {saving ? (
              <>
                <RefreshCw size={14} className="icon-spin" /> Saving…
              </>
            ) : (
              <>
                <Save size={14} /> Save all
              </>
            )}
          </button>
        }
      />

      {/* ── Announcement ───────────────────────────────────── */}
      {/* ── Branding ────────────────────────────────────────────────────────── */}
      <Section title="Branding & Logo" icon={ImageIcon}>
        <p className="as-branding-intro">
          Upload two versions of your logo so it looks great in every context. Recommended size:{' '}
          <strong>240×60px</strong> (2× for retina: 480×120px).
        </p>
        <div className="as-branding-help">
          <strong className="as-branding-help-strong">How they're used:</strong> The transparent
          logo shows in the header during light mode. The white-background logo shows in the footer
          (which always has a dark background) and in the header during dark mode.
        </div>

        {/* Two-slot grid — single column on narrow screens */}
        <div className="as-branding-slots">
          {/* ── Slot 1: Transparent logo — header light mode ─────────── */}
          <div>
            <label className="field-label">Transparent logo</label>
            <p className="as-logo-hint">
              For the header in light mode. Use a <strong>transparent PNG</strong> or{' '}
              <strong>SVG</strong>.
            </p>
            <div className="as-logo-row">
              {/* Preview — cream surface to mimic light-mode header */}
              <div className="as-logo-preview" data-bg="surface">
                {settings.logoUrlNoBg || settings.logoUrl ? (
                  <img
                    src={settings.logoUrlNoBg || settings.logoUrl}
                    alt="Transparent logo preview"
                    className="as-logo-preview-img"
                  />
                ) : (
                  <span className="as-logo-empty">No logo yet</span>
                )}
              </div>
              <div className="as-logo-actions">
                <label
                  className="as-logo-upload-label"
                  data-uploading={noBgUploading ? 'true' : 'false'}
                >
                  <input
                    type="file"
                    accept="image/png,image/svg+xml,image/webp"
                    className="hidden"
                    disabled={noBgUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const allowedTypes = ['image/png', 'image/svg+xml', 'image/webp'];
                      if (!allowedTypes.includes(file.type)) {
                        toast.error('Only PNG, SVG, or WebP images are allowed.');
                        return;
                      }
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error('File size must be under 5MB.');
                        return;
                      }
                      await uploadBrandAsset(
                        file,
                        `logoNoBg_${Date.now()}.${file.name.split('.').pop()}`,
                        'logoUrlNoBg',
                        setNoBgUploading,
                        setNoBgUploadPct,
                      );
                    }}
                  />
                  <span
                    className="btn btn-outline btn-sm as-logo-upload-btn"
                    data-uploading={noBgUploading ? 'true' : 'false'}
                  >
                    {noBgUploading ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        {noBgUploadPct}%
                      </>
                    ) : (
                      <>
                        <Upload size={13} />
                        Upload
                      </>
                    )}
                  </span>
                </label>
                {settings.logoUrlNoBg && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm as-logo-remove"
                    onClick={() => {
                      setSettings((prev) => ({ ...prev, logoUrlNoBg: '' }));
                      setDoc(doc(db, 'settings', 'global'), { logoUrlNoBg: '' }, { merge: true });
                      invalidateSettingsCache();
                      toast.success('Transparent logo removed');
                    }}
                  >
                    Remove
                  </button>
                )}
                <p className="as-logo-spec">PNG, SVG, WebP · max 5 MB</p>
              </div>
            </div>
            {/* URL input fallback */}
            <div className="as-logo-url-block">
              <label className="as-logo-url-label" htmlFor="as-logo-url-no-bg">
                Or paste image URL
              </label>
              <input
                id="as-logo-url-no-bg"
                className="field as-logo-url-input"
                placeholder="https://..."
                value={settings.logoUrlNoBg}
                onChange={(e) => setSettings((prev) => ({ ...prev, logoUrlNoBg: e.target.value }))}
              />
            </div>
          </div>

          {/* ── Slot 2: White-bg logo — footer + header dark mode ────── */}
          <div>
            <label className="field-label">White-background logo</label>
            <p className="as-logo-hint">
              For the footer and the header in dark mode. The white halo keeps your brand readable
              on dark backgrounds.
            </p>
            <div className="as-logo-row">
              {/* Preview — midnight surface to mimic dark-mode header / footer */}
              <div className="as-logo-preview" data-bg="midnight">
                {settings.logoUrlWhiteBg || settings.footerLogoUrl ? (
                  <img
                    src={settings.logoUrlWhiteBg || settings.footerLogoUrl}
                    alt="White-background logo preview"
                    className="as-logo-preview-img"
                  />
                ) : (
                  <span className="as-logo-empty as-logo-empty-on-dark">No logo yet</span>
                )}
              </div>
              <div className="as-logo-actions">
                <label
                  className="as-logo-upload-label"
                  data-uploading={whiteBgUploading ? 'true' : 'false'}
                >
                  <input
                    type="file"
                    accept="image/png,image/svg+xml,image/webp"
                    className="hidden"
                    disabled={whiteBgUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const allowedTypes = ['image/png', 'image/svg+xml', 'image/webp'];
                      if (!allowedTypes.includes(file.type)) {
                        toast.error('Only PNG, SVG, or WebP images are allowed.');
                        return;
                      }
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error('File size must be under 5MB.');
                        return;
                      }
                      await uploadBrandAsset(
                        file,
                        `logoWhiteBg_${Date.now()}.${file.name.split('.').pop()}`,
                        'logoUrlWhiteBg',
                        setWhiteBgUploading,
                        setWhiteBgUploadPct,
                      );
                    }}
                  />
                  <span
                    className="btn btn-outline btn-sm as-logo-upload-btn"
                    data-uploading={whiteBgUploading ? 'true' : 'false'}
                  >
                    {whiteBgUploading ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        {whiteBgUploadPct}%
                      </>
                    ) : (
                      <>
                        <Upload size={13} />
                        Upload
                      </>
                    )}
                  </span>
                </label>
                {settings.logoUrlWhiteBg && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm as-logo-remove"
                    onClick={() => {
                      setSettings((prev) => ({ ...prev, logoUrlWhiteBg: '' }));
                      setDoc(
                        doc(db, 'settings', 'global'),
                        { logoUrlWhiteBg: '' },
                        { merge: true },
                      );
                      invalidateSettingsCache();
                      toast.success('White-background logo removed');
                    }}
                  >
                    Remove
                  </button>
                )}
                <p className="as-logo-spec">PNG, SVG, WebP · max 5 MB</p>
              </div>
            </div>
            <div className="as-logo-url-block">
              <label className="as-logo-url-label" htmlFor="as-logo-url-white-bg">
                Or paste image URL
              </label>
              <input
                id="as-logo-url-white-bg"
                className="field as-logo-url-input"
                placeholder="https://..."
                value={settings.logoUrlWhiteBg}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, logoUrlWhiteBg: e.target.value }))
                }
              />
            </div>
          </div>

          {/* Schema-fidelity round 2: emailLogoUrl + ogImageUrl. Both are
              consumed at runtime but had no admin UI surface — only
              direct Firestore Console edits could change them. Now
              editable through the form like the rest of the branding
              assets. Use plain paste-URL inputs (no upload affordance)
              because both are typically pointed at CDN-hosted assets
              outside this app's Firebase Storage bucket. */}
          <AdminSettingsField
            label="Email Logo URL"
            hint="Logo in the navy header of every email — use a WHITE or light logo with a transparent background. Leave empty to use the built-in white logo (/email-assets/logo-white.png). Must be a public https URL (mail clients can't open Firebase Storage links)."
          >
            <input
              className="field"
              value={settings.emailLogoUrl}
              onChange={(e) => setSettings((prev) => ({ ...prev, emailLogoUrl: e.target.value }))}
              placeholder="https://elecafe.ca/email-assets/logo-white.png"
            />
          </AdminSettingsField>

          <AdminSettingsField
            label="OG Image URL"
            hint="Default Open Graph card image used when a page on the site is shared (Facebook, LinkedIn, iMessage, Slack). Page-specific OG images override this. Recommended size 1200×630."
          >
            <input
              className="field"
              value={settings.ogImageUrl}
              onChange={(e) => setSettings((prev) => ({ ...prev, ogImageUrl: e.target.value }))}
              placeholder="https://elecafe.ca/og/default.png"
            />
          </AdminSettingsField>
        </div>
      </Section>

      {/* Footer Info Section */}
      <Section title="Footer Info" icon={ImageIcon}>
        <AdminSettingsField
          label="Footer Text"
          hint="Custom text shown in the footer (e.g. copyright, tagline)"
        >
          <input
            className="field"
            value={settings.footerText}
            onChange={(e) => setSettings((prev) => ({ ...prev, footerText: e.target.value }))}
            placeholder="e.g. © 2026 Ele Café. All rights reserved."
          />
        </AdminSettingsField>
        <AdminSettingsField
          label="Footer Text (French)"
          hint="Leave blank and it's translated automatically when you save"
        >
          <input
            className="field"
            value={settings.footerTextFr}
            onChange={(e) => setSettings((prev) => ({ ...prev, footerTextFr: e.target.value }))}
            placeholder="Auto-translated"
          />
        </AdminSettingsField>
        <AdminSettingsField
          label="Google Maps URL"
          hint="When set, the footer address becomes a clickable map link. Get the URL from Google Maps → tap your store → Share → Copy link."
        >
          <input
            className="field"
            value={settings.mapsUrl}
            onChange={(e) => setSettings((prev) => ({ ...prev, mapsUrl: e.target.value }))}
            placeholder="https://maps.app.goo.gl/..."
          />
        </AdminSettingsField>

        {/* ── Social links ─────────────────────────────────────────────────
            Each platform's icon shows in the footer only when a URL is
            saved here. Leave a field blank to hide its icon. */}
        <div className="as-social-block">
          <p className="as-social-eyebrow">Social links</p>
          <p className="as-social-intro">
            Paste the full URL to each profile. Empty fields = icon hidden in the footer.
          </p>

          <AdminSettingsField label="Instagram URL">
            <input
              className="field"
              value={settings.socialInstagram}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, socialInstagram: e.target.value }))
              }
              placeholder="https://www.instagram.com/elecafe_"
            />
          </AdminSettingsField>
          <AdminSettingsField label="WhatsApp click-to-chat">
            <input
              className="field"
              value={settings.socialWhatsapp ?? ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, socialWhatsapp: e.target.value }))}
              placeholder="https://wa.me/16045669998"
            />
            <p className="field-hint">
              Use the wa.me format with the phone number in international form (no +, no spaces, no
              dashes). Same number is fine for WhatsApp Business.
            </p>
          </AdminSettingsField>
          <AdminSettingsField label="TikTok URL">
            <input
              className="field"
              value={settings.socialTiktok}
              onChange={(e) => setSettings((prev) => ({ ...prev, socialTiktok: e.target.value }))}
              placeholder="https://www.tiktok.com/@elecafe"
            />
          </AdminSettingsField>
          <AdminSettingsField label="Facebook URL">
            <input
              className="field"
              value={settings.socialFacebook}
              onChange={(e) => setSettings((prev) => ({ ...prev, socialFacebook: e.target.value }))}
              placeholder="https://www.facebook.com/elecafe"
            />
          </AdminSettingsField>
          <AdminSettingsField label="X (Twitter) URL">
            <input
              className="field"
              value={settings.socialX}
              onChange={(e) => setSettings((prev) => ({ ...prev, socialX: e.target.value }))}
              placeholder="https://x.com/elecafe"
            />
          </AdminSettingsField>
          <AdminSettingsField label="Pinterest URL">
            <input
              className="field"
              value={settings.socialPinterest}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, socialPinterest: e.target.value }))
              }
              placeholder="https://www.pinterest.com/elecafe"
            />
          </AdminSettingsField>
        </div>
      </Section>

      <Section title="Announcement Strip" icon={Bell}>
        <Toggle
          label="Show announcement strip"
          hint="Master toggle — when off, no announcements show regardless of individual settings"
          value={settings.announcementEnabled}
          onChange={(v) => set('announcementEnabled', v)}
        />

        {/* ── Per-announcement editor ──────────────────────────────────────
            Each announcement is a row with: enabled toggle, message,
            optional luxury "highlight chip" (promo code / price / date),
            optional date range for scheduled campaigns. Empty list →
            falls back to the legacy text field below. */}
        <div className="as-ann-block">
          <p className="as-ann-eyebrow">Announcements</p>

          {(settings.announcements ?? []).length === 0 && (
            <p className="as-ann-empty">
              No announcements yet. Add one to start using the rotating strip with highlight chips.
              Until you add at least one, the legacy text field below is rendered (if filled).
            </p>
          )}

          <div className="as-ann-list">
            {(settings.announcements ?? []).map((a, idx) => (
              <div key={a.id} className="as-ann-card">
                <div className="as-ann-row">
                  <label className="as-ann-toggle">
                    <input
                      type="checkbox"
                      checked={a.enabled}
                      onChange={(e) => {
                        const next = [...(settings.announcements ?? [])];
                        next[idx] = { ...a, enabled: e.target.checked };
                        set('announcements', next);
                      }}
                    />
                    <span className="as-ann-toggle-text" data-on={a.enabled ? 'true' : 'false'}>
                      {a.enabled ? 'Active' : 'Hidden'}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = (settings.announcements ?? []).filter((_, i) => i !== idx);
                      set('announcements', next);
                    }}
                    className="as-ann-remove"
                    aria-label="Remove announcement"
                  >
                    Remove
                  </button>
                </div>

                <AdminSettingsField label="Highlight chip (optional)">
                  <input
                    className="field"
                    value={a.highlight ?? ''}
                    maxLength={24}
                    placeholder="e.g. SAVE15 · $2.99 · JUL 1 · HAPPY HOUR"
                    onChange={(e) => {
                      const next = [...(settings.announcements ?? [])];
                      next[idx] = { ...a, highlight: e.target.value };
                      set('announcements', next);
                    }}
                  />
                  <p className="as-ann-hint">
                    Short, eye-catching anchor — promo code, price, or date. Renders as a luxury
                    gold chip on the left of the message. Leave blank for plain text.
                  </p>
                </AdminSettingsField>

                <AdminSettingsField label="Message">
                  <input
                    className="field"
                    value={a.message}
                    maxLength={140}
                    placeholder="e.g. Use code SAVE15 for 15% off your next order"
                    onChange={(e) => {
                      const next = [...(settings.announcements ?? [])];
                      next[idx] = { ...a, message: e.target.value };
                      set('announcements', next);
                    }}
                  />
                </AdminSettingsField>

                <div className="as-ann-dates">
                  <AdminSettingsField label="Highlight chip — French (optional)">
                    <input
                      className="field"
                      value={a.highlightFr ?? ''}
                      maxLength={24}
                      placeholder="p. ex. SEULEMENT 2,99 $"
                      onChange={(e) => {
                        const next = [...(settings.announcements ?? [])];
                        next[idx] = { ...a, highlightFr: e.target.value };
                        set('announcements', next);
                      }}
                    />
                  </AdminSettingsField>
                  <AdminSettingsField
                    label="Message — French (optional)"
                    hint="Shown when a visitor switches the site to French. Leave blank and it's translated automatically when you save."
                  >
                    <input
                      className="field"
                      value={a.messageFr ?? ''}
                      maxLength={140}
                      placeholder="p. ex. Utilisez le code SAVE15 pour 15 % de rabais"
                      onChange={(e) => {
                        const next = [...(settings.announcements ?? [])];
                        next[idx] = { ...a, messageFr: e.target.value };
                        set('announcements', next);
                      }}
                    />
                  </AdminSettingsField>
                </div>

                <div className="as-ann-dates">
                  <AdminSettingsField label="Start date (optional)">
                    <input
                      type="date"
                      className="field"
                      value={a.startDate ?? ''}
                      onChange={(e) => {
                        const next = [...(settings.announcements ?? [])];
                        next[idx] = { ...a, startDate: e.target.value };
                        set('announcements', next);
                      }}
                    />
                  </AdminSettingsField>
                  <AdminSettingsField label="End date (optional)">
                    <input
                      type="date"
                      className="field"
                      value={a.endDate ?? ''}
                      onChange={(e) => {
                        const next = [...(settings.announcements ?? [])];
                        next[idx] = { ...a, endDate: e.target.value };
                        set('announcements', next);
                      }}
                    />
                  </AdminSettingsField>
                </div>
                <p className="as-ann-dates-note">
                  Leave blank for evergreen. Set both for time-boxed campaigns (e.g. Canada Day Jun
                  28 → Jul 2). The strip auto-shows/hides based on today's date.
                </p>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              const newAnnouncement = createEmptyAnnouncement();
              set('announcements', [...(settings.announcements ?? []), newAnnouncement]);
            }}
            className="as-ann-add"
          >
            + Add announcement
          </button>
        </div>

        {/* Legacy text field — still editable. Used as a fallback when
            the announcements array is empty. Once the admin adds an
            entry above, this field is ignored. */}
        <div className="as-ann-legacy">
          <AdminSettingsField label="Legacy single-line text (used only when no announcements above)">
            <input
              className="field"
              value={settings.announcementText}
              onChange={(e) => set('announcementText', e.target.value)}
              placeholder="e.g. Free shipping on all orders · Free sample with every order"
            />
          </AdminSettingsField>
        </div>
      </Section>

      {/* Day 16 v9: gift-builder feature flag. When off, the two
          CTAs on /gifts ("Build Your Tea Bundle" + "Start Building")
          are visible but disabled for non-admin users, and the
          wizard modal won't open. Admins can always preview the
          wizard, so QA can be done before flipping it on. */}
      <Section title="Gift Builder" icon={Gift}>
        <Toggle
          label="Enable Build-Your-Bundle for customers"
          hint="When off, the two CTA buttons on /gifts are disabled for non-admin visitors. Admins can still preview the wizard."
          value={settings.giftBuilderEnabled}
          onChange={(v) => set('giftBuilderEnabled', v)}
        />
      </Section>

      {/* ── Combo Gallery ─────────────────────────────────────────────────
          Global "Pairs with our tea" carousel rendered on every tea
          profile page (between "Enjoy at Ele Café" and "Reviews") when
          the toggle is on. Items are managed from the panel below — one
          shared pool, no per-tea configuration. Storage path
          /comboGallery/, Firestore /comboGalleryItems. */}
      <Section title="Tea Categories" icon={Layers} defaultOpen={false}>
        <p className="as-toggle-hint">
          Names shown in the menu, filters and page titles. Leave French blank and it's translated
          automatically.
        </p>
        <CategoryNamesAdmin />
      </Section>

      <Section title="Combo Gallery" icon={Layers}>
        <Toggle
          label="Enable combo gallery on tea profile pages"
          hint="When off, the carousel is hidden on every tea profile page regardless of how many items exist."
          value={settings.comboGalleryEnabled}
          onChange={(v) => set('comboGalleryEnabled', v)}
        />
        <div className="as-spacer-20" />
        <ComboGalleryAdmin />
      </Section>

      {/* ── Notifications diagnostic ────────────────────────────────────
          Lets admins create a test notification doc to verify the bell
          UI and onSnapshot pipeline are working end-to-end. Useful
          before deploying Cloud Functions, or when debugging why the
          bell appears empty. Writes /notifications/<auto> with
          recipientId: 'admin'. Firestore rules permit only this
          self-targeted shape. */}
      <Section title="Notifications" icon={Bell}>
        <NotificationDiagnostic />
      </Section>

      {/* ── Store Info ─────────────────────────────────────── */}
      <Section title="Store Information" icon={Store}>
        <div className="as-grid-2">
          <AdminSettingsField label="Store name">
            <input
              className="field"
              value={settings.storeName}
              onChange={(e) => set('storeName', e.target.value)}
            />
          </AdminSettingsField>
          <AdminSettingsField label="Store email">
            <input
              className="field"
              type="email"
              autoComplete="off"
              value={settings.storeEmail}
              onChange={(e) => set('storeEmail', e.target.value)}
            />
          </AdminSettingsField>
          <AdminSettingsField label="Phone" hint="Shown on the website and sent to Google.">
            <input
              className="field"
              type="tel"
              autoComplete="off"
              value={settings.storePhone}
              onChange={(e) => set('storePhone', e.target.value)}
              placeholder="+1 604 555 0100"
            />
          </AdminSettingsField>
          <AdminSettingsField label="Website">
            <input
              className="field"
              value={settings.storeWebsite}
              onChange={(e) => set('storeWebsite', e.target.value)}
            />
          </AdminSettingsField>
        </div>
        <AdminSettingsField
          label="Address"
          hint="Street, city, province and postal code — e.g. 895 West Broadway, Vancouver, BC V5Z 1J9. Shown in the footer, contact card, policy pages, FAQ and emails, and sent to Google as your business address."
        >
          <input
            className="field"
            value={settings.storeAddress}
            onChange={(e) => set('storeAddress', e.target.value)}
            placeholder="895 West Broadway, Vancouver, BC V5Z 1J9"
          />
        </AdminSettingsField>
      </Section>

      {/* ── Business Hours ──────────────────────────────────────────────
          Per-day editor. Saves into /settings/global → businessHours
          which the customer-facing ContactCard reads via useSettings.
          Display layer collapses contiguous identical days into ranges
          (see lib/businessHours.ts → formatBusinessHours). */}
      <Section title="Business Hours" icon={Clock}>
        <BusinessHoursEditor
          hours={settings.businessHours}
          onChange={(next) => set('businessHours', next)}
        />
      </Section>

      {/* ── Online payments ───────────────────────────────── */}
      <Section title="Online Payments" icon={CreditCard}>
        <div className="as-info-banner">
          Customers pay by card through Clover. At checkout the order total is <strong>held</strong>{' '}
          on their card — they are only <strong>charged when you approve</strong> the order in
          Orders (after confirming the teas are in stock). Rejecting, cancelling, or letting an
          order expire releases the hold; cancelling a paid order refunds it.
        </div>
        <PaymentStatus />
        <div className="as-grid-2">
          <AdminSettingsField
            label="Admin notification email"
            hint="Gets an email for every new order to approve (the card hold lapses if it isn't approved in time) and if an automatic refund fails."
          >
            <input
              className="field"
              type="email"
              autoComplete="off"
              value={settings.adminEmail}
              onChange={(e) => set('adminEmail', e.target.value)}
            />
          </AdminSettingsField>
        </div>
      </Section>

      {/* ── Order Rules ────────────────────────────────────── */}
      <Section title="Order Rules" icon={Package}>
        <div className="as-grid-2">
          <AdminSettingsField
            label="Approve orders within (hours)"
            hint="Orders not approved in this time are cancelled automatically and the customer's card hold is released. Max 120 — card holds lapse after about 7 days."
          >
            <input
              className="field"
              type="number"
              min="1"
              max="120"
              value={settings.orderExpiryHours}
              onChange={(e) =>
                set('orderExpiryHours', Math.min(120, parseInt(e.target.value) || 72))
              }
            />
          </AdminSettingsField>
          <AdminSettingsField
            label="Free delivery threshold ($)"
            hint="Orders at or above this amount get free delivery. Set to 0 to make all delivery free. Doesn't affect pickup orders (always free)."
          >
            <input
              className="field"
              type="number"
              min="0"
              step="5"
              value={settings.freeShippingThreshold}
              onChange={(e) => set('freeShippingThreshold', parseFloat(e.target.value) || 0)}
            />
          </AdminSettingsField>
          <AdminSettingsField
            label="Delivery fee ($)"
            hint="Flat-rate shown at checkout when customer selects Delivery, on orders below the free-delivery threshold. Pickup is always free regardless of this setting."
          >
            <input
              className="field"
              type="number"
              min="0"
              step="0.01"
              value={settings.defaultShippingFee}
              onChange={(e) => set('defaultShippingFee', parseFloat(e.target.value) || 0)}
            />
          </AdminSettingsField>
        </div>
        <Toggle
          label="Free tea sample with every order"
          hint="Shown beside Add to Cart on every tea page, in the cart, the footer and the homepage. Turn off if you stop including samples."
          value={settings.freeSampleWithOrders !== false}
          onChange={(v) => set('freeSampleWithOrders', v)}
        />
        {/* Preview — live calculation of what customer sees at checkout
            for pickup vs delivery, given the current settings. Updates
            in real-time as admin changes the values above. */}
        <div className="as-preview-card as-preview-card-mt">
          <p className="as-preview-eyebrow">Customer-facing preview</p>
          <p className="as-preview-body">
            <strong className="as-preview-strong">Pickup</strong> → always{' '}
            <strong className="as-preview-success">Free</strong>.<br />
            <strong className="as-preview-strong">
              Delivery under ${settings.freeShippingThreshold}
            </strong>{' '}
            → customer pays{' '}
            <strong className="as-preview-gold">
              ${settings.defaultShippingFee.toFixed(2)} flat
            </strong>
            .<br />
            <strong className="as-preview-strong">
              Delivery ${settings.freeShippingThreshold}+
            </strong>{' '}
            →<strong className="as-preview-success"> Free</strong>.
            {settings.freeShippingThreshold === 0 && (
              <>
                {' '}
                &nbsp;<em>(threshold = 0 means all delivery free)</em>
              </>
            )}
          </p>
        </div>
      </Section>

      {/* ── Credits ────────────────────────────────────────── */}
      <Section title="Credit System" icon={Coins}>
        <div className="as-grid-2">
          <AdminSettingsField
            label="Points earned per $1 spent"
            hint="e.g. 100 means $1 = 100 pts. Set to 0 to disable point-earning entirely."
          >
            {/* R3 file2 Bug #11: previously `parseInt(e.target.value)||100`
                forced any explicit 0 to default to 100, so admin had no
                way to disable point-earning short of editing Firestore
                directly. Now we use a parser that distinguishes "valid
                non-negative number including 0" from "NaN/empty" — only
                NaN falls back to the default. Same pattern below for
                minRedemptionPts and creditValuePer1000. */}
            <input
              className="field"
              type="number"
              min="0"
              value={settings.pointsPerDollar}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                set('pointsPerDollar', Number.isFinite(v) && v >= 0 ? v : 100);
              }}
            />
          </AdminSettingsField>
          <AdminSettingsField
            label="Minimum redemption (pts)"
            hint="Minimum points needed to redeem. Set to 0 to allow any redemption amount."
          >
            <input
              className="field"
              type="number"
              min="0"
              step="100"
              value={settings.minRedemptionPts}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                set('minRedemptionPts', Number.isFinite(v) && v >= 0 ? v : 10000);
              }}
            />
          </AdminSettingsField>
          <AdminSettingsField
            label="Credit value per 1000 pts ($)"
            hint="e.g. 1 means 1000 pts = $1 off. Set to 0 to disable redemption."
          >
            {/* R3 file2 Bug #13: step=0.01 (was 0.1). Non-clean rates
                like 0.3 caused subtle frontend/backend rounding
                mismatches in earlier rounds; the formulas are now
                aligned (R3 file1 #4) so any decimal rate works, but
                the cent step still gives admin sensible increments. */}
            <input
              className="field"
              type="number"
              min="0"
              step="0.01"
              value={settings.creditValuePer1000}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                set('creditValuePer1000', Number.isFinite(v) && v >= 0 ? v : 1);
              }}
            />
          </AdminSettingsField>
          <AdminSettingsField
            label="Welcome bonus (pts)"
            hint="Points granted to new customers on signup. Cloud function reads this value when creating each new user's credit account. Set to 0 to disable the welcome bonus."
          >
            <input
              className="field"
              type="number"
              min="0"
              step="100"
              value={settings.welcomeBonusPoints ?? 500}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                set('welcomeBonusPoints', Number.isFinite(v) && v >= 0 ? v : 0);
              }}
            />
          </AdminSettingsField>
        </div>
        {/* Preview */}
        <div className="as-preview-card">
          <p className="as-preview-eyebrow">Preview</p>
          <p className="as-preview-body">
            <strong className="as-preview-strong">New customer signs up</strong> → receives{' '}
            <strong className="as-preview-gold">
              {(settings.welcomeBonusPoints ?? 500).toLocaleString()} pts
            </strong>
            &nbsp;(≈{' '}
            <strong className="as-preview-success">
              $
              {(
                ((settings.welcomeBonusPoints ?? 500) / 1000) *
                settings.creditValuePer1000
              ).toFixed(2)}
            </strong>{' '}
            off their first order).
            <br />
            Customer spends <strong className="as-preview-strong">$50</strong> → earns{' '}
            <strong className="as-preview-gold">
              {(50 * settings.pointsPerDollar).toLocaleString()} pts
            </strong>
            . &nbsp;At {settings.minRedemptionPts.toLocaleString()} pts minimum, that's worth{' '}
            <strong className="as-preview-success">
              ${((settings.minRedemptionPts / 1000) * settings.creditValuePer1000).toFixed(2)} off
            </strong>{' '}
            on a future order.
          </p>
        </div>
      </Section>

      {/* ── Notifications ──────────────────────────────────── */}
      <Section title="Notifications & Alerts" icon={Bell} defaultOpen={false}>
        <div className="as-notif-stack">
          <Toggle
            label="Order & payment emails"
            hint="Order received (card on hold), confirmed & charged, cancelled, rejected, expired and refund emails. Turn off only to pause all order emails."
            value={settings.sendOrderEmails}
            onChange={(v) => set('sendOrderEmails', v)}
          />
          <Toggle
            label="Fulfilment emails"
            hint="Ready-for-pickup, shipped (with tracking) and delivered emails."
            value={settings.sendShippingEmails}
            onChange={(v) => set('sendShippingEmails', v)}
          />
        </div>
      </Section>

      {/* ── Security info ──────────────────────────────────── */}
      <Section title="Security" icon={ShieldCheck} defaultOpen={false}>
        <div className="as-sec-card">
          <div className="as-sec-list">
            {[
              ['Firebase Auth', 'Managed via Firebase Console — cannot be changed here'],
              [
                'Admin role',
                'Set via Firebase custom claims — use Firebase Console to promote users',
              ],
              ['Firestore rules', 'Deployed via CLI — see firestore.rules in project root'],
              [
                'Card data',
                "Entered in Clover's secure fields — card numbers never reach our site or database",
              ],
              [
                'Card charges',
                'Only the server charges a card, and only when an admin approves; rejecting or expiring releases the hold',
              ],
              [
                'Private payment key',
                'Stored as a Firebase secret (CLOVER_PRIVATE_TOKEN) — never in code or settings',
              ],
            ].map(([label, desc]) => (
              <div key={label} className="as-sec-row">
                <CheckCircle2 size={14} className="as-sec-icon" />
                <div>
                  <p className="as-sec-label">{label}</p>
                  <p className="as-sec-desc">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Admin Role Management ──────────────────────────────────────── */}
      <Section title="Admin Role Management" icon={ShieldCheck} defaultOpen={false}>
        <div className="as-warn-banner">
          <strong>⚠ Use with care.</strong> Promoting a user gives them full access to all admin
          pages and customer data, and lets them approve orders — which{' '}
          <strong>charges customers' cards</strong> — and issue refunds by cancelling. The change
          takes effect after the user signs out and back in.
        </div>
        <div className="as-role-actions">
          {(['promote', 'demote'] as const).map((action) => (
            <button
              key={action}
              onClick={() => setRoleAction(action)}
              className="as-role-btn"
              data-active={roleAction === action ? 'true' : 'false'}
            >
              {action === 'promote' ? '⬆ Promote to Admin' : '⬇ Demote to User'}
            </button>
          ))}
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="as-role-email">
            User email
          </label>
          <div className="as-role-row">
            <input
              id="as-role-email"
              className="field as-role-input"
              type="email"
              autoComplete="off"
              value={roleEmail}
              onChange={(e) => setRoleEmail(e.target.value)}
              placeholder="user@example.com"
            />
            <button
              onClick={handleRoleChange}
              disabled={roleLoading || !roleEmail}
              className="btn btn-dark as-role-submit"
            >
              {roleLoading ? 'Saving…' : roleAction === 'promote' ? 'Promote' : 'Demote'}
            </button>
          </div>
          {roleResult && (
            <p className="as-role-result" data-status={roleResult.startsWith('✓') ? 'ok' : 'err'}>
              {roleResult}
            </p>
          )}
        </div>
      </Section>

      {/* ── Email system health check ─────────────────────────────────────
          Admin-only diagnostic tool that pings Resend with the configured
          API key and reports back. Use this when emails appear to have
          stopped sending — it tells you in one click whether the issue is
          API key, domain verification, or downstream. */}
      <Section title="Email Health Check" icon={Mail}>
        <p className="as-email-intro">
          Verify that the Resend API key is configured and working. Optionally send a real test
          email to confirm end-to-end delivery.
        </p>
        <div className="as-email-card">
          <div className="as-email-row">
            <input
              type="email"
              autoComplete="off"
              value={emailTestTo}
              onChange={(e) => setEmailTestTo(e.target.value)}
              placeholder="optional: send test email to..."
              aria-label="Send test email to address (optional)"
              className="input as-email-input"
            />
            <button
              onClick={() => handleEmailHealth(false)}
              disabled={emailHealthLoading}
              className="btn btn-outline as-email-btn"
            >
              {emailHealthLoading ? 'Checking…' : 'Check config'}
            </button>
            <button
              onClick={() => handleEmailHealth(true)}
              disabled={emailHealthLoading || !emailTestTo.trim()}
              className="btn btn-dark as-email-btn"
            >
              {emailHealthLoading ? 'Sending…' : 'Send test email'}
            </button>
          </div>
          {emailHealthReport && (
            <pre className="as-email-report">{JSON.stringify(emailHealthReport, null, 2)}</pre>
          )}
          <p className="as-email-note">
            <strong>Note:</strong> this tests <em>order</em> emails (Resend). Verification emails go
            through Firebase Auth's separate SMTP system. See EMAIL_SYSTEM.md in the codebase root
            for the full diagnostic guide.
          </p>
        </div>
      </Section>

      {/* ── Inventory projection repair ──────────────────────────────────────
          One-shot tool that reads every /inventory/{teaId} doc and writes
          the correct `available` + `availabilityLabel` fields onto the
          matching /teas/{teaId} doc. Fixes the symptom: "Assam shows 10/10
          in the admin inventory but Out of stock on public pages."
          Root cause: the original onInventoryWrite guard skipped projection
          when the status category didn't change (e.g. level 10→8, both
          in_stock). Stale `available: false` fields on tea docs were never
          repaired. This button fixes all affected teas in one click. */}
      <Section title="Inventory Sync Repair" icon={Wrench}>
        <p className="as-email-intro">
          Repairs tea docs whose public availability fields are out of sync with the inventory
          dashboard. Run this if any tea shows "Out of stock" on the storefront despite having a
          non-zero inventory level.
        </p>
        <div className="as-email-card">
          <div className="as-email-row">
            <button
              onClick={handleRepairProjections}
              disabled={repairLoading}
              className="btn btn-dark as-email-btn"
            >
              {repairLoading ? (
                <>
                  <Loader2 size={14} className="icon-spin" /> Repairing…
                </>
              ) : (
                <>
                  <Wrench size={14} /> Repair all tea availability
                </>
              )}
            </button>
          </div>
          {repairResult && (
            <pre className="as-email-report">
              {`✓ ${repairResult.repaired} tea${repairResult.repaired !== 1 ? 's' : ''} repaired\n` +
                `⟳ ${repairResult.skipped} skipped (orphan inventory — tea doc missing)\n` +
                (repairResult.errors.length > 0
                  ? `✗ ${repairResult.errors.length} error(s):\n${repairResult.errors.map((e) => `  ${e}`).join('\n')}`
                  : '  No errors')}
            </pre>
          )}
          <p className="as-email-note">
            Safe to run multiple times — idempotent. Only writes when the stored value differs from
            what the inventory level says it should be.
          </p>
        </div>
      </Section>

      {/* Sticky save bar at bottom */}
      <div className="as-savebar">
        <p className="as-savebar-msg">Changes go live on the website when you save.</p>
        <button onClick={handleSave} disabled={saving} className="btn btn-dark as-savebar-btn">
          {saving ? (
            <>
              <RefreshCw size={14} className="icon-spin" /> Saving…
            </>
          ) : (
            <>
              <Save size={14} /> Save Settings
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default AdminSettings;
