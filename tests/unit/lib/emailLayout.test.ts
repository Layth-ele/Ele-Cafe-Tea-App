/**
 * The shared email layout — every Ele Café email (orders, back-in-stock,
 * admin alerts, account emails) renders through it, so brand details,
 * the white logo, centring and escaping are checked once here.
 */
import { describe, test, expect } from 'vitest';
import {
  renderEmail, emailBrandFrom, p, button, infoBox, itemsTable, totalsTable, DEFAULT_EMAIL_LOGO,
} from '../../../functions/src/lib/emailLayout';
import { buildAuthEmail } from '../../../functions/src/lib/authEmailContent';

const SETTINGS = {
  storeName: 'Ele Café', storeAddress: '895 West Broadway, Vancouver, BC V5Z 1J9', storePhone: '(604) 566-9998',
  storeEmail: 'info@elecafe.ca', storeWebsite: 'https://elecafe.ca', mapsUrl: 'https://maps.app.goo.gl/abc',
  socialInstagram: 'https://www.instagram.com/elecafe_',
};
const brand = emailBrandFrom(SETTINGS);
const html = renderEmail({ brand, preheader: 'Preview line', eyebrow: 'Order received', title: 'Thank you, Sam!', body: [p('Hello'), button('View order', 'https://elecafe.ca/orders')] });

describe('emailBrandFrom', () => {
  test('uses Admin → Settings, with the white logo by default', () => {
    expect(brand).toMatchObject({ name: 'Ele Café', phone: '(604) 566-9998', email: 'info@elecafe.ca', logoUrl: DEFAULT_EMAIL_LOGO });
    expect(DEFAULT_EMAIL_LOGO).toContain('logo-white.png');
  });
  test('an https logo override in settings wins; anything else is ignored', () => {
    expect(emailBrandFrom({ emailLogoUrl: 'https://cdn.example/logo.png' }).logoUrl).toBe('https://cdn.example/logo.png');
    expect(emailBrandFrom({ emailLogoUrl: 'javascript:alert(1)' }).logoUrl).toBe(DEFAULT_EMAIL_LOGO);
  });
});

describe('renderEmail', () => {
  test('header: white logo, store name, address as a styled maps link (not Gmail blue)', () => {
    expect(html).toContain(`src="${DEFAULT_EMAIL_LOGO}"`);
    expect(html).toContain('href="https://maps.app.goo.gl/abc" style="color:#d4b37a;text-decoration:none;"');
  });
  test('content is centred', () => {
    expect(html).toMatch(/<h1[^>]*text-align:center/);
    expect(html).toMatch(/<p style="[^"]*text-align:center;">Hello<\/p>/);
    expect(html).toContain('align="center" style="margin:26px auto 8px;"');
  });
  test('footer carries the store contact details from settings', () => {
    expect(html).toContain('href="tel:+16045669998"');
    expect(html).toContain('mailto:info@elecafe.ca');
    expect(html).toContain('@elecafe_');
    expect(html).toContain('Preview line');
  });
  test('escapes the title and drops unsafe links', () => {
    const x = renderEmail({ brand, preheader: '', eyebrow: 'x', title: '<img onerror=1>', body: [button('Go', 'javascript:alert(1)')] });
    expect(x).not.toContain('<img onerror');
    expect(x).not.toContain('javascript:');
  });
});

describe('blocks', () => {
  test('info box rows, items and totals', () => {
    expect(infoBox('Order summary', [['Order', 'ABC']])).toContain('ABC');
    const items = itemsTable([{ productName: 'Assam', quantity: 2, price: 18 }]);
    expect(items).toContain('2 × $18.00');
    expect(items).toContain('$36.00');
    expect(totalsTable([['Order total', '$36.00 CAD', 'total']])).toContain('font-weight:700');
  });
});

describe('account emails', () => {
  test('verify email shows the live welcome points, not a hard-coded amount', () => {
    const { subject, html: v } = buildAuthEmail('verify-email', { brand, link: 'https://elecafe.ca/verify?x=1', email: 'a@b.co', welcomePoints: 5000, creditValuePer1000: 1 });
    expect(subject).toBe('Verify your email · Ele Café');
    expect(v).toContain('5,000 welcome points');
    expect(v).toContain('$5 off');
    expect(v).not.toMatch(/79-tea|Since 2018|100 welcome credits/);
  });
  test('reset and change emails use the same layout', () => {
    for (const kind of ['password-reset', 'email-change'] as const) {
      const { html: h } = buildAuthEmail(kind, { brand, link: 'https://elecafe.ca/a', email: 'a@b.co', newEmail: 'n@b.co' });
      expect(h).toContain(`src="${DEFAULT_EMAIL_LOGO}"`);
      expect(h).toContain('https://elecafe.ca/a');
    }
  });
});
