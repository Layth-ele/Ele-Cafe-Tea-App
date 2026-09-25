/**
 * storeContent — Admin → Settings turned into site copy + Google data.
 * The website and renderSeo both use these, so a settings edit must flow
 * through every answer and every JSON-LD field.
 */
import { describe, test, expect } from 'vitest';
import {
  readStoreContent, buildHomeFaq, faqJsonLd, localBusinessLd, parseAddress,
  phoneTel, instagramHandle, hoursText, groupedHours, shippingRateFor, shippingText,
} from '../../../functions/src/lib/storeContent';

const LIVE = {
  storeName: 'Ele Café',
  storeAddress: '895 West Broadway, Vancouver, BC V5Z 1J9',
  storePhone: '(604) 566-9998',
  storeEmail: 'info@elecafe.ca',
  mapsUrl: 'https://maps.app.goo.gl/abc',
  socialInstagram: 'https://www.instagram.com/elecafe_',
  socialWhatsapp: 'https://wa.me/16045669998',
  socialFacebook: '',
  freeShippingThreshold: 100, defaultShippingFee: 12.99,
  pointsPerDollar: 100, minRedemptionPts: 10000, creditValuePer1000: 1, welcomeBonusPoints: 500,
  giftBuilderEnabled: true,
  businessHours: [
    { day: 'mon', closed: false, open: '08:00', close: '21:00' },
    { day: 'tue', closed: false, open: '08:00', close: '21:00' },
    { day: 'wed', closed: false, open: '08:00', close: '21:00' },
    { day: 'thu', closed: false, open: '08:00', close: '21:00' },
    { day: 'fri', closed: false, open: '08:00', close: '21:00' },
    { day: 'sat', closed: false, open: '09:00', close: '21:00' },
    { day: 'sun', closed: false, open: '12:00', close: '21:00' },
  ],
};
const store = readStoreContent(LIVE);

describe('contact details', () => {
  test('phone → E.164 tel', () => {
    expect(phoneTel('(604) 566-9998')).toBe('+16045669998');
    expect(phoneTel('+1 604 566 9998')).toBe('+16045669998');
    expect(phoneTel('')).toBe('');
  });
  test('instagram handle', () => expect(instagramHandle(LIVE.socialInstagram)).toBe('@elecafe_'));
  test('address → PostalAddress parts', () => {
    expect(parseAddress(LIVE.storeAddress)).toEqual({
      streetAddress: '895 West Broadway', addressLocality: 'Vancouver', addressRegion: 'BC', postalCode: 'V5Z 1J9',
    });
    expect(parseAddress('Vancouver, BC, Canada')).toEqual({ addressLocality: 'Vancouver', addressRegion: 'BC' });
  });
  test('non-https and blank socials are dropped', () => {
    expect(readStoreContent({ ...LIVE, socialFacebook: 'javascript:alert(1)' }).sameAs).toEqual([LIVE.socialInstagram]);
  });
  test('maps falls back to an address search', () => {
    expect(readStoreContent({ ...LIVE, mapsUrl: '' }).mapsUrl).toContain(encodeURIComponent('895 West Broadway'));
  });
});

describe('hours', () => {
  test('groups consecutive identical days', () => {
    expect(hoursText(store.hours)).toBe('Monday – Friday 8 am – 9 pm · Saturday 9 am – 9 pm · Sunday 12 pm – 9 pm');
  });
  test('a closed day breaks a run', () => {
    const hours = readStoreContent({ businessHours: [
      { day: 'mon', closed: false, open: '08:00', close: '17:00' },
      { day: 'tue', closed: true,  open: '08:00', close: '17:00' },
      { day: 'wed', closed: false, open: '08:00', close: '17:00' },
    ] }).hours;
    expect(groupedHours(hours).map((g) => g.days)).toEqual([['Monday'], ['Wednesday']]);
  });
  test('invalid times count as closed; no hours → nothing claimed', () => {
    expect(readStoreContent({ businessHours: [{ day: 'mon', closed: false, open: 'x', close: '17:00' }] }).hours[0].closed).toBe(true);
    expect(localBusinessLd(readStoreContent({}), 'https://x.test')).not.toHaveProperty('openingHoursSpecification');
  });
});

describe('LocalBusiness JSON-LD', () => {
  test('mirrors settings', () => {
    const ld = localBusinessLd(store, 'https://elecafe.ca') as Record<string, any>;
    expect(ld.telephone).toBe('+16045669998');
    expect(ld.address.streetAddress).toBe('895 West Broadway');
    expect(ld.openingHoursSpecification[0]).toMatchObject({ opens: '08:00', closes: '21:00' });
    expect(ld.openingHoursSpecification[0].dayOfWeek).toHaveLength(5);
    expect(ld.sameAs).toEqual([LIVE.socialInstagram]);
    expect(ld.foundingDate).toBe('2023');
  });
  test('omits phone/address when blank', () => {
    const ld = localBusinessLd(readStoreContent({}), 'https://x.test');
    expect(ld).not.toHaveProperty('telephone');
    expect(ld).not.toHaveProperty('address');
  });
});

describe('shipping', () => {
  test('rate per item', () => {
    expect(shippingRateFor(20, store)).toBe(12.99);
    expect(shippingRateFor(120, store)).toBe(0);
    expect(shippingRateFor(20, readStoreContent({ freeShippingThreshold: 0 }))).toBe(0);
  });
  test('text', () => expect(shippingText(store)).toBe('Free shipping across Canada on orders over $100 ($12.99 flat rate below).'));
});

describe('buildHomeFaq', () => {
  const faq = buildHomeFaq(store);
  const answer = (needle: string) => faq.find((f) => f.q.includes(needle))!.a;
  test('shipping uses the live threshold and flat rate', () => {
    expect(answer('ship')).toContain('over $100');
    expect(answer('ship')).toContain('flat $12.99');
    expect(buildHomeFaq(readStoreContent({}))[0].a).toContain('every order ships free');
  });
  test('pickup uses the live address and hours', () => {
    expect(answer('pick up')).toContain('895 West Broadway');
    expect(answer('pick up')).toContain('Monday – Friday 8 am – 9 pm');
  });
  test('rewards only when configured; gifts only when the builder is on', () => {
    expect(answer('rewards')).toContain('100 points per dollar');
    expect(answer('rewards')).toContain('500 welcome points');
    const bare = buildHomeFaq(readStoreContent({}));
    expect(bare.some((f) => f.q.includes('rewards'))).toBe(false);
    expect(bare.some((f) => f.q.includes('gift'))).toBe(false);
    expect(faq.some((f) => f.q.includes('gift'))).toBe(true);
  });
  test('returns match the refund policy', () => expect(answer('return')).toContain('within 7 days'));
  test('JSON-LD mirrors the visible questions', () => {
    const ld = faqJsonLd(faq) as { '@type': string; mainEntity: { name: string }[] };
    expect(ld['@type']).toBe('FAQPage');
    expect(ld.mainEntity.map((q) => q.name)).toEqual(faq.map((f) => f.q));
  });
});
