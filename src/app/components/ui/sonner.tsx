/**
 * Toaster — global toast/notification surface for the app.
 *
 * Uses `sonner` under the hood but skins it heavily so the
 * notifications match the brand:
 *   • Cream surface, midnight text, gold accent borders
 *   • Brand serif for the title, sans for the body
 *   • Larger touch target on mobile, tighter on desktop
 *   • Repositions to top-center on narrow viewports (bottom-center
 *     conflicts with the home-indicator + bottom-nav on phones)
 *   • Auto-flips colors in dark mode via existing CSS vars
 *
 * Why not sonner's `richColors` flag:
 *   richColors hard-codes saturated green/red/orange that don't
 *   read as premium against our muted cream/gold palette. We map
 *   sonner's `--success`, `--error`, `--warning`, `--info` slots
 *   to our existing semantic tokens so toasts feel like part of
 *   the brand.
 *
 * Why a separate wrapper instead of inline props:
 *   The Toaster mount lives in `App.tsx` which is already huge.
 *   Putting all this skinning here keeps the mount site clean
 *   (`<Toaster />`) and gives us one place to tweak everything.
 */
"use client";

import { useEffect, useState } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Hook: report whether the viewport is below the mobile breakpoint.
 *  Re-runs on resize so position swaps if the user rotates a tablet. */
function useIsMobile(breakpoint = 600): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    // addEventListener is correct here — addListener is deprecated.
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [breakpoint]);
  return isMobile;
}

const Toaster = ({ ...props }: ToasterProps) => {
  const isMobile = useIsMobile();

  return (
    <Sonner
      // Inherit the page's color scheme — sonner's "system" mode
      // reads `prefers-color-scheme`, but we drive theme via a
      // `.dark` class on `html`, so we let our CSS-var overrides do
      // the work and pick a stable mode here. "light" is the safe
      // base; tokens swap under .dark automatically.
      theme="light"
      // Bottom-center on desktop, top-center on phones. Phones have
      // a home indicator + safe-area inset at the bottom, plus the
      // user's thumb is usually there — top-center reads cleaner.
      position={isMobile ? "top-center" : "bottom-center"}
      // Disable richColors so our token-mapped vars win. With it on,
      // sonner injects hard-coded greens/reds that fight the brand.
      richColors={false}
      // Close button on every toast — improved styling via the
      // class hooks below.
      closeButton
      duration={3000}
      visibleToasts={3}
      gap={10}
      offset={isMobile ? 16 : 24}
      // expand=true makes stacked toasts visible at once (sonner's
      // default collapses them into a single visual pile until hover).
      // For an admin panel where multiple ops can fire in quick
      // succession, expand reads more honestly.
      expand
      // The CSS-custom-property mapping to our brand tokens (formerly
      // an inline style block of 16 vars) is now on the `.ele-toaster`
      // class itself in design.css. Sonner reads these variables off
      // its root element, so attaching them via a class works
      // identically to attaching them via inline style.
      className="ele-toaster"
      toastOptions={{
        // Per-toast classes (what sonner exposes as data-attribute hooks).
        // We pair these with global CSS in tokens.css for the polish
        // (close button positioning, icon color, hover lift).
        classNames: {
          toast:        "ele-toast",
          title:        "ele-toast-title",
          description:  "ele-toast-description",
          actionButton: "ele-toast-action",
          cancelButton: "ele-toast-cancel",
          closeButton:  "ele-toast-close",
          success:      "ele-toast-success",
          error:        "ele-toast-error",
          warning:      "ele-toast-warning",
          info:         "ele-toast-info",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
