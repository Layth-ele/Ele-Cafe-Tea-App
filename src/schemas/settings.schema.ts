/**
 * settings.schema.ts — schema for the `/settings/global` Firestore doc.
 *
 * Pre-audit, the settings doc shape was implicit — defined by inference
 * from two SEPARATE object literals (`AdminSettings.DEFAULTS` and
 * `useSettings.SETTING_DEFAULTS`) that drifted apart over time. The
 * Cloud Function read fields neither client had typed (storeName,
 * emailLogoUrl); admin could write fields useSettings's TypeScript
 * type didn't know about; AdminSettings exposed toggles the runtime
 * never read.
 *
 * This schema is the canonical shape. The two literal objects still
 * exist (they carry the actual default values, which is data, not
 * type-system concern), but their KEY SETS must match this schema.
 *
 * Cross-reference for writers / readers:
 *
 *   Writer:  AdminSettings.handleSave → setDoc('/settings/global', ...)
 *   Reader:  useSettings.fetchSettings (client; powers Navbar, Footer,
 *            ContactCard, CheckoutPage shipping math, etc.)
 *   Reader:  functions/src/index.ts → getStoreSettings (CF; powers
 *            order email branding).
 *
 * The Cloud Function has its own typed read in `getStoreSettings()` for
 * the subset it actually consumes; that helper's field list MUST stay
 * a subset of the schema below.
 */
import { z } from 'zod';
import { announcementSchema } from './announcement.schema';

// Business hours row mirrors `lib/businessHours.ts BusinessHoursDay`.
// Kept loose-shaped so future fields (e.g. holiday overrides) don't
// require a schema bump.
const businessHoursDaySchema = z
  .object({
    day: z.string(),
    closed: z.boolean(),
    open: z.string().optional(),
    close: z.string().optional(),
  })
  .passthrough();

export const settingsSchema = z
  .object({
    // ── Contact ──────────────────────────────────────────────────────────
    adminEmail: z.string().email().or(z.literal('')),

    // ── Store identity ───────────────────────────────────────────────────
    // Read by the Cloud Function's getStoreSettings → branded email
    // header and order-confirmation footer line.
    storeName: z.string(),
    storeEmail: z.string().email().or(z.literal('')),
    storeAddress: z.string(),
    storePhone: z.string(),
    storeWebsite: z.string().url().or(z.literal('')),

    // ── Order / shipping rules ───────────────────────────────────────────
    // (GST is a fixed 5% on taxable items — see cartStore GST_RATE and
    //  functions/src/lib/orderPricing.ts — so there is no rate setting.)
    // Unapproved orders auto-cancel (card hold released) after this many
    // hours; capped at 120 server-side because holds lapse after ~7 days.
    orderExpiryHours: z.number().int().positive().max(120),
    freeShippingThreshold: z.number().nonnegative(),
    freeSampleWithOrders: z.boolean().optional(),
    defaultShippingFee: z.number().nonnegative(),

    // ── Credits / loyalty ────────────────────────────────────────────────
    pointsPerDollar: z.number().nonnegative(),
    minRedemptionPts: z.number().int().nonnegative(),
    creditValuePer1000: z.number().nonnegative(),
    welcomeBonusPoints: z.number().int().nonnegative(),

    // ── Email controls ───────────────────────────────────────────────────
    // sendOrderEmails: global kill switch for transactional order emails.
    //   Wired in functions/src/index.ts → sendEmail. When false, every
    //   sendEmail call with category==='orderUpdates' is suppressed
    //   regardless of per-user preferences.
    // sendShippingEmails: switch for the ready-for-pickup / shipped /
    //   delivered emails — wired in functions/src/index.ts → onOrderEmail.
    // (Stock status comes from inventory levels — see deriveStatus — so
    //  there is no low-stock threshold setting.)
    sendOrderEmails: z.boolean(),
    sendShippingEmails: z.boolean(),

    // ── Announcements ────────────────────────────────────────────────────
    // announcementText is legacy single-string format; announcements is
    // the structured array. AdminSettings auto-migrates legacy → array on
    // first save (via announcement.schema.ts → migrateLegacyAnnouncementText).
    announcementText: z.string(),
    announcementEnabled: z.boolean(),
    announcements: z.array(announcementSchema).default([]),

    // ── Feature flags ────────────────────────────────────────────────────
    giftBuilderEnabled: z.boolean(),
    comboGalleryEnabled: z.boolean(),

    // ── Social links ─────────────────────────────────────────────────────
    // Empty string = icon hidden in Footer. URL set = icon shown.
    socialInstagram: z.string(),
    socialWhatsapp: z.string(),
    socialFacebook: z.string(),
    socialX: z.string(),
    socialPinterest: z.string(),
    /** Other profile / directory links, one per line (Google Business, Yelp…). */
    socialProfiles: z.string().optional(),
    socialTiktok: z.string(),

    // ── Footer / location ───────────────────────────────────────────────
    mapsUrl: z.string(),
    footerText: z.string(),
    footerTextFr: z.string().optional(),

    // ── Business hours ──────────────────────────────────────────────────
    businessHours: z.array(businessHoursDaySchema),

    // ── Branding assets ─────────────────────────────────────────────────
    // Two-logo split for nav (transparent / white-bg). Legacy `logoUrl`
    // and `footerLogoUrl` kept for backward compat with deployments that
    // haven't re-saved settings since the split was introduced.
    logoUrlNoBg: z.string(),
    logoUrlWhiteBg: z.string(),
    logoUrl: z.string(),
    faviconUrl: z.string(),
    emailLogoUrl: z.string(), // CF reads this for branded emails
    ogImageUrl: z.string(), // Default OG card for share previews
    footerLogoUrl: z.string(),
  })
  // settings doc may grow new fields ahead of the schema — passthrough
  // tolerates them at the parser level so old clients reading a fresh
  // doc don't strip silently.
  .passthrough();

export type Settings = z.infer<typeof settingsSchema>;

export const validateSettings = (data: unknown) => settingsSchema.safeParse(data);
