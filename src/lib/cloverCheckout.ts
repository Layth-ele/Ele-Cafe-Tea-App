/**
 * Clover hosted card fields (iframe SDK) — loads https://checkout.clover.com/sdk.js
 * on demand and turns the customer's card into a single-use token (clv_…).
 * Card numbers never touch our servers or this page; the placeOrder Cloud
 * Function uses the token to place a hold (see functions/src/lib/clover.ts).
 *
 * Config (.env.local / build env — all public, safe in the bundle):
 *   VITE_CLOVER_PUBLIC_KEY   Ecommerce public key / PAKMS "apiAccessKey"
 *   VITE_CLOVER_MERCHANT_ID  Clover merchant ID
 *   VITE_CLOVER_ENVIRONMENT  'sandbox' | 'production' (default sandbox)
 *   VITE_CLOVER_WALLETS      'true' to show the Google Pay button (enable
 *                            Google Pay on the Clover account first)
 *
 * Docs: https://docs.clover.com/dev/docs/using-the-clover-hosted-iframe
 */

export interface CloverElement {
  mount: (selector: string) => void;
  /** 'change' / 'blur' for card fields; 'paymentMethod' etc. for the
   *  payment request (Google Pay) button. */
  addEventListener: (event: string, cb: (e: Record<string, { error?: string; touched?: boolean }>) => void) => void;
}

export interface CloverTokenResult {
  token?:  string;
  card?:   { brand?: string; last4?: string };
  errors?: Record<string, string>;
}

export interface CloverInstance {
  elements: () => { create: (type: string, options?: Record<string, unknown>) => CloverElement };
  createToken: () => Promise<CloverTokenResult>;
}

declare global {
  interface Window {
    Clover?: new (apiKey: string, opts?: { merchantId?: string; locale?: string }) => CloverInstance;
  }
}

const ENV = import.meta.env.VITE_CLOVER_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
const SDK_URL = ENV === 'production'
  ? 'https://checkout.clover.com/sdk.js'
  : 'https://checkout.sandbox.dev.clover.com/sdk.js';
// Values still set to the .env placeholder (PASTE_…) count as not configured.
const realValue = (v: unknown) =>
  typeof v === 'string' && v.trim() && !v.startsWith('PASTE_') ? v.trim() : undefined;
const PUBLIC_KEY  = realValue(import.meta.env.VITE_CLOVER_PUBLIC_KEY);
const MERCHANT_ID = realValue(import.meta.env.VITE_CLOVER_MERCHANT_ID);

export const cloverConfigured = !!PUBLIC_KEY;
export const walletsEnabled = import.meta.env.VITE_CLOVER_WALLETS === 'true';

let sdkPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (window.Clover) return Promise.resolve();
  if (!sdkPromise) {
    sdkPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SDK_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        sdkPromise = null; // allow a retry
        reject(new Error('Could not load the secure card form. Check your connection and try again.'));
      };
      document.head.appendChild(script);
    });
  }
  return sdkPromise;
}

/** A fresh Clover instance (one per mounted card form). */
export async function createCloverInstance(): Promise<CloverInstance> {
  if (!PUBLIC_KEY) throw new Error('Card payments are not configured (VITE_CLOVER_PUBLIC_KEY).');
  await loadSdk();
  if (!window.Clover) throw new Error('The secure card form failed to start.');
  return new window.Clover(PUBLIC_KEY, {
    ...(MERCHANT_ID ? { merchantId: MERCHANT_ID } : {}),
    locale: 'en-CA',
  });
}
