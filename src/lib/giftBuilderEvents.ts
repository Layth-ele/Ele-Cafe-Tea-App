/**
 * giftBuilderEvents.ts — fire-and-forget funnel analytics for /gifts and
 * the GiftBuilderModal wizard.
 *
 * Collection: /giftBuilderEvents
 * Consumer: Admin analytics (future dashboard slices by event/step/source)
 *
 * Design constraints:
 *   - Works for anonymous + signed-in users
 *   - Best-effort only (never blocks UX)
 *   - Strict payload validation via Zod before write
 */

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import {
  giftBuilderEventNameSchema,
  validateGiftBuilderEvent,
  type GiftBuilderEventName,
} from '@/schemas/giftBuilderEvent.schema';

const VISITOR_KEY = 'ele:anonVisitorId';

function getAnonVisitorId(): string {
  try {
    let id = sessionStorage.getItem(VISITOR_KEY);
    if (!id) {
      const cryptoObj = (typeof crypto !== 'undefined' ? crypto : undefined) as
        (Crypto & { randomUUID?: () => string }) | undefined;
      id = cryptoObj?.randomUUID
        ? cryptoObj.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
      sessionStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch (err) {
    console.warn('[giftBuilderEvents] Failed to read/generate visitor id:', err);
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  }
}

export interface GiftBuilderEventData {
  /** Wizard step at the time of the event. Mirrors WizardStep in
   *  giftBuilderStore.ts — bumped from 1..4 → 1..6 as part of the
   *  6-step modal split (UI_UX_ROADMAP_PHASE_0_6 §6-step modal flow).
   *  The schema's z.number().max(6) in giftBuilderEvent.schema.ts must
   *  stay in sync — both are validated. */
  step?: 1 | 2 | 3 | 4 | 5 | 6;
  source?: string;
  bundleSlug?: string | null;
  teasSelected?: number;
  samplesSelected?: number;
}

export async function logGiftBuilderEvent(
  event: GiftBuilderEventName,
  data: GiftBuilderEventData = {},
  userId?: string | null,
): Promise<void> {
  if (typeof window === 'undefined') return;

  // Defensive in case callers pass an invalid string via any-casts.
  if (!giftBuilderEventNameSchema.safeParse(event).success) return;

  try {
    const path = window.location.pathname.slice(0, 500);
    const payload = {
      path,
      visitorId: getAnonVisitorId(),
      isAuthed: !!userId,
      ...(userId ? { userId: String(userId).slice(0, 128) } : {}),
      event,
      ...(data.step ? { step: data.step } : {}),
      ...(data.source ? { source: data.source.slice(0, 100) } : {}),
      ...(data.bundleSlug ? { bundleSlug: String(data.bundleSlug).slice(0, 64) } : {}),
      ...(typeof data.teasSelected === 'number' ? { teasSelected: data.teasSelected } : {}),
      ...(typeof data.samplesSelected === 'number' ? { samplesSelected: data.samplesSelected } : {}),
    };

    const parsed = validateGiftBuilderEvent(payload);
    if (!parsed.success) {
      console.warn('[giftBuilderEvents] invalid payload:', parsed.error.issues);
      return;
    }

    await addDoc(collection(db, 'giftBuilderEvents'), {
      ...parsed.data,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[giftBuilderEvents] log failed:', err);
  }
}
