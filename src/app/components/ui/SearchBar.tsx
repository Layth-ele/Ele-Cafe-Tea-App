/**
 * SearchBar — one search input for the whole app.
 *
 * Replaces:
 *   - TeaSearchBar.tsx (storefront)
 *   - Inline <Search>+<input> patterns in AdminCustomers, AdminOrders,
 *     AdminProducts (4 different variants, 3 different sizes)
 *
 * Single source of truth for visual language, keyboard behaviors, and
 * accessibility patterns of search inputs across the app.
 *
 * Stateless / controlled: parent owns `value`, gets notified via
 * `onChange`. Internal debouncing is intentionally absent — debounce
 * strategies (useDeferredValue, setTimeout, etc.) belong at the parent
 * because they're tied to what the search actually filters and how
 * expensive that filter is.
 */

import React, { useEffect, useId, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';

import { useT } from '@/i18n/useT';
export interface SearchBarProps {
  value:        string;
  onChange:     (v: string) => void;
  placeholder?: string;

  /** Visual size variant.
   *    'md' (default): 42px tall pill — used on storefront / public pages.
   *    'sm':           38px tall — used on admin tables.
   */
  size?:        'sm' | 'md';

  /** Optional max-width — defaults to no cap (fluid). Specify when the
   *  input would otherwise stretch too wide (e.g. inside a wide admin
   *  toolbar). e.g. "320px" or "24rem". */
  maxWidth?:    string;

  /** Show a spinner instead of the magnifier when underlying data is
   *  still loading. Useful for "data fetching instantly" UX — the user
   *  knows the search is wired up but the results aren't ready yet. */
  loading?:     boolean;

  /** When set to a single character (typically '/' or 'k'), pressing
   *  that key anywhere on the page (outside other inputs) focuses this
   *  search bar. Modern pattern à la GitHub / Algolia / Notion. */
  globalShortcut?: string;

  /** ARIA label for screen readers. Defaults to the placeholder text. */
  ariaLabel?:   string;

  /** Optional id for label associations / referer hooks. Auto-generated
   *  if not provided. */
  id?:          string;

  /** Forwarded for parents that need direct DOM access (e.g. focus on
   *  mount). Most callers won't need this. */
  inputRef?:    React.Ref<HTMLInputElement>;
}

/** Icon size per variant. Other per-size values (height, padding,
 *  icon-position, clear-offset) live in CSS via .search-bar--sm vs
 *  .search-bar--md modifier classes. iconSize stays in JS because
 *  Lucide's `size` prop takes a number, not a CSS value. */
const SIZES = {
  sm: { iconSize: 14 },
  md: { iconSize: 15 },
} as const;

export function SearchBar({
  value, onChange,
  placeholder = 'Search…',
  size = 'md',
  maxWidth,
  loading = false,
  globalShortcut,
  ariaLabel,
  id,
  inputRef,
}: SearchBarProps) {
  const t = useT();
  const generatedId  = useId();
  const inputId      = id ?? `search-${generatedId}`;
  const fallbackRef  = useRef<HTMLInputElement>(null);
  const ref          = (inputRef as React.RefObject<HTMLInputElement>) ?? fallbackRef;
  const dims         = SIZES[size];

  // Global keyboard shortcut: pressing the configured key while focus
  // is NOT in another input/textarea/contenteditable focuses this
  // search bar. Standard pattern — GitHub uses '/', macOS apps use 'k'
  // (with Cmd modifier). Skip when modifier keys are held so we don't
  // hijack actual shortcuts.
  useEffect(() => {
    if (!globalShortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== globalShortcut) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
      e.preventDefault();
      ref.current?.focus();
      // Place cursor at end so existing query stays visible
      const v = ref.current?.value ?? '';
      ref.current?.setSelectionRange(v.length, v.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [globalShortcut, ref]);

  // Esc clears the field while it's focused — universal expectation.
  // (Not handled at window level because Esc has other meanings
  // elsewhere — closing modals, etc.)
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && value) {
      e.preventDefault();
      onChange('');
    }
  };

  // Size-table → size modifier class. Static dims (height, padding,
  // icon-position) live in CSS via .search-bar--sm vs .search-bar--md
  // selectors; this keeps a single source of truth for the JS-side
  // pixel values that don't easily live in CSS.
  const sizeMod = `search-bar--${size}`;

  return (
    <div
      role="search"
      className={`search-bar ${sizeMod}`}
      // maxWidth is caller-controlled, so it stays as an inline CSS
      // custom property the .search-bar class reads. The class owns
      // position, width, and everything else.
      /* eslint-disable-next-line react/forbid-dom-props -- caller-controlled max-width prop */
      style={maxWidth ? { '--search-bar-max-width': maxWidth } as React.CSSProperties : undefined}
    >
      {/* Leading icon — Search by default, Loader2 spinning when data
          is still arriving. Same lucide library as admin pages. */}
      {loading ? (
        <Loader2
          size={dims.iconSize}
          className="search-spinner search-bar-icon"
          aria-hidden="true"
        />
      ) : (
        <Search
          size={dims.iconSize}
          aria-hidden="true"
          className="search-bar-icon"
        />
      )}

      <input
        id={inputId}
        ref={ref}
        type="search"
        className="field search-bar-input"
        // data-has-value lets CSS swap padding-right between the
        // "no clear button" and "clear button visible" states without
        // recomputing inline styles per render.
        data-has-value={Boolean(value)}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />

      {/* Clear-x — only when there's something to clear. Has its own
          focus ring + aria-label. Tab order: input → clear button. */}
      {value && (
        <button
          type="button"
          onClick={() => { onChange(''); ref.current?.focus(); }}
          aria-label={t('Clear search')}
          className="search-bar-clear"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M2 2l6 6M8 2L2 8" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}
