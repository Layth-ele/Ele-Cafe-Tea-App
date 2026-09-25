/**
 * CardPaymentForm — Clover hosted card fields for checkout.
 *
 * Each field is an iframe served by Clover, so card data never reaches
 * this page or our servers. The parent calls `tokenize()` (via ref) to
 * validate the card and get a single-use token for placeOrder, which
 * places a HOLD on the card — the customer is only charged when an admin
 * approves the order.
 *
 * UX: fixed-height fields (Clover's iframes are height:100% of their
 * container), focus ring via :focus-within (focus inside an iframe
 * focuses the <iframe> element in this document), live per-field
 * valid/invalid state from Clover's `change` events, optional Google Pay
 * (VITE_CLOVER_WALLETS=true, once enabled on the Clover account).
 */
import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Check, Lock } from 'lucide-react';
import { createCloverInstance, walletsEnabled, type CloverInstance } from '@/lib/cloverCheckout';

import { useT, useTx, tNow } from '@/i18n/useT';
export interface CardToken {
  token:  string;
  brand?: string;
  last4?: string;
}

export interface CardPaymentFormHandle {
  /** Validate the entered card and return a single-use token. Throws with
   *  a customer-readable message when the card details are incomplete. */
  tokenize: () => Promise<CardToken>;
}

type FieldType = 'CARD_NAME' | 'CARD_NUMBER' | 'CARD_DATE' | 'CARD_CVV' | 'CARD_POSTAL_CODE';

const FIELDS: { type: FieldType; label: string }[] = [
  { type: 'CARD_NUMBER',      label: 'Card number' },
  { type: 'CARD_DATE',        label: 'Expiry' },
  { type: 'CARD_CVV',         label: 'CVV' },
  { type: 'CARD_POSTAL_CODE', label: 'Postal code' },
  { type: 'CARD_NAME',        label: 'Name on card' },
];

/** Styles applied INSIDE Clover's iframes (our CSS can't reach them).
 *  Clover always paints its fields white (it ignores background colours),
 *  so the text stays dark in both themes and .card-pay-box is white too. */
const IFRAME_STYLES = {
  body:  { fontFamily: 'Jost, system-ui, -apple-system, sans-serif', margin: '0' },
  input: {
    fontSize: '16px', height: '46px', padding: '0 14px', color: '#1a2530',
    border: 'none', outline: 'none', letterSpacing: '0.02em',
  },
  'input::placeholder': { color: '#94a3b8' },
  // Chrome paints autofilled fields light blue — repaint them white.
  'input:-webkit-autofill': { WebkitBoxShadow: '0 0 0 1000px #ffffff inset', WebkitTextFillColor: '#1a2530' },
};

type FieldState = { error?: string; touched?: boolean };

export function CardPaymentForm({ ref, amount }: { ref?: Ref<CardPaymentFormHandle>; amount?: number }) {
  const t = useT();
  const tx = useTx();
  const idBase = useId().replace(/:/g, '');
  const cloverRef = useRef<CloverInstance | null>(null);
  const walletTokenRef = useRef<CardToken | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [fields, setFields] = useState<Partial<Record<FieldType, FieldState>>>({});
  const [walletReady, setWalletReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const clover = await createCloverInstance();
        if (cancelled) return;
        const elements = clover.elements();
        const styles = IFRAME_STYLES;
        const onEvent = (event: Record<string, FieldState>) => {
          setFields((prev) => ({ ...prev, ...event }));
        };
        for (const f of FIELDS) {
          const el = elements.create(f.type, styles);
          el.mount(`#${idBase}-${f.type}`);
          el.addEventListener('change', onEvent);
          el.addEventListener('blur', onEvent);
        }

        // Google Pay (Clover PAYMENT_REQUEST_BUTTON). Its token arrives on
        // the paymentMethod event and is used instead of the card fields.
        if (walletsEnabled && typeof amount === 'number' && amount > 0) {
          try {
            const button = elements.create('PAYMENT_REQUEST_BUTTON', {
              paymentReqData: { total: { label: 'Ele Café', amount: Math.round(amount * 100) }, options: { button: { buttonType: 'long' } } },
            } as Record<string, unknown>);
            button.mount(`#${idBase}-WALLET`);
            button.addEventListener('paymentMethod', (data: unknown) => {
              const d = data as { token?: string; card?: { brand?: string; last4?: string } };
              if (d?.token) walletTokenRef.current = { token: d.token, brand: d.card?.brand ?? 'Google Pay', last4: d.card?.last4 };
            });
            setWalletReady(true);
          } catch (walletErr) {
            console.warn('[CardPaymentForm] Google Pay unavailable:', walletErr);
          }
        }

        cloverRef.current = clover;
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : tNow('Could not load the card form.'));
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
    // amount only matters for the wallet button at mount time.
  }, [idBase]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    async tokenize() {
      if (walletTokenRef.current) return walletTokenRef.current;
      const clover = cloverRef.current;
      if (!clover) throw new Error(loadError || 'The card form is still loading — please wait a moment.');
      const result = await clover.createToken();
      if (result.errors && Object.keys(result.errors).length > 0) {
        setFields((prev) => {
          const next = { ...prev };
          for (const [k, msg] of Object.entries(result.errors!)) next[k as FieldType] = { error: msg, touched: true };
          return next;
        });
        throw new Error(Object.values(result.errors)[0] || 'Please check your card details.');
      }
      if (!result.token) throw new Error('Please check your card details.');
      return { token: result.token, brand: result.card?.brand, last4: result.card?.last4 };
    },
  }), [loadError]);

  const stateOf = (type: FieldType): 'error' | 'valid' | 'idle' => {
    const f = fields[type];
    if (f?.error && f.touched) return 'error';
    if (f?.touched && !f.error) return 'valid';
    return 'idle';
  };

  return (
    <div className="card-pay" data-status={status}>
      <div className="card-pay-head">
        <span className="card-pay-secure"><Lock size={13} aria-hidden="true" /> {t('Secure payment')}</span>
        <span className="card-pay-brands" aria-label={t('Accepted cards: Visa, Mastercard, American Express')}>
          <span className="card-pay-brand" data-brand="visa">VISA</span>
          <span className="card-pay-brand" data-brand="mc" aria-hidden="true"><i /><i /></span>
          <span className="card-pay-brand" data-brand="amex">AMEX</span>
        </span>
      </div>

      {status === 'error' ? (
        <p className="card-pay-load-error" role="alert">{loadError}</p>
      ) : (
        <>
          {walletsEnabled && (
            <div className="card-pay-wallet" hidden={!walletReady}>
              <div id={`${idBase}-WALLET`} className="card-pay-wallet-btn" />
              <p className="card-pay-divider"><span>{t('or pay with card')}</span></p>
            </div>
          )}
          <div className="card-pay-grid" aria-busy={status === 'loading'}>
            {FIELDS.map((f) => {
              const state = stateOf(f.type);
              const err = state === 'error' ? fields[f.type]?.error : undefined;
              return (
                <div key={f.type} className="card-pay-field" data-type={f.type} data-state={state}>
                  <span className="card-pay-label">{t(f.label)}</span>
                  <div className="card-pay-box">
                    <div id={`${idBase}-${f.type}`} className="card-pay-frame" />
                    {state === 'valid' && <Check size={16} className="card-pay-ok" aria-hidden="true" />}
                    {status === 'loading' && <span className="card-pay-skeleton" aria-hidden="true" />}
                  </div>
                  {err && <p className="card-pay-error" role="alert">{err}</p>}
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="card-pay-note">
        {tx('Your card details go straight to Clover, our payment processor — we never see or store them. We place a {hold} and only charge your card once we confirm your teas are in stock.', { hold: <strong>{t('temporary hold')}</strong> })}
      </p>
    </div>
  );
}
