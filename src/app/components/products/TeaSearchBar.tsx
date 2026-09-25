/**
 * TeaSearchBar — backward-compat re-export.
 *
 * The actual implementation has been consolidated into the canonical
 * SearchBar component at src/app/components/ui/SearchBar.tsx so the
 * whole app uses one search input. This file remains as a thin shim
 * so existing imports keep working.
 *
 * New code should import from the canonical location:
 *   import { SearchBar } from '@/app/components/ui/SearchBar';
 */

import { SearchBar, type SearchBarProps } from '@/app/components/ui/SearchBar';

/** Subset of props the old TeaSearchBar exposed. Kept for backward
 *  compatibility — internally forwards to the canonical SearchBar. */
export interface TeaSearchBarProps {
  value:        string;
  onChange:     (v: string) => void;
  placeholder?: string;
  /** Tight max-width override; defaults to 320px to match historical
   *  behavior in ProductsPage / Step2's toolbar. */
  maxWidth?:    string;
}

export function TeaSearchBar({
  value, onChange, placeholder = 'Search teas…', maxWidth = '320px',
}: TeaSearchBarProps) {
  // Forward to the canonical component. 'md' size matches the original
  // 42px pill height. globalShortcut '/' added for free — pressing /
  // anywhere on the products page now focuses the search.
  const props: SearchBarProps = {
    value, onChange, placeholder, maxWidth,
    size: 'md',
    globalShortcut: '/',
  };
  return <SearchBar {...props} />;
}
