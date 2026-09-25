/**
 * Stale-bundle recovery after a deploy: every browser's "chunk missing"
 * error is recognised, and auto-reload is loop-guarded per 60 s window
 * (not per session — a second deploy in the same tab must still recover).
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { isChunkLoadError, claimAutoReload } from '../../../src/lib/chunkRecovery';

const store: Record<string, string> = {};
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
});

describe('isChunkLoadError', () => {
  test.each([
    'TypeError: Failed to fetch dynamically imported module: https://elecafe.ca/assets/x.js',
    'Error loading dynamically imported module',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/ProductsPage-abc.css',
    'Loading chunk 12 failed.',
    "Expected a JavaScript module script but the server responded with a MIME type of 'text/html'",
  ])('recognises %s', (msg) => {
    expect(isChunkLoadError(msg)).toBe(true);
    expect(isChunkLoadError(new Error(msg))).toBe(true);
  });
  test('ignores ordinary errors', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'price')"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('claimAutoReload', () => {
  beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; vi.useRealTimers(); });
  test('allows one reload, blocks a loop within 60 s, allows again later', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T10:00:00Z'));
    expect(claimAutoReload()).toBe(true);
    vi.setSystemTime(new Date('2026-09-23T10:00:30Z'));
    expect(claimAutoReload()).toBe(false);        // same failure right after reload → stop
    vi.setSystemTime(new Date('2026-09-23T11:30:00Z'));
    expect(claimAutoReload()).toBe(true);         // later deploy, same session → recover
  });
});
