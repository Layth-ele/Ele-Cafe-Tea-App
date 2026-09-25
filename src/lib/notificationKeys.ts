type Brand<T, B> = T & { readonly __brand: B };

export type OrderId = Brand<string, 'OrderId'>;
export type UserId = Brand<string, 'UserId'>;
export type TxId = Brand<string, 'TxId'>;

export const orderIdOf = (s: string): OrderId => s as OrderId;
export const userIdOf = (s: string): UserId => s as UserId;
export const txIdOf = (s: string): TxId => s as TxId;

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

export function keyForOrderStatus(orderId: OrderId, status: OrderStatusInKey, audience: Audience): string {
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

export function isWellFormedKey(key: string): boolean {
  if (!key || key.length > 200) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(key)) return false;
  return /^order_|^signup_|^welcome_|^credit_/.test(key);
}
