import { z } from 'zod';

/**
 * Review Rating Schema
 */
export const reviewRatingSchema = z.number().int().min(1).max(5);

export type ReviewRating = z.infer<typeof reviewRatingSchema>;

/**
 * Review Schema
 *
 * Mirrors the actual review doc at `/teas/{slug}/reviews/{userId}` as
 * written by TeaProfilePage's `submitReviewMutation`. Reviews are
 * stored in a SUBCOLLECTION under their tea (not a top-level
 * /reviews collection) — the `userId` is the doc id, the `teaSlug`
 * is the parent path.
 *
 * Schema-fidelity notes:
 *
 *  - No `productId` field — the parent tea slug serves that role
 *    implicitly. Pre-fix the schema declared `productId: z.string().min(1)`,
 *    which would have rejected every real review doc on `validateReview`.
 *
 *  - No `id` field — the doc id IS the userId (one-review-per-user-per-tea
 *    is enforced by using userId as the path component). Pre-fix the
 *    schema declared `id`, which existed neither in the data nor in the
 *    write path.
 *
 *  - No `title`, `images`, `verified`, `helpful`, or `updatedAt` fields.
 *    These were declared on an earlier richer-review design that was
 *    never built. The current implementation has rating + comment only,
 *    plus the userName denormalized for display. They were dropped
 *    from the schema to stop tooling from suggesting fields that don't
 *    exist anywhere in the codebase.
 *
 *  - `comment` made optional. The original schema marked it required-
 *    with-min-10. The form ENFORCES this client-side, but the schema
 *    needed to round-trip historical "rating-only" reviews — relaxed
 *    to optional so `validateReview()` can be used on every persisted
 *    doc without spurious failures.
 */
export const reviewSchema = z.object({
  userId:    z.string().min(1),
  userName:  z.string().min(1).max(100),
  rating:    reviewRatingSchema,
  comment:   z.string().max(1000).optional(),
  createdAt: z.date().optional(),  // serverTimestamp; absent on a freshly-built object
});

export type Review = z.infer<typeof reviewSchema>;

/**
 * Create Review Schema — what the submit handler builds before writing.
 *
 * `userName` is denormalized from the auth context at write time
 * (not user-provided in the form). `createdAt` is filled in by
 * Firestore's `serverTimestamp()`. The form supplies rating + comment.
 */
export const createReviewSchema = reviewSchema.omit({
  userName: true,
  createdAt: true,
}).extend({
  // Form-side rule — comment, when present, must be a useful length.
  // Mirrors the TeaProfilePage submit guard.
  comment: z.string().min(10, 'Review must be at least 10 characters').max(1000).optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

/**
 * Update Review Schema — admin-side edit (currently unused; kept for
 * a future "edit my review" feature).
 */
export const updateReviewSchema = z.object({
  userId:  z.string().min(1),
  rating:  reviewRatingSchema.optional(),
  comment: z.string().min(10).max(1000).optional(),
});

export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;

/**
 * Review Filter Schema
 */
export const reviewFilterSchema = z.object({
  teaSlug: z.string().optional(),  // renamed from productId for clarity
  userId: z.string().optional(),
  minRating: reviewRatingSchema.optional(),
  maxRating: reviewRatingSchema.optional(),
});

export type ReviewFilter = z.infer<typeof reviewFilterSchema>;

/**
 * Helper functions
 */
export const validateReview = (data: unknown) => {
  return reviewSchema.safeParse(data);
};

export const validateCreateReview = (data: unknown) => {
  return createReviewSchema.safeParse(data);
};
