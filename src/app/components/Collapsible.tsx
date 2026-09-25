/**
 * Collapsible — Reusable expand/collapse section card
 *
 * Used on the Account page to let customers fold/unfold the Credits,
 * Profile Details, Saved Addresses, and Order History sections so the
 * page isn't a tall scroll-fest.
 *
 * Animation strategy:
 *   We use a CSS grid-rows trick (grid-template-rows: 0fr → 1fr) so the
 *   panel can animate height without us having to measure the child.
 *   This avoids the classic "max-height: 9999px" hack that always picks
 *   a too-small or too-large value, and works with dynamic content
 *   (e.g. address list growing/shrinking).
 *
 * Accessibility:
 *   The header is a real <button type="button"> with aria-expanded and
 *   aria-controls pointing at the panel. The icon is decorative
 *   (aria-hidden) so screen readers don't announce it twice.
 *
 * State persistence (optional):
 *   Pass a `storageKey` to remember open/closed across reloads. If
 *   localStorage isn't available (SSR, sandboxed iframe), we silently
 *   fall back to in-memory state — no thrown errors.
 */
import { useEffect, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface CollapsibleProps {
  /** Icon displayed in the gold-soft tile next to the title. */
  icon:        LucideIcon;
  /** Section heading — rendered inside an <h2>. */
  title:       string;
  /** Optional one-line subtitle / hint shown under the title (visible even when collapsed). */
  subtitle?:   string;
  /** Optional element rendered on the right side of the header (badge, count, etc.). */
  rightSlot?:  React.ReactNode;
  /** Whether the section is open by default. Ignored if a stored value is found. */
  defaultOpen?: boolean;
  /** localStorage key for remembering expanded state. Omit for in-memory only. */
  storageKey?: string;
  children:    React.ReactNode;
}

export function Collapsible({
  icon: Icon,
  title,
  subtitle,
  rightSlot,
  defaultOpen = false,
  storageKey,
  children,
}: CollapsibleProps) {
  const panelId = useId();

  // Hydrate initial state from localStorage if a key was provided. We
  // do this lazily inside useState so we don't read localStorage on
  // every re-render. Wrapped in a try/catch so SSR and privacy-mode
  // browsers don't crash.
  const [open, setOpen] = useState<boolean>(() => {
    if (!storageKey) return defaultOpen;
    try {
      const v = localStorage.getItem(storageKey);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch (err) {
      console.warn('[Collapsible] Failed to read persisted state:', err);
      /* localStorage unavailable — fall through to default */
    }
    return defaultOpen;
  });

  // Persist on toggle. Same try/catch shield as above.
  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, open ? '1' : '0'); } catch (err) {
      console.warn('[Collapsible] Failed to persist state:', err);
    }
  }, [open, storageKey]);

  return (
    <div className={`collapsible-card${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="collapsible-header"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(v => !v)}
      >
        <span className="collapsible-header-left">
          <span className="section-card-icon" aria-hidden="true">
            <Icon size={15} />
          </span>
          <span className="collapsible-header-text">
            <h2>{title}</h2>
            {subtitle && <span className="collapsible-subtitle">{subtitle}</span>}
          </span>
        </span>
        <span className="collapsible-header-right">
          {rightSlot}
          <span className="collapsible-chevron" aria-hidden="true">
            <ChevronDown size={16} />
          </span>
        </span>
      </button>

      {/* Grid-row animation wrapper — collapses 0fr ↔ 1fr smoothly. */}
      <div
        id={panelId}
        className="collapsible-panel"
        role="region"
        aria-hidden={!open}
      >
        <div className="collapsible-panel-inner">
          <div className="collapsible-panel-content">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default Collapsible;
