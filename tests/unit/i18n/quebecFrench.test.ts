import { describe, test, expect } from 'vitest';
import { quebecFrench } from '../../../functions/src/translate';

describe('quebecFrench', () => {
  test('teaspoon is « cuillère à thé »', () => {
    expect(quebecFrench('one teaspoon', 'Utilisez une cuillère à café par tasse.')).toBe(
      'Utilisez une cuillère à thé par tasse.',
    );
    expect(quebecFrench('two teaspoons', 'Deux cuillères à café.')).toBe('Deux cuillères à thé.');
    expect(quebecFrench('Teaspoon', 'Cuillère à café')).toBe('Cuillère à thé');
  });

  test('caffeine-free is « sans caféine », decaf stays « décaféiné »', () => {
    expect(quebecFrench('for a caffeine-free iced tea', 'pour un thé glacé décaféiné.')).toBe(
      'pour un thé glacé sans caféine.',
    );
    expect(quebecFrench('Naturally caffeine-free', 'Naturellement décaféinée.')).toBe(
      'Naturellement sans caféine.',
    );
    expect(quebecFrench('Decaffeinated black tea', 'Thé noir décaféiné')).toBe(
      'Thé noir décaféiné',
    );
  });
});
