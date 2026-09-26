import { describe, test, expect } from 'vitest';
import { isFrPath, localizedPath, localizedUrl } from '@/i18n/langUrl';

describe('langUrl', () => {
  test('isFrPath only matches the /fr segment', () => {
    expect(isFrPath('/fr')).toBe(true);
    expect(isFrPath('/fr/products')).toBe(true);
    expect(isFrPath('/franchise')).toBe(false);
    expect(isFrPath('/')).toBe(false);
  });

  test('localizedPath maps both ways', () => {
    expect(localizedPath('/products/black', 'fr')).toBe('/fr/products/black');
    expect(localizedPath('/fr/products/black', 'en')).toBe('/products/black');
    expect(localizedPath('/', 'fr')).toBe('/fr');
    expect(localizedPath('/fr', 'en')).toBe('/');
    expect(localizedPath('/fr/cafe', 'fr')).toBe('/fr/cafe');
    expect(localizedPath('/franchise', 'fr')).toBe('/fr/franchise');
  });

  test('localizedUrl gives matching canonical / hreflang URLs', () => {
    expect(localizedUrl('https://elecafe.ca/', 'fr')).toBe('https://elecafe.ca/fr');
    expect(localizedUrl('https://elecafe.ca/fr', 'en')).toBe('https://elecafe.ca');
    expect(localizedUrl('https://elecafe.ca/tea-profile/black/assam', 'fr')).toBe(
      'https://elecafe.ca/fr/tea-profile/black/assam',
    );
  });
});
