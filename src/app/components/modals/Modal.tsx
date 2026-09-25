/**
 * Modal.tsx — Shared modal system for Ele Café (v3)
 *
 * What changed in v3 (the "deep layout audit" pass):
 *   1. Z-index reads from --z-modal / --z-modal-panel tokens — no more
 *      raw 800/900 sprinkled through inline styles.
 *   2. max-height uses `dvh` (dynamic viewport height) instead of `vh`
 *      so iOS Safari's URL bar doesn't crop the bottom of the panel.
 *   3. Mobile (≤480px) animation slides the panel up from the bottom
 *      instead of scaling — feels native on touch and avoids the
 *      "tiny scaled-up dialog floating in space" feel.
 *   4. Real focus trap: Tab / Shift+Tab cycle within the modal. The
 *      previous version only set initial focus then let Tab escape.
 *   5. ESC stack: when multiple modals are open (Confirm-on-top-of-Modal),
 *      only the topmost one handles Escape. Without this, dismissing a
 *      confirm closed BOTH the confirm AND its parent modal.
 *   6. `prefers-reduced-motion: reduce` — animations cut to a 1ms
 *      crossfade so vestibular-disorder users get an instant, calm
 *      transition without the dialog bouncing in.
 *   7. Backdrop blur halved on mobile (3px → 1.5px) — full blur is
 *      GPU-expensive on phones and visibly chuggy on older Android.
 *   8. Close button is a 44×44 hit target (was 32×32 — below the WCAG
 *      AAA min and below Apple's HIG recommendation).
 *   9. Keyframes moved to design.css (.app-modal-* selectors) so the
 *      <style> block isn't injected per-render.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useDrag } from '@use-gesture/react';
import { lockBodyScroll } from '@/lib/bodyScrollLock';

import { useT } from '@/i18n/useT';
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

interface ModalProps {
  open:        boolean;
  onClose:     () => void;
  title:       string;
  subtitle?:   string;
  size?:       ModalSize;
  children:    ReactNode;
  footer?:     ReactNode;
  /** Dark header (midnight bg) — used for profile/customer modals */
  darkHeader?: boolean;
  /** Danger header (red bg) — used for delete/deactivate confirmations */
  dangerHeader?: boolean;
  /** Hide close button */
  hideClose?:  boolean;
}

const MAX_W: Record<ModalSize, string> = {
  sm:  '420px',
  md:  '580px',
  lg:  '740px',
  xl:  '940px',
  // Day 16: gift-builder Step 2 needs filter sidebar (~240px)
  // + tea grid (3 cols) + chip rail. Wider than xl by design.
  xxl: '1180px',
};

// ── Modal stack (module-level) ───────────────────────────────────────────────
// Each open modal pushes a unique id on mount and pops on unmount. The ESC
// handler reads stack[stack.length - 1] and only fires close() if this
// modal is the topmost. Without this, ESC closes every open modal at once
// — a real UX bug when an admin had a Confirm dialog over a parent edit
// modal: ESC dismissed both, losing all the form state behind.
const modalStack: number[] = [];
let nextModalId = 1;

export function Modal({
  open, onClose, title, subtitle, size = 'md',
  children, footer, darkHeader, dangerHeader, hideClose,
}: ModalProps) {
  const t = useT();

  // Stable id for stack ordering. Allocated lazily on first mount.
  const idRef = useRef<number | null>(null);
  if (idRef.current === null) idRef.current = nextModalId++;

  // ── Push/pop on stack as open toggles ────────────────────────────
  useEffect(() => {
    if (!open) return;
    const id = idRef.current!;
    modalStack.push(id);
    return () => {
      const i = modalStack.indexOf(id);
      if (i !== -1) modalStack.splice(i, 1);
    };
  }, [open]);

  // ── Body scroll lock (ref-counted, see src/lib/bodyScrollLock.ts) ─
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  // ── Escape key — top-of-stack only ────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Only the topmost modal handles ESC. Prevents a confirm-over-modal
      // from cascading-closing the parent.
      if (modalStack[modalStack.length - 1] !== idRef.current) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // ── Focus trap ────────────────────────────────────────────────────
  // Captures Tab and Shift+Tab to keep keyboard focus inside the panel.
  // Initial focus goes to the first focusable element OR the panel
  // itself (which has tabIndex=-1) so screen readers announce the
  // dialog from its accessible name.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    // Capture the element that triggered the modal so we can restore
    // focus to it when the modal closes — standard a11y pattern.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Initial focus: first focusable child if present, otherwise the
    // panel. Delay one tick so the open animation has started — focusing
    // a not-yet-painted element causes a layout flash on iOS Safari.
    const focusInitial = window.setTimeout(() => {
      const focusables = getFocusable(panel);
      if (focusables.length > 0) focusables[0].focus();
      else panel.focus();
    }, 50);

    // Tab / Shift+Tab trap.
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      // Only trap if THIS modal is topmost. A confirm-over-modal needs
      // its own trap too, but only the topmost should consume the event.
      if (modalStack[modalStack.length - 1] !== idRef.current) return;

      const focusables = getFocusable(panel);
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', trap);

    return () => {
      window.clearTimeout(focusInitial);
      window.removeEventListener('keydown', trap);
      // Restore focus to the trigger when modal closes — but only if the
      // current focus is inside our panel (otherwise something else has
      // legitimately taken focus and we shouldn't yank it back).
      if (previouslyFocused && panel.contains(document.activeElement)) {
        try { previouslyFocused.focus(); } catch (err) {
          console.warn('[Modal] Failed to restore focus to trigger:', err);
        }
      }
    };
  }, [open]);

  // ── Phase 9.3 — Swipe-down-to-dismiss (touch only, mobile only) ────
  // On mobile viewports (<= 480px) the modal animates UP from the
  // bottom — it's effectively a bottom sheet. The natural dismissal
  // gesture there is swipe-down, matching iOS native sheets and
  // Android Material bottom sheets. Desktop modals are centered
  // dialogs and don't get a swipe affordance (mouse users have
  // Escape + close button + backdrop click, which satisfies WCAG
  // 2.5.1's alternate gesture rule).
  //
  // dragY is the live translateY in px during the gesture. We bind
  // it through a CSS custom property (`--md-drag-y`) so the existing
  // bottom-sheet transform composes additively. Threshold for commit:
  // dragged > 30% of the panel height OR flicked downward faster
  // than 0.5 px/ms.
  const [dragY, setDragY] = useState(0);
  const bindSwipe = useDrag(
    ({ down, movement: [, my], velocity: [, vy], direction: [, dy], cancel }) => {
      // Only respond to downward drags. Upward overdrag is allowed
      // (rubber-band) but the panel doesn't translate further up.
      const clamped = Math.max(0, my);
      if (down) {
        setDragY(clamped);
      } else {
        const panel = panelRef.current;
        const panelHeight = panel?.offsetHeight ?? 600;
        const draggedFraction = clamped / panelHeight;
        const fastFlickDown = vy > 0.5 && dy > 0;
        if (draggedFraction > 0.30 || fastFlickDown) {
          setDragY(0);
          onClose();
          cancel();
        } else {
          setDragY(0);
        }
      }
    },
    {
      // Vertical axis only — horizontal drags inside the modal body
      // (e.g. an image carousel) should not be hijacked by this gesture.
      axis: 'y',
      // Touch only. Desktop users have Escape + close button + backdrop;
      // hijacking mouse-down for swipe would break those.
      pointer: { touch: true, mouse: false },
      filterTaps: true,
    },
  );

  // Reset drag offset when the modal opens or closes by any other
  // path (Escape, backdrop click, close button, route change).
  useEffect(() => {
    if (!open) setDragY(0);
  }, [open]);

  if (!open) return null;

  // Header tone: 'default' | 'dark' | 'danger'. Derived from the two
  // boolean props so the data attribute can drive every header variant
  // (background, text colour, sub colour, border, close-button surround)
  // from CSS instead of branching on each colour at render time.
  const tone = dangerHeader ? 'danger' : darkHeader ? 'dark' : 'default';  // Class hooks — keyframes + media-aware backdrop blur live in design.css
  // so they don't get re-injected per render.
  return createPortal(
    <>
      {/* ── Overlay ────────────────────────────────────────────────────── */}
      <div
        className="app-modal-overlay"
        onClick={onClose}
        // z-index from the design token. Inline string-as-style works
        // because React passes through CSS variables verbatim.
        // eslint-disable-next-line react/forbid-dom-props -- z-index var sourced from design tokens, set inline so the portal always layers above all in-page content
        style={{ zIndex: 'var(--z-modal)' as unknown as number }}
      />

      {/* ── Panel ──────────────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={panelRef}
        tabIndex={-1}
        className="app-modal-panel"
        data-dragging={dragY > 0 ? 'true' : 'false'}
        onClick={e => e.stopPropagation()}
        // eslint-disable-next-line react/forbid-dom-props -- z-index var + width clamp + per-instance drag custom property (live touch input)
        style={{
          zIndex: 'var(--z-modal-panel)' as unknown as number,
          width: `min(${MAX_W[size]}, calc(100vw - 32px))`,
          ['--md-drag-y' as string]: `${dragY}px`,
        }}
        {...bindSwipe()}
      >
        {/* Header */}
        <div className="md-header" data-tone={tone}>
          <div className="md-header-info">
            <h2 id="modal-title" className="md-title">
              {title}
            </h2>
            {subtitle && (
              <p className="md-subtitle">
                {subtitle}
              </p>
            )}
          </div>

          {!hideClose && (
            <button
              onClick={onClose}
              aria-label={t('Close')}
              type="button"
              // 44×44 hit target — was 32×32, below WCAG AAA min and
              // Apple HIG. Visual circle stays 32px via inner span.
              className={`modal-close-btn md-close${(darkHeader || dangerHeader) ? ' modal-close-dark' : ''}`}
              data-tone={tone}
            >
              <span className="md-close-circle" data-tone={tone}>
                <X size={15} />
              </span>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="md-body">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="md-footer">
            {footer}
          </div>
        )}
      </div>
    </>,
    document.body
  );
}

// ── Helper: find all focusable descendants ──────────────────────────────────
// Standard set per the W3C ARIA Authoring Practices. Excludes elements with
// tabindex="-1" (programmatic focus only), disabled controls, hidden inputs.
function getFocusable(root: HTMLElement): HTMLElement[] {
  const sel = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(el => {
    // Skip elements that are visually hidden — querySelectorAll matches
    // them but they shouldn't trap focus.
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    return true;
  });
}

// ── Confirm Modal — standardised destructive confirmation ─────────────────────
interface ConfirmModalProps {
  open:       boolean;
  onClose:    () => void;
  onConfirm:  () => void;
  title:      string;
  message:    string;
  confirmLabel?: string;
  cancelLabel?:  string;
  loading?:   boolean;
  danger?:    boolean;
}

export function ConfirmModal({
  open, onClose, onConfirm, title, message,
  confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  loading, danger = true,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open} onClose={onClose}
      title={title} size="sm"
      dangerHeader={danger}
      footer={
        <>
          <ModalBtn variant="outline" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </ModalBtn>
          <ModalBtn
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </ModalBtn>
        </>
      }
    >
      <p className="md-confirm-msg">
        {message}
      </p>
    </Modal>
  );
}

// ── ModalBtn — consistent button for modal footers ────────────────────────────
type ModalBtnVariant = 'primary' | 'outline' | 'danger' | 'success';

interface ModalBtnProps {
  variant?:   ModalBtnVariant;
  onClick?:   () => void;
  disabled?:  boolean;
  loading?:   boolean;
  children:   ReactNode;
  type?:      'button' | 'submit';
  fullWidth?: boolean;
}

export function ModalBtn({ variant = 'primary', onClick, disabled, loading, children, type = 'button', fullWidth }: ModalBtnProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`modal-btn md-btn${fullWidth ? ' md-btn-full' : ''}`}
      data-variant={variant}
    >
      {loading ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className="icon-spin md-btn-spinner">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          {typeof children === 'string' ? children.replace(/…$/, '') + '…' : children}
        </>
      ) : children}
    </button>
  );
}
