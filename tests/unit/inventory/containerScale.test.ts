/**
 * Container scale — 2000 g = level 10, 200 g per step.
 */
import { describe, test, expect } from 'vitest';
import {
  levelFromWeight, weightFromLevel, teaWeightSchema, CONTAINER_MAX_GRAMS, getInventoryStatus,
} from '@/features/inventory/schemas/inventory.schema';

describe('levelFromWeight', () => {
  test.each([
    [0, 0], [1, 1], [200, 1], [201, 2], [1000, 5], [1200, 6], [1801, 10], [2000, 10],
  ])('%i g → level %i', (g, level) => expect(levelFromWeight(g)).toBe(level));
  test('clamps out-of-range input', () => {
    expect(levelFromWeight(-50)).toBe(0);
    expect(levelFromWeight(5000)).toBe(10);
  });
  test('any tea left is never "out of stock"', () => {
    expect(getInventoryStatus(levelFromWeight(50))).toBe('low_stock');
    expect(getInventoryStatus(levelFromWeight(0))).toBe('out_of_stock');
  });
});

describe('weightFromLevel', () => {
  test('slider positions map to 200 g steps', () => {
    expect(weightFromLevel(0)).toBe(0);
    expect(weightFromLevel(6)).toBe(1200);
    expect(weightFromLevel(10)).toBe(CONTAINER_MAX_GRAMS);
  });
  test('round-trips', () => {
    for (let l = 0; l <= 10; l++) expect(levelFromWeight(weightFromLevel(l))).toBe(l);
  });
});

test('weight must be 0–2000 g', () => {
  expect(teaWeightSchema.safeParse(2000).success).toBe(true);
  expect(teaWeightSchema.safeParse(0).success).toBe(true);
  expect(teaWeightSchema.safeParse(2001).success).toBe(false);
  expect(teaWeightSchema.safeParse(-1).success).toBe(false);
});
