import { z } from 'zod';
import { addressSchema } from './address.schema';

/**
 * User Role Schema
 */
export const userRoleSchema = z.enum(['user', 'admin']);

export type UserRole = z.infer<typeof userRoleSchema>;

/**
 * User Profile Schema
 *
 * Mirrors the `/users/{uid}` Firestore doc as written by:
 *   - AuthContext.ensureUserDoc (client, on signup + login)
 *   - setRole Cloud Function (admin role flips)
 *   - useSessionTracker (active-time fields)
 *
 * Schema-fidelity notes:
 *
 *  - `role` is the ONE admin-status field. Pre-fix this schema also had
 *    an `isAdmin: boolean` field, but no code ever wrote it — the
 *    actual security boundary is the JWT custom claim, and the
 *    persisted echo is `role` (read by AdminCustomers, useful for
 *    audits). The phantom `isAdmin` field was removed to stop type
 *    inference from suggesting it.
 *
 *  - `preferences` is NOT stored here. Pre-fix this schema declared a
 *    nested object `{ language, theme, notifications: boolean }` —
 *    that shape was never written. The real notification preferences
 *    live at `/users/{uid}/preferences/notifications` (subcollection)
 *    with a different shape — see userPreferences.schema.ts and
 *    NotificationPreferencesSection. Language + theme are client-side
 *    Zustand state (useLanguageStore, useThemeStore), not server-
 *    persisted. The phantom `preferences` block was removed.
 */
export const userProfileSchema = z.object({
  uid: z.string().min(1),
  email: z.string().email('Invalid email address'),
  displayName: z.string().max(100).optional(),
  phone: z.string().min(10).max(20).optional(),
  photoURL: z.string().url().optional(),
  addresses: z.array(addressSchema).optional(),
  role: userRoleSchema.optional().default('user'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),

  // Session tracking — populated by useSessionTracker hook.
  // Active browsing time (tab visible AND user interacted within 60s),
  // not wall-clock-since-login. Used by AdminCustomers to surface
  // engagement metrics for analytics.
  totalActiveMs:      z.number().min(0).optional(),  // cumulative across all sessions
  lastSessionMs:      z.number().min(0).optional(),  // most recent session length
  lastSessionEndedAt: z.date().optional(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

/**
 * Create User Profile Schema
 */
export const createUserProfileSchema = userProfileSchema.omit({
  uid: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateUserProfileInput = z.infer<typeof createUserProfileSchema>;

/**
 * Update User Profile Schema
 *
 * Omits `role` so customers calling the user profile update path cannot
 * elevate themselves — role flips ONLY come from the admin-side setRole
 * Cloud Function (which sets the JWT claim AND writes /users.role
 * transactionally). Pre-fix this also omitted the now-removed `isAdmin`
 * field.
 */
export const updateUserProfileSchema = userProfileSchema
  .partial()
  .required({ uid: true })
  .omit({ role: true });

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;

/**
 * Auth Credentials Schema - For login/signup
 */
export const authCredentialsSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type AuthCredentials = z.infer<typeof authCredentialsSchema>;

/**
 * Signup Input Schema
 */
export const signupSchema = authCredentialsSchema.extend({
  displayName: z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string().min(10).max(20).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;

/**
 * Signup Form Schema — extends signupSchema with the confirm-password
 * field + cross-field check. Used by <SignupPage> via RHF + zodResolver.
 * The base signupSchema is what the BACKEND validates against (no
 * confirm field there); this form-only schema adds the UI concern.
 *
 * The strength rules — uppercase, number — live here too because they
 * are enforced as form errors at the field level (per Phase 6.2,
 * validation errors are inline, not toasts). The base schema has the
 * length rule because that's the contract every consumer depends on.
 */
export const signupFormSchema = signupSchema
  .extend({
    confirm: z.string().min(1, 'Please confirm your password'),
  })
  .refine(
    (data) => /[A-Z]/.test(data.password),
    { message: 'Password must contain at least one uppercase letter', path: ['password'] },
  )
  .refine(
    (data) => /[0-9]/.test(data.password),
    { message: 'Password must contain at least one number', path: ['password'] },
  )
  .refine(
    (data) => data.password === data.confirm,
    { message: 'Passwords do not match', path: ['confirm'] },
  );

export type SignupFormInput = z.infer<typeof signupFormSchema>;

/**
 * Helper functions
 */
export const validateUserProfile = (data: unknown) => {
  return userProfileSchema.safeParse(data);
};

export const validateAuthCredentials = (data: unknown) => {
  return authCredentialsSchema.safeParse(data);
};

export const validateSignup = (data: unknown) => {
  return signupSchema.safeParse(data);
};
