/**
 * Back-in-stock email (Cloud Function template) — content + safety.
 */
import { describe, test, expect } from 'vitest';
import { buildBackInStockEmail, type BackInStockEmailInput } from '../../../functions/src/lib/backInStockEmail';
import { emailBrandFrom } from '../../../functions/src/lib/emailLayout';
import { buildNotificationMessage, NOTIFICATION_META } from '@/lib/notificationMessages';
import { notificationSchema } from '@/schemas/notification.schema';

const input: BackInStockEmailInput = {
  brand:           emailBrandFrom({ storeName: 'Ele Café', storeAddress: '895 West Broadway, Vancouver, BC V5Z 1J9', storeWebsite: 'https://elecafe.ca' }),
  teaName:         'Green Jasmine',
  teaUrl:          'https://elecafe.ca/tea-profile/green/green-jasmine',
  teaImage:        'https://firebasestorage.googleapis.com/v0/b/x/o/jasmine.png',
  price:           18,
  explicitRequest: true,
};

describe('buildBackInStockEmail', () => {
  test('names the tea, links to it, and shows the price', () => {
    const { subject, html, text } = buildBackInStockEmail(input);
    expect(subject).toBe('Green Jasmine is back in stock | Ele Café');
    expect(html).toContain('href="https://elecafe.ca/tea-profile/green/green-jasmine"');
    expect(html).toContain('$18.00 CAD');
    expect(text).toContain('https://elecafe.ca/tea-profile/green/green-jasmine');
  });

  test('explains why the customer got it, with a preferences link', () => {
    expect(buildBackInStockEmail(input).html).toContain('one-time email');
    const hearted = buildBackInStockEmail({ ...input, explicitRequest: false }).html;
    expect(hearted).toContain('saved this tea to your wishlist');
    expect(hearted).toContain('href="https://elecafe.ca/account"');
  });

  test('omits the photo and price when missing', () => {
    const { html } = buildBackInStockEmail({ ...input, teaImage: '', price: 0 });
    expect(html).not.toContain('jasmine.png');
    expect(html).not.toContain('CAD');
  });

  test('escapes tea names and drops non-http URLs', () => {
    const { html } = buildBackInStockEmail({
      ...input,
      teaName:  '<script>alert(1)</script>',
      teaImage: 'javascript:alert(1)',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('javascript:');
  });
});


describe('customer_back_in_stock bell/push notification', () => {
  test('has a message and icon', () => {
    const msg = buildNotificationMessage({ type: 'customer_back_in_stock', data: { teaName: 'Sencha Fuji' } });
    expect(msg.title).toBe('Sencha Fuji is back in stock');
    expect(NOTIFICATION_META.customer_back_in_stock.emoji).toBeTruthy();
  });

  test('the doc the Cloud Function writes passes the strict schema', () => {
    const r = notificationSchema.safeParse({
      id: 'backinstock_sencha-fuji_u1_e1', recipientId: 'u1', type: 'customer_back_in_stock',
      title: 'Sencha Fuji is back in stock', body: 'Grab it before it sells out again.',
      data: { teaSlug: 'sencha-fuji', teaName: 'Sencha Fuji', url: '/tea-profile/green/sencha-fuji' },
      isRead: false, createdAt: new Date(),
    });
    expect(r.success).toBe(true);
  });
});
