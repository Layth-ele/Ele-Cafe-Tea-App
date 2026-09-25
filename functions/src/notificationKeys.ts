/**
 * notificationKeys.ts — VENDORED COPY for Cloud Functions.
 *
 * This file mirrors src/lib/notificationKeys.ts byte-for-byte (apart
 * from this comment block). Functions's tsconfig has rootDir: "src",
 * preventing imports from outside the functions package. A shared
 * monorepo package would require workspace tooling we don't run.
 *
 * If you change one copy, change the other. The test in
 * tests/unit/notifications/notificationKeys.test.ts pins the
 * client-side contract; mismatches between client and server will
 * surface as production bugs (notifications written under one ID
 * scheme, read under another).
 */

type Brand<T, B> = T & { readonly __brand: B };

export type OrderId = Brand<string, 'OrderId'>;
export type UserId  = Brand<string, 'UserId'>;
export type TxId    = Brand<string, 'TxId'>;

export const orderIdOf = (s: string): OrderId => s as OrderId;
export const userIdOf  = (s: string): UserId  => s as UserId;
export const txIdOf    = (s: string): TxId    => s as TxId;

export type OrderStatusInKey =
  | 'pending'
  | 'in_progress'
  | 'ready_for_pickup'
  | 'shipped'
  | 'delivered'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export type Audience = 'user' | 'admin';

export function keyForOrderStatus(
  orderId: OrderId,
  status: OrderStatusInKey,
  audience: Audience,
): string {
  return `order_${orderId}_${status}_${audience}`;
}

export function keyForCreditEarned(orderId: OrderId): string {
  return `order_${orderId}_credit_earned`;
}

export function keyForSignup(userId: UserId): string {
  return `signup_${userId}`;
}

export function keyForWelcomeBonus(userId: UserId): string {
  return `welcome_${userId}`;
}

export function keyForCreditAdminAdjust(txId: TxId): string {
  return `credit_${txId}`;
}
