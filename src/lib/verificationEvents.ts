/**
 * verificationEvents.ts — fire-and-forget logger for the email-
 * verification UX flow.
 *
 * Events:
 *   • modal_shown    — verification modal opened
 *   • resend_clicked — resend button clicked
 *   • verified       — verification check returned true
 *   • action_blocked — gated action intercepted (order/review)
 *
 * Each call writes one Firestore doc to /verificationEvents.
 * Read by AdminVerificationAnalytics. Never throws — analytics
 * failure must never block the user from continuing.
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export type VerificationEventName =
  | 'modal_shown'
  | 'resend_clicked'
  | 'verified'
  | 'action_blocked';

export interface VerificationEventData {
  /** Sub-reason — "checkout-blocked", "review-blocked", etc. Capped at 100 chars by rule. */
  reason?: string;
  /** User's emailVerified flag at log time. Useful for spotting
   *  "modal showed but they were already verified" edge cases. */
  isVerified?: boolean;
}

/**
 * Log a verification-flow event. Fire-and-forget.
 * Skip if userId is null/empty — the firestore rule rejects writes
 * where userId doesn't match auth uid, so anonymous calls would
 * pollute logs with permission-denied errors.
 */
export async function logVerificationEvent(
  userId: string | null | undefined,
  event: VerificationEventName,
  data: VerificationEventData = {},
): Promise<void> {
  if (!userId) return;
  try {
    const ua = typeof navigator !== 'undefined'
      ? navigator.userAgent.slice(0, 500) : '';
    const url = typeof window !== 'undefined' && window.location
      ? window.location.href.slice(0, 500) : '';
    await addDoc(collection(db, 'verificationEvents'), {
      userId,
      event,
      reason:     (data.reason ?? '').slice(0, 100),
      isVerified: data.isVerified === true,
      userAgent:  ua,
      pageUrl:    url,
      createdAt:  serverTimestamp(),
    });
  } catch (err) {
    // Best-effort — log but never surface.
    console.warn('[verificationEvents] log failed:', err);
  }
}
