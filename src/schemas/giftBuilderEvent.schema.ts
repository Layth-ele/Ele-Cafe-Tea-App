import { z } from 'zod';

/**
 * giftBuilderEvent.schema.ts — analytics event schema for the gift-builder funnel.
 *
 * Logged by src/lib/giftBuilderEvents.ts as append-only docs in /giftBuilderEvents.
 *
 * Goals:
 *   - Keep payload shape strict and bounded (cost + abuse resistance)
 *   - Support anonymous and signed-in users
 *   - Capture enough context for funnel analysis by step/source
 */

export const giftBuilderEventNameSchema = z.enum([
  'landing_cta_clicked',
  'modal_opened',
  'step_viewed',
  'step_next_clicked',
  'step_back_clicked',
  'modal_closed',
  'add_to_cart_succeeded',
  'add_to_cart_failed',
]);

export type GiftBuilderEventName = z.infer<typeof giftBuilderEventNameSchema>;

export const giftBuilderEventSchema = z.object({
  path:          z.string().min(1).max(500),
  visitorId:     z.string().min(1).max(64),
  userId:        z.string().max(128).optional(),
  isAuthed:      z.boolean(),
  event:         giftBuilderEventNameSchema,
  // step cap bumped 4 → 6 with the 6-step modal split (see
  // UI_UX_ROADMAP_PHASE_0_6 §6-step modal flow). Must stay in sync
  // with WizardStep in giftBuilderStore.ts and the step type in
  // giftBuilderEvents.ts.
  step:          z.number().int().min(1).max(6).optional(),
  source:        z.string().max(100).optional(),
  bundleSlug:    z.string().max(64).optional(),
  teasSelected:  z.number().int().min(0).max(7).optional(),
  samplesSelected: z.number().int().min(0).max(7).optional(),
});

export type GiftBuilderEvent = z.infer<typeof giftBuilderEventSchema>;

export const validateGiftBuilderEvent = (data: unknown) =>
  giftBuilderEventSchema.safeParse(data);
