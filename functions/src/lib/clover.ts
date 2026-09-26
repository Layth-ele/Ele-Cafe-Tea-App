/**
 * Clover Ecommerce API — card holds for online orders.
 *
 * Payment model ("authorize now, capture on approval"):
 *   1. placeOrder    → authorizeCharge(): hold the order total on the card
 *                      (capture:false). The customer is NOT charged.
 *   2. approveOrder  → captureCharge(): an admin confirmed the teas are in
 *                      stock; the held amount (or less) is charged.
 *   3. reject / cancel / expire → releaseCharge(): refunding an uncaptured
 *                      charge releases the hold. On an already-captured
 *                      charge the same call is a real refund.
 *
 * Holds last ~7 days for Visa (longer for Mastercard), so unapproved orders
 * are expired well before that (onOrderExpiry).
 *
 * Config:
 *   CLOVER_PRIVATE_TOKEN  secret — Ecommerce private token
 *                         (Clover dashboard → Account & Setup → Ecommerce API Tokens)
 *                         `firebase functions:secrets:set CLOVER_PRIVATE_TOKEN`
 *   CLOVER_ENVIRONMENT    'sandbox' | 'production' (functions/.env), default sandbox
 *
 * Docs: https://docs.clover.com/dev/docs/ecommerce-api-tutorials
 */
import { defineSecret, defineString } from 'firebase-functions/params';

export const CLOVER_PRIVATE_TOKEN = defineSecret('CLOVER_PRIVATE_TOKEN');
export const CLOVER_ENVIRONMENT   = defineString('CLOVER_ENVIRONMENT', { default: 'sandbox' });

const BASE_URLS = {
  sandbox:    'https://scl-sandbox.dev.clover.com',
  production: 'https://scl.clover.com',
} as const;

export interface CloverCharge {
  id:        string;
  amount:    number;   // cents
  captured?: boolean;
  paid?:     boolean;
  status?:   string;   // 'succeeded' | 'failed' | …
  source?:   { brand?: string; last4?: string };
  outcome?:  { network_status?: string; type?: string };
}

export interface CloverRefund {
  id:      string;
  amount?: number;
  status?: string;     // 'succeeded' | 'failed'
}

/** A Clover call that failed. `declined` = the card was refused (show the
 *  customer); anything else is our/Clover's problem (generic message). */
export class CloverError extends Error {
  constructor(message: string, readonly httpStatus: number, readonly declined: boolean, readonly code?: string) {
    super(message);
    this.name = 'CloverError';
  }
}

export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

async function cloverRequest<T>(
  path: string,
  body: Record<string, unknown>,
  opts: { idempotencyKey: string; clientIp?: string },
): Promise<T> {
  const token = CLOVER_PRIVATE_TOKEN.value();
  if (!token) throw new CloverError('CLOVER_PRIVATE_TOKEN is not set', 500, false, 'not_configured');
  const env = CLOVER_ENVIRONMENT.value() === 'production' ? 'production' : 'sandbox';

  let res: Response;
  try {
    res = await fetch(`${BASE_URLS[env]}${path}`, {
      method: 'POST',
      headers: {
        'Authorization':   `Bearer ${token}`,
        'Content-Type':    'application/json',
        'Accept':          'application/json',
        'Idempotency-Key': opts.idempotencyKey,
        ...(opts.clientIp ? { 'x-forwarded-for': opts.clientIp } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new CloverError(`Network error calling Clover: ${String(err)}`, 0, false, 'network');
  }

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON error body */ }

  if (!res.ok) {
    const err = (json.error ?? {}) as { message?: string; code?: string; type?: string; declineCode?: string };
    // 402 = card declined / payment required; card_error = issuer refusal.
    const declined = res.status === 402 || err.type === 'card_error' || !!err.declineCode;
    throw new CloverError(err.message || `Clover ${res.status}: ${text.slice(0, 200)}`, res.status, declined, err.code);
  }
  return json as T;
}

/** Hold `amountCents` on the card. Throws CloverError (declined=true for
 *  card refusals). Idempotent per order. */
export async function authorizeCharge(opts: {
  orderId:     string;
  amountCents: number;
  cardToken:   string;
  clientIp?:   string;
}): Promise<CloverCharge> {
  const charge = await cloverRequest<CloverCharge>('/v1/charges', {
    amount:   opts.amountCents,
    currency: 'cad',
    source:   opts.cardToken,
    capture:  false,
    ecomind:  'ecom',
    description: `Ele Café order ${opts.orderId}`,
    // Clover caps external_reference_id at 12 chars — last 12 alphanumerics
    // of the order id; the full id goes in metadata.
    external_reference_id: opts.orderId.replace(/[^A-Za-z0-9]/g, '').slice(-12),
    metadata: { orderId: opts.orderId },
  }, { idempotencyKey: `auth-${opts.orderId}`, clientIp: opts.clientIp });

  if (charge.status && charge.status !== 'succeeded') {
    throw new CloverError(`Card authorization ${charge.status}`, 402, true, charge.outcome?.type);
  }
  return charge;
}

/** Charge the held amount (or less — partial capture releases the rest). */
export async function captureCharge(opts: {
  orderId:     string;
  chargeId:    string;
  amountCents: number;
}): Promise<CloverCharge> {
  return cloverRequest<CloverCharge>(
    `/v1/charges/${encodeURIComponent(opts.chargeId)}/capture`,
    { amount: opts.amountCents },
    { idempotencyKey: `capture-${opts.orderId}` },
  );
}

/** Release an uncaptured hold, or refund a captured charge in full. */
export async function releaseCharge(opts: {
  orderId:  string;
  chargeId: string;
}): Promise<CloverRefund> {
  const refund = await cloverRequest<CloverRefund>(
    '/v1/refunds',
    { charge: opts.chargeId },
    { idempotencyKey: `release-${opts.orderId}` },
  );
  if (refund.status && refund.status !== 'succeeded') {
    throw new CloverError(`Refund ${refund.status}`, 400, false, 'refund_failed');
  }
  return refund;
}
