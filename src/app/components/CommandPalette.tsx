/**
 * CommandPalette.tsx — Phase 4.3 of the UI/UX roadmap
 *
 * A single keyboard-first surface that lets a power user jump
 * anywhere: products, pages, account, cart, common actions. Open it
 * with cmd+K (mac) / ctrl+K (everywhere else) — the keyboard shortcut
 * is registered globally by the <CommandPaletteProvider> below. Close
 * with ESC, click outside, or selecting an item.
 *
 * Design intent (why we shipped this):
 *   1. Power users expect it. A repeat-customer who knows what tea
 *      they want should be one keystroke + 4 letters from cart-add,
 *      not three clicks through the nav.
 *   2. Admins NEED it. Jumping between /admin/orders/{id},
 *      /admin/products/{id}, /admin/customers/{email} all the time
 *      makes a mouse-driven nav punishingly slow. cmd+K + 3 chars +
 *      enter is the right cost for a 50-times-a-day workflow.
 *   3. Discoverability. New users don't know about every page.
 *      A palette that lists "Pairings", "Refund Policy", "Account"
 *      surfaces sections the nav menu doesn't have room for.
 *
 * Round 2 (Phase 4 finish):
 *   - Live per-tea search via Firestore subscription. Subscribed only
 *     while the palette is open to keep listener count low.
 *   - Admin group, gated on the user's admin claim.
 *
 * Keyboard contract:
 *   - cmd+K / ctrl+K → open
 *   - / (when not in an input)  → also opens (typeahead convention)
 *   - Up/Down → navigate
 *   - Enter → select highlighted
 *   - ESC → close
 *
 * Why cmdk (not custom):
 *   The library is ~3 KB gzipped and handles the typeahead UX,
 *   keyboard nav, and a11y semantics (combobox role + aria-activedescendant)
 *   correctly. Rolling our own would be ~300 lines of code and we'd
 *   get the keyboard nav wrong on the first try.
 *
 * Phase 3 status: this file's UI is built with semantic class names
 * in design.css (cmd-* block). 0 inline styles.
 */
import { Command } from 'cmdk';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useGiftsComingSoon } from '@/hooks/useGiftsComingSoon';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import {
  Home,
  Package,
  ShoppingBag,
  User,
  FileText,
  MapPin,
  LogIn,
  Gift,
  Coffee,
  Search,
  ArrowRight,
  Settings,
  BarChart2,
  Tag,
  Users,
  LayoutDashboard,
  Leaf,
} from 'lucide-react';
import { ROUTES, TEA_CATEGORIES } from '@/lib/routes';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';

import { categories } from '@/data/categories';
import { useT, localizeTea, useLang } from '@/i18n/useT';
import { useVisibleCategoryIds } from '@/hooks/useVisibleCategoryIds';
interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TeaResult {
  id: string;
  name: string;
  nameFr?: string;
  slug: string;
  category: string;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const tr = useT();
  const lang = useLang();
  const visibleCats = useVisibleCategoryIds();
  const navigate = useAdaptiveNavigate();
  const { currentUser, isAdmin } = useAuth();

  // Reset query when closed so re-opening doesn't show stale state.
  const [query_, setQuery] = useState('');
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  /* Live tea search — Firestore subscription on the `teas` collection,
   * filtered to active teas only, capped at 50 results. The subscription
   * lives only while the palette is open; closing it tears the listener
   * down. The cmdk filter handles the actual search-string matching
   * client-side, which is fast for 50 items and avoids a per-keystroke
   * Firestore query (each of which would cost a separate read). */
  const [teas, setTeas] = useState<TeaResult[]>([]);
  useEffect(() => {
    if (!open) return;
    // Composite index: teas: isActive(ASC) + name(ASC) — declared
    // in firestore.indexes.json. Pulls top 50 active teas; the
    // palette's own filter narrows by typed query.
    const q = query(
      collection(db, 'teas'),
      where('isActive', '==', true),
      orderBy('name', 'asc'),
      limit(50),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const out: TeaResult[] = [];
        snap.forEach((doc) => {
          const d = doc.data();
          if (
            typeof d.name === 'string' &&
            typeof d.slug === 'string' &&
            typeof d.category === 'string'
          ) {
            out.push({
              id: doc.id,
              name: d.name,
              nameFr: typeof d.nameFr === 'string' ? d.nameFr : undefined,
              slug: d.slug,
              category: d.category,
            });
          }
        });
        setTeas(out);
      },
      (err) => {
        // Permission errors here are common in dev (no Firebase project
        // wired). The palette degrades to its static category list,
        // which is still useful — silent failure is fine.
        console.warn('[CommandPalette] tea listener failed:', err);
        setTeas([]);
      },
    );
    return () => unsub();
  }, [open]);

  const giftsClick = useGiftsComingSoon();
  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={tr('Command palette')}
      className="cmd-dialog"
      // The wrapper div gets a backdrop click handler from cmdk;
      // we just provide the panel chrome.
      shouldFilter
      // Default placeholder; overridden via the Input prop below.
      filter={(value, search) => {
        // Substring (case-insensitive) — matches any item whose
        // text contains the search string. cmdk's default filter
        // is fuzzy-prefix-only which feels too strict here.
        return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
      }}
    >
      <div className="cmd-input-wrap">
        <Search size={16} className="cmd-input-icon" aria-hidden="true" />
        <Command.Input
          autoFocus
          placeholder={tr('Search teas, pages, actions…')}
          value={query_}
          onValueChange={setQuery}
          className="cmd-input"
        />
        <kbd className="cmd-input-kbd">{tr('ESC')}</kbd>
      </div>

      <Command.List className="cmd-list">
        <Command.Empty className="cmd-empty">{tr('No results found.')}</Command.Empty>

        {/* ── Live teas — only when there's a search term, otherwise
            the list is dominated by 50 tea names and the user can't
            see the categorical entries below. cmdk's `value`-based
            filter does the matching against tea name + category. ── */}
        {query_.length > 0 && teas.length > 0 && (
          <Command.Group heading={tr('Teas')} className="cmd-group">
            {teas.map((t) => (
              <PaletteItem
                key={t.id}
                icon={<Leaf size={14} />}
                label={localizeTea(t, lang).name}
                hint={tr(categories.find((c) => c.id === t.category)?.name ?? t.category)}
                keywords={[t.category, t.slug, t.name, 'tea']}
                onSelect={() => go(ROUTES.TEA_PROFILE(t.category, t.slug))}
              />
            ))}
          </Command.Group>
        )}

        {/* ── Pages ─────────────────────────────────────────────── */}
        <Command.Group heading={tr('Pages')} className="cmd-group">
          <PaletteItem
            icon={<Home size={14} />}
            label={tr('Home')}
            onSelect={() => go(ROUTES.HOME)}
          />
          <PaletteItem
            icon={<Package size={14} />}
            label={tr('All Teas')}
            onSelect={() => go(ROUTES.PRODUCTS)}
          />
          <PaletteItem
            icon={<Coffee size={14} />}
            label={tr('Tea pairings')}
            keywords={['pair', 'pastry', 'combo', 'food']}
            onSelect={() => go(ROUTES.PAIRINGS)}
          />
          <PaletteItem
            icon={<ShoppingBag size={14} />}
            label={tr('Cart')}
            onSelect={() => go(ROUTES.CART)}
          />
          <PaletteItem
            icon={<Gift size={14} />}
            label={tr('Gifts')}
            onSelect={() => {
              if (giftsClick()) onOpenChange(false);
              else go(ROUTES.GIFTS);
            }}
          />
          <PaletteItem
            icon={<MapPin size={14} />}
            label={tr('Visit Us')}
            onSelect={() => go(ROUTES.CONTACT)}
          />
          <PaletteItem
            icon={<FileText size={14} />}
            label={tr('About')}
            onSelect={() => go(ROUTES.ABOUT)}
          />
        </Command.Group>

        {/* ── Tea categories ────────────────────────────────────── */}
        <Command.Group heading={tr('Tea categories')} className="cmd-group">
          {TEA_CATEGORIES.filter((cat) => visibleCats.has(cat.id)).map((cat) => (
            <PaletteItem
              key={cat.id}
              icon={<Package size={14} />}
              label={tr(cat.label)}
              hint={tr('Category')}
              keywords={[cat.id, 'tea', 'category']}
              onSelect={() => go(ROUTES.PRODUCTS_CAT(cat.id))}
            />
          ))}
        </Command.Group>

        {/* ── Admin (only when isAdmin) — surfaces the high-frequency
            admin destinations. Per IA_MAP gap #3, jumping between
            admin pages is a 50-times-a-day workflow and the palette
            is the right cost for it. ── */}
        {isAdmin && (
          <Command.Group heading={tr('Admin')} className="cmd-group">
            <PaletteItem
              icon={<LayoutDashboard size={14} />}
              label={tr('Admin Overview')}
              onSelect={() => go(ROUTES.ADMIN)}
            />
            <PaletteItem
              icon={<Package size={14} />}
              label={tr('Admin · Products')}
              keywords={['admin', 'catalog']}
              onSelect={() => go(ROUTES.ADMIN_PRODUCTS)}
            />
            <PaletteItem
              icon={<ShoppingBag size={14} />}
              label={tr('Admin · Orders')}
              keywords={['admin', 'fulfilment']}
              onSelect={() => go(ROUTES.ADMIN_ORDERS)}
            />
            <PaletteItem
              icon={<Users size={14} />}
              label={tr('Admin · Customers')}
              keywords={['admin']}
              onSelect={() => go(ROUTES.ADMIN_CUSTOMERS)}
            />
            <PaletteItem
              icon={<BarChart2 size={14} />}
              label={tr('Admin · Analytics')}
              keywords={['admin', 'revenue']}
              onSelect={() => go(ROUTES.ADMIN_ANALYTICS)}
            />
            <PaletteItem
              icon={<Tag size={14} />}
              label={tr('Admin · Promotions')}
              keywords={['admin', 'discount']}
              onSelect={() => go(ROUTES.ADMIN_PROMOTIONS)}
            />
            <PaletteItem
              icon={<Settings size={14} />}
              label={tr('Admin · Settings')}
              keywords={['admin', 'config']}
              onSelect={() => go(ROUTES.ADMIN_SETTINGS)}
            />
          </Command.Group>
        )}

        {/* ── Account ───────────────────────────────────────────── */}
        <Command.Group heading={tr('Account')} className="cmd-group">
          {currentUser ? (
            <>
              <PaletteItem
                icon={<User size={14} />}
                label={tr('My Account')}
                onSelect={() => go(ROUTES.ACCOUNT)}
              />
              <PaletteItem
                icon={<Package size={14} />}
                label={tr('My Orders')}
                onSelect={() => go(ROUTES.ORDERS)}
              />
            </>
          ) : (
            <>
              <PaletteItem
                icon={<LogIn size={14} />}
                label={tr('Sign In')}
                onSelect={() => go(ROUTES.LOGIN)}
              />
              <PaletteItem
                icon={<User size={14} />}
                label={tr('Create Account')}
                onSelect={() => go(ROUTES.SIGNUP)}
              />
            </>
          )}
        </Command.Group>

        {/* ── Help & policies ───────────────────────────────────── */}
        <Command.Group heading={tr('Help')} className="cmd-group">
          <PaletteItem
            icon={<FileText size={14} />}
            label={tr('Shipping Policy')}
            onSelect={() => go(ROUTES.SHIPPING_POLICY)}
          />
          <PaletteItem
            icon={<FileText size={14} />}
            label={tr('Refund Policy')}
            onSelect={() => go(ROUTES.REFUND_POLICY)}
          />
          <PaletteItem
            icon={<FileText size={14} />}
            label={tr('Privacy Policy')}
            onSelect={() => go(ROUTES.PRIVACY_POLICY)}
          />
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}

/** Single command item — icon + label + optional hint + chevron tail. */
function PaletteItem({
  icon,
  label,
  hint,
  keywords,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  /** Extra search keywords cmdk uses for matching. */
  keywords?: string[];
  onSelect: () => void;
}) {
  // cmdk uses the value prop for matching; combine label + keywords.
  const value = [label, ...(keywords ?? [])].join(' ').toLowerCase();
  return (
    <Command.Item value={value} onSelect={onSelect} className="cmd-item">
      <span className="cmd-item-icon">{icon}</span>
      <span className="cmd-item-label">{label}</span>
      {hint && <span className="cmd-item-hint">{hint}</span>}
      <ArrowRight size={12} className="cmd-item-tail" aria-hidden="true" />
    </Command.Item>
  );
}

/* ── Provider — registers the global cmd+K hotkey ─────────────────────── */

interface ProviderProps {
  children: ReactNode;
}

/**
 * Wrap your <App /> with this. It owns the open state, registers
 * cmd+K / ctrl+K globally, and renders the palette modal at the root
 * so it's positioned consistently regardless of where in the route
 * tree the trigger came from.
 */
export function CommandPaletteProvider({ children }: ProviderProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // cmd+K (mac) or ctrl+K (everywhere else). Don't fire when an
      // input has focus AND the key isn't the modifier — we don't
      // want to hijack the user mid-typeahead in another field.
      // cmd/ctrl+K is always safe; the bare `/` shortcut is gated on
      // not-in-an-input.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      // `/` opens the palette ONLY when not already typing in an
      // input/textarea. This is the same convention as Vim, GitHub
      // search, Slack quick-switcher, etc.
      if (e.key === '/' && !isTypingInField(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Best-effort detector for "user is typing in a form field". Used
 * to decide whether `/` should open the palette or insert a literal
 * slash into the field they're editing. */
function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/* ── Adaptive navigate hook ──────────────────────────────────────────────
 *
 * Wraps react-router's `navigate` with a View Transition (Phase 4.5)
 * when the browser supports it. Falls through to a plain navigate
 * otherwise. Same call signature so consumers don't change.
 *
 * The ViewTransition API gives us a free crossfade (or any custom
 * keyframed transition the CSS layer specifies via ::view-transition-*)
 * with zero deps and full reduced-motion support. The check here is
 * a 1-line capability detection. */
function useAdaptiveNavigate() {
  const navigate = useNavigate();

  return (to: string) => {
    type DocWithVT = Document & { startViewTransition?: (cb: () => void) => unknown };
    const doc = document as DocWithVT;
    if (typeof doc.startViewTransition === 'function') {
      doc.startViewTransition(() => navigate(to));
    } else {
      navigate(to);
    }
  };
}
