/**
 * auth.schema.ts — Phase 6 form schemas for authentication
 *
 * Single source of truth for sign-in / password-reset validation.
 * The same schemas are consumed by:
 *   - <LoginPage> for client-side validation via RHF + zodResolver
 *   - server-side handlers (when added) so the backend matches
 *   - any future test fixtures generating valid/invalid auth payloads
 *
 * The error messages are written to be USER-FACING — they're shown
 * inline under the input via <Field.Error>, not in a toast. Per
 * Phase 6.2: "Error — validation: Inline at field; never a toast."
 *
 * Why the messages are in the schema, not the form:
 *   The roadmap rule: "every error message comes from the schema (no
 *   string duplication)." If the message lives in the form too, you
 *   end up with two slightly-different versions for the same
 *   condition and one of them goes stale. Schema as source-of-truth
 *   forces the convergence.
 */
import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required'),
  // We don't apply min(8) here because that's a SIGNUP rule. Existing
  // accounts may have shorter passwords from before the policy
  // tightened; rejecting them at the login form would lock those
  // users out. The rule belongs on signup.
});

export type LoginInput = z.infer<typeof loginSchema>;

export const passwordResetSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
});

export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
