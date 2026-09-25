/**
 * Phase 10 — Cart-fly hook.
 *
 * Provides a single `fly(sourceEl, label)` function that:
 * 1. Measures the source button's bounding rect.
 * 2. Locates the cart icon (queried by `[data-cart-icon]` or `.cart-icon`).
 * 3. Creates a fixed-position "+1" token element at the source position
 *    and animates it via CSS to the cart icon position.
 * 4. Bumps the cart icon when the token lands.
 *
 * The CSS lives in `src/styles/design.css` under
 * "PHASE 10 — State micro-animations" — `.cart-fly-token`, `cartFly`,
 * `cartBump`. Both effects are gated under
 * `prefers-reduced-motion: no-preference`.
 *
 * Why a hook and not a context: the only consumer is the
 * add-to-cart button (and its variants). No need to plumb a
 * provider; the function is stateless from React's perspective —
 * it just touches the DOM and self-cleans on animationend.
 *
 * Reference: MOTION_GUIDE.md §"Add-to-cart `+1` float".
 */
import { useCallback, useRef } from 'react';

const CART_ICON_SELECTOR = '[data-cart-icon], .cart-icon';

export function useCartFly() {
  // Track in-flight token elements so a rapid double-click doesn't
  // leak DOM nodes if the user navigates away mid-flight.
  const inFlight = useRef<HTMLElement[]>([]);

  const fly = useCallback((sourceEl: HTMLElement | null, label: string = '+1') => {
    if (!sourceEl) return;

    // Respect OS-level reduced motion. We still bump the cart icon
    // (a short scale pulse is acceptable; no translation).
    const prefersReduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const cartIcon = document.querySelector<HTMLElement>(CART_ICON_SELECTOR);

    // Bump the cart icon either way (it's a short scale, gentle).
    if (cartIcon) {
      cartIcon.dataset.bumped = 'true';
      // Clear after the bump animation finishes (~150ms) so the next
      // add-to-cart can retrigger it via attribute mutation.
      window.setTimeout(() => {
        delete cartIcon.dataset.bumped;
      }, 250);
    }

    // Reduced motion: skip the fly token entirely; the icon bump is
    // the only feedback. CSS hides .cart-fly-token under reduced
    // motion as a safety net, but we don't even create the node.
    if (prefersReduce || !cartIcon) return;

    const srcRect = sourceEl.getBoundingClientRect();
    const dstRect = cartIcon.getBoundingClientRect();

    const startX = srcRect.left + srcRect.width / 2;
    const startY = srcRect.top  + srcRect.height / 2;
    const endX   = dstRect.left + dstRect.width / 2;
    const endY   = dstRect.top  + dstRect.height / 2;

    // The token is rendered at the screen origin and animated via
    // CSS custom-property-driven translate(). This keeps the
    // animation cheap (transform/opacity only, no layout reads).
    const token = document.createElement('span');
    token.className = 'cart-fly-token';
    token.setAttribute('aria-hidden', 'true');
    token.textContent = label;
    token.style.left = '0';
    token.style.top  = '0';
    token.style.setProperty('--start-x', `${startX}px`);
    token.style.setProperty('--start-y', `${startY}px`);
    token.style.setProperty('--end-x',   `${endX}px`);
    token.style.setProperty('--end-y',   `${endY}px`);

    const cleanup = () => {
      token.remove();
      inFlight.current = inFlight.current.filter(el => el !== token);
    };
    token.addEventListener('animationend', cleanup, { once: true });
    // Safety net: if animationend doesn't fire (e.g. tab backgrounded),
    // GC the token after the slow duration + buffer.
    window.setTimeout(cleanup, 700);

    document.body.appendChild(token);
    inFlight.current.push(token);
  }, []);

  return { fly };
}
