/**
 * Clover Ecommerce client — request shape and error handling, with fetch
 * mocked. Guards the money-critical contract: holds are capture:false in
 * CAD cents, captures/releases target the right charge, retries reuse the
 * same idempotency key, and declines are distinguishable from outages.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  authorizeCharge, captureCharge, releaseCharge, CloverError, toCents,
} from '../../../functions/src/lib/clover';

const fetchMock = vi.fn();

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}
const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), headers: init.headers as Record<string, string>, body: JSON.parse(init.body) };
};

beforeEach(() => {
  process.env.CLOVER_PRIVATE_TOKEN = 'test-private-token';
  delete process.env.CLOVER_ENVIRONMENT;
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('authorizeCharge', () => {
  test('places a CAD hold (capture:false) in cents on the sandbox by default', async () => {
    respond(200, { id: 'ch_1', amount: 6949, status: 'succeeded', source: { brand: 'VISA', last4: '4242' } });
    const charge = await authorizeCharge({ orderId: 'ELE-2609-ABC123', amountCents: 6949, cardToken: 'clv_tok', clientIp: '1.2.3.4' });

    const { url, headers, body } = lastCall();
    expect(url).toBe('https://scl-sandbox.dev.clover.com/v1/charges');
    expect(headers.Authorization).toBe('Bearer test-private-token');
    expect(headers['Idempotency-Key']).toBe('auth-ELE-2609-ABC123');
    expect(headers['x-forwarded-for']).toBe('1.2.3.4');
    expect(body).toMatchObject({ amount: 6949, currency: 'cad', source: 'clv_tok', capture: false, ecomind: 'ecom' });
    expect(body.external_reference_id.length).toBeLessThanOrEqual(12);
    expect(body.metadata).toEqual({ orderId: 'ELE-2609-ABC123' });
    expect(charge.source?.last4).toBe('4242');
  });

  test('uses the production host when configured', async () => {
    process.env.CLOVER_ENVIRONMENT = 'production';
    respond(200, { id: 'ch_1', amount: 100, status: 'succeeded' });
    await authorizeCharge({ orderId: 'ELE-2609-ABC123', amountCents: 100, cardToken: 'clv_tok' });
    expect(lastCall().url).toBe('https://scl.clover.com/v1/charges');
  });

  test('a declined card is a CloverError with declined=true', async () => {
    respond(402, { error: { type: 'card_error', message: 'Insufficient funds' } });
    const err = await authorizeCharge({ orderId: 'ELE-2609-ABC123', amountCents: 100, cardToken: 'clv_tok' }).catch((e) => e);
    expect(err).toBeInstanceOf(CloverError);
    expect(err.declined).toBe(true);
    expect(err.message).toBe('Insufficient funds');
  });

  test('a Clover outage is not reported as a decline', async () => {
    respond(503, { message: 'unavailable' });
    const err = await authorizeCharge({ orderId: 'ELE-2609-ABC123', amountCents: 100, cardToken: 'clv_tok' }).catch((e) => e);
    expect(err.declined).toBe(false);
  });

  test('refuses to run without the private token', async () => {
    delete process.env.CLOVER_PRIVATE_TOKEN;
    const err = await authorizeCharge({ orderId: 'ELE-2609-ABC123', amountCents: 100, cardToken: 'clv_tok' }).catch((e) => e);
    expect(err.code).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('captureCharge / releaseCharge', () => {
  test('capture charges the given amount on that charge', async () => {
    respond(200, { id: 'ch_1', amount: 5000, captured: true });
    await captureCharge({ orderId: 'ELE-2609-ABC123', chargeId: 'ch_1', amountCents: 5000 });
    const { url, headers, body } = lastCall();
    expect(url).toBe('https://scl-sandbox.dev.clover.com/v1/charges/ch_1/capture');
    expect(headers['Idempotency-Key']).toBe('capture-ELE-2609-ABC123');
    expect(body).toEqual({ amount: 5000 });
  });

  test('release refunds the charge (releases an uncaptured hold)', async () => {
    respond(200, { id: 'rf_1', status: 'succeeded' });
    await releaseCharge({ orderId: 'ELE-2609-ABC123', chargeId: 'ch_1' });
    const { url, headers, body } = lastCall();
    expect(url).toBe('https://scl-sandbox.dev.clover.com/v1/refunds');
    expect(headers['Idempotency-Key']).toBe('release-ELE-2609-ABC123');
    expect(body).toEqual({ charge: 'ch_1' });
  });

  test('a failed refund throws', async () => {
    respond(200, { id: 'rf_1', status: 'failed' });
    await expect(releaseCharge({ orderId: 'ELE-2609-ABC123', chargeId: 'ch_1' })).rejects.toBeInstanceOf(CloverError);
  });
});

test('toCents rounds dollars to integer cents', () => {
  expect(toCents(69.49)).toBe(6949);
  expect(toCents(0.1 + 0.2)).toBe(30);
});
