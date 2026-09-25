import { describe, expect, test } from 'vitest';
import { registerImageVariants, variantSrcSet } from '../../../src/lib/imageRegistry';

const IMG = 'https://firebasestorage.googleapis.com/v0/b/b/o/teas%2Fassam.png?alt=media&token=t';
const v = (w: number) => ({ w, url: `https://firebasestorage.googleapis.com/v0/b/b/o/variants%2Fteas%2Fassam_${w}.webp?alt=media&token=x` });

describe('imageRegistry', () => {
  test('builds a width-sorted WebP srcset for the current photo', () => {
    registerImageVariants(IMG, { src: IMG, set: [v(1254), v(320), v(640)] });
    expect(variantSrcSet(IMG)).toBe(`${v(320).url} 320w, ${v(640).url} 640w, ${v(1254).url} 1254w`);
  });

  test('ignores copies made from an older photo, and malformed data', () => {
    const other = IMG.replace('assam', 'keemun');
    registerImageVariants(other, { src: IMG, set: [v(320)] });
    registerImageVariants(other, { src: other, set: [{ w: 'x', url: 'javascript:alert(1)' }] });
    expect(variantSrcSet(other)).toBeUndefined();
    expect(variantSrcSet(undefined)).toBeUndefined();
  });
});
