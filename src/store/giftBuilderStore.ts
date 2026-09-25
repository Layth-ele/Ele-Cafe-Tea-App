/**
 * giftBuilderStore.ts — Zustand store for the multi-step gift bundle wizard.
 *
 * Day 16 work. Persisted to localStorage with a 30-minute idle expiry —
 * long enough to cover a typical purchase decision but short enough that
 * stale state never resurfaces a week later when the customer comes back
 * for an unrelated reason. See SPEC_DAY_16_GIFT_BUILDER.md, "Browser back
 * button" and "Resume banner" sections.
 *
 * Why a separate store and not part of cartStore?
 * -----------------------------------------------
 * The wizard is an in-progress *draft*. It only enters the cart when the
 * customer hits "Add to Cart" in Step 6 (Review). Treating it as cart
 * state would mean every keystroke in Step 5 (personalization) mutates
 * the cart — wrong scope.
 *
 * The store also owns the modal open/closed state so any component can
 * call `open()` from anywhere (the GiftsPage CTA, a future homepage CTA,
 * an "edit bundle" button in the cart drawer, etc.) without a Provider.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Product } from '@/types';
import type { BundleSlug, OccasionId } from '@/app/components/gift-builder/data/bundles';
import { findBundle } from '@/app/components/gift-builder/data/bundles';

// 30 minutes in ms. Centralized so it's tweakable from one place.
export const GIFT_BUILDER_TTL_MS = 30 * 60 * 1000;

/**
 * Wizard steps (post-split, see UI_UX_ROADMAP_PHASE_0_6 §6-step modal flow):
 *   1. Choose bundle
 *   2. Pick teas        (paid teas only — sample picker moved out)
 *   3. Pick samples     (auto-skipped when bundle.sampleCount === 0)
 *   4. Occasion         (optional — prominent "Skip" advances to 5)
 *   5. Personal info    (recipient · sender · message, required gate)
 *   6. Review           (Add to Cart)
 *
 * "One job per step" — splitting the old Step 2 (teas + samples in tabs)
 * and the old Step 3 (occasion + names + message in one form) removes
 * the cognitive load of multi-decision screens. Each step is now a
 * single, intentional choice.
 */
export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;
export const TOTAL_STEPS = 6 as const;

export interface Personalization {
  recipientName:   string;
  senderName:      string;
  occasion:        OccasionId | '';
  /** Free-text label when occasion === 'other'. Capped at 30 chars by the input. */
  customOccasion:  string;
  message:         string;
  deliveryDate:    string | null;   // ISO date string; v1 always null (date picker deferred)
}

export interface GiftBuilderState {
  isOpen:           boolean;
  step:             WizardStep;
  bundleSlug:       BundleSlug | null;
  /** Selected paid teas. Stored as full Product so we don't have to refetch
   *  for the chip list / review screen. Trimmed to the few fields we use
   *  by the persistence partializer below. */
  selectedTeas:     Product[];
  selectedSamples:  Product[];
  personalization:  Personalization;
  /** Last interaction timestamp (ms). Drives the 30-min expiry on rehydrate. */
  lastTouchedAt:    number;

  // ── Actions ────────────────────────────────────────────────────────────────
  open:             () => void;
  close:            () => void;
  reset:            () => void;
  goToStep:         (step: WizardStep) => void;

  /**
   * Compute the next visible step from a given step, honouring the
   * auto-skip rule for Step 3 (sample picker) when the active bundle
   * has sampleCount === 0 (the Taster). Returns the same step if there
   * is no next step.
   *
   * Why this lives on the store and not in the modal: the smart-skip
   * rule depends on the current bundleSlug — store state. Co-locating
   * the navigation math with the state that drives it means every
   * call site (modal Continue/Back, stepper jumps, future "Edit" links
   * in Step 6) reads from one source of truth. No more "skip step 3"
   * checks duplicated across components.
   */
  getNextStep:      (from: WizardStep) => WizardStep;
  getPrevStep:      (from: WizardStep) => WizardStep;

  /**
   * Set the bundle. Returns the LIFO-trimmed teas/samples that the caller
   * needs to confirm dropping (per spec's downgrade dialog) — empty arrays
   * if no trimming is needed. The caller (Step 1 component) is responsible
   * for showing the confirmation dialog before applying via `applyBundle`.
   */
  previewBundleChange: (slug: BundleSlug) => { droppedTeas: Product[]; droppedSamples: Product[] };
  applyBundle:      (slug: BundleSlug) => void;

  toggleTea:        (tea: Product) => void;
  toggleSample:     (tea: Product) => void;
  setPersonalization: (patch: Partial<Personalization>) => void;
}

const EMPTY_PERSONALIZATION: Personalization = {
  recipientName: '', senderName: '', occasion: '',
  customOccasion: '', message: '', deliveryDate: null,
};

const INITIAL: Pick<GiftBuilderState,
  'isOpen' | 'step' | 'bundleSlug' | 'selectedTeas' | 'selectedSamples' | 'personalization' | 'lastTouchedAt'
> = {
  isOpen: false,
  step: 1,
  bundleSlug: null,
  selectedTeas: [],
  selectedSamples: [],
  personalization: EMPTY_PERSONALIZATION,
  lastTouchedAt: 0,
};

/**
 * Touch helper — every action that mutates user-visible state bumps
 * lastTouchedAt so the 30-min expiry restarts. We deliberately do NOT
 * touch on `open()` alone — that would defeat the expiry for a user
 * who opens the modal weeks later just to look around.
 */
function touchedNow(): number { return Date.now(); }

export const useGiftBuilderStore = create<GiftBuilderState>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      // ── Modal lifecycle ───────────────────────────────────────────────────
      open:  () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      reset: () => set({ ...INITIAL, isOpen: get().isOpen }),

      // ── Step navigation ───────────────────────────────────────────────────
      goToStep: (step) => set({ step, lastTouchedAt: touchedNow() }),

      // Compute the next/prev step, auto-skipping Step 3 (samples) when
      // the active bundle has no samples to pick (Taster). The clamp
      // at 1/TOTAL_STEPS keeps callers from walking off the ends.
      //
      // We deliberately do NOT mutate state here — these are pure
      // helpers callers compose with goToStep. That keeps "compute
      // where to go" separable from "go there" and makes it trivial
      // to reuse for stepper-jump bounds checks (see GiftBuilderModal
      // `furthest`).
      getNextStep: (from) => {
        const { bundleSlug } = get();
        const skipSamples = bundleSlug ? findBundle(bundleSlug).sampleCount === 0 : false;
        let n = (from + 1) as WizardStep;
        if (n === 3 && skipSamples) n = 4 as WizardStep;
        if (n > TOTAL_STEPS) return from;
        return n;
      },
      getPrevStep: (from) => {
        const { bundleSlug } = get();
        const skipSamples = bundleSlug ? findBundle(bundleSlug).sampleCount === 0 : false;
        let p = (from - 1) as WizardStep;
        if (p === 3 && skipSamples) p = 2 as WizardStep;
        if (p < 1) return from;
        return p;
      },

      // ── Bundle selection ──────────────────────────────────────────────────
      previewBundleChange: (slug) => {
        const next = findBundle(slug);
        const { selectedTeas, selectedSamples } = get();
        // LIFO: keep the FIRST N selections (presumably more deliberate),
        // drop the LAST overflow. Spec lines 219–221.
        const droppedTeas    = selectedTeas.length    > next.teaCount
          ? selectedTeas.slice(next.teaCount)
          : [];
        const droppedSamples = selectedSamples.length > next.sampleCount
          ? selectedSamples.slice(next.sampleCount)
          : [];
        return { droppedTeas, droppedSamples };
      },

      applyBundle: (slug) => set(state => {
        const next = findBundle(slug);
        return {
          bundleSlug:       slug,
          selectedTeas:     state.selectedTeas.slice(0, next.teaCount),
          selectedSamples:  state.selectedSamples.slice(0, next.sampleCount),
          lastTouchedAt:    touchedNow(),
        };
      }),

      // ── Tea / sample selection ────────────────────────────────────────────
      // Tea/sample conflict is enforced at the UI layer (the lists exclude
      // already-picked teas); the store treats them as independent arrays.
      toggleTea: (tea) => set(state => {
        const exists = state.selectedTeas.some(t => t.id === tea.id);
        if (exists) {
          return {
            selectedTeas: state.selectedTeas.filter(t => t.id !== tea.id),
            lastTouchedAt: touchedNow(),
          };
        }
        // Cap is enforced at the UI layer with a toast — but defend in depth.
        const cap = state.bundleSlug ? findBundle(state.bundleSlug).teaCount : 0;
        if (state.selectedTeas.length >= cap) return state;
        return {
          selectedTeas: [...state.selectedTeas, tea],
          lastTouchedAt: touchedNow(),
        };
      }),

      toggleSample: (tea) => set(state => {
        const exists = state.selectedSamples.some(t => t.id === tea.id);
        if (exists) {
          return {
            selectedSamples: state.selectedSamples.filter(t => t.id !== tea.id),
            lastTouchedAt: touchedNow(),
          };
        }
        const cap = state.bundleSlug ? findBundle(state.bundleSlug).sampleCount : 0;
        if (state.selectedSamples.length >= cap) return state;
        return {
          selectedSamples: [...state.selectedSamples, tea],
          lastTouchedAt: touchedNow(),
        };
      }),

      // ── Personalization (Step 5) ──────────────────────────────────────────
      setPersonalization: (patch) => set(state => ({
        personalization: { ...state.personalization, ...patch },
        lastTouchedAt:   touchedNow(),
      })),
    }),
    {
      name: 'gift-builder',
      /**
       * Persist version. Bumped 0 → 1 with the 6-step modal split — see
       * UI_UX_ROADMAP_PHASE_0_6 §6-step modal flow. The bump forces a
       * wipe of any pre-refactor v0 localStorage on rehydrate, because
       * `step: 4` used to mean "Review" but now means "Occasion". Users
       * mid-flow during the deploy would otherwise land on the wrong
       * step with stale context. Zustand persist invalidates the state
       * on version mismatch automatically (no `migrate` needed — we
       * deliberately want a wipe).
       */
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Persist only the in-progress draft, not the open/close flag.
      // Re-opening always starts from the explicit `open()` call so we
      // never reopen the modal across tab-loads on its own.
      partialize: (state) => ({
        step:            state.step,
        bundleSlug:      state.bundleSlug,
        // Trim to the fields we actually consume in the wizard. Avoids
        // bloating localStorage when teas have long descriptions/photos.
        selectedTeas:    state.selectedTeas.map(trimTea),
        selectedSamples: state.selectedSamples.map(trimTea),
        personalization: state.personalization,
        lastTouchedAt:   state.lastTouchedAt,
      }) as Partial<GiftBuilderState>,

      // 30-minute expiry: if the persisted draft is older than the TTL,
      // wipe it on rehydrate. Better than showing the user a stale Step 4
      // a week later.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const age = Date.now() - (state.lastTouchedAt ?? 0);
        if (age > GIFT_BUILDER_TTL_MS) {
          // Mutate in-place — Zustand persist recognizes returned undefined
          // as "keep state", so we have to nuke the fields explicitly.
          state.step           = INITIAL.step;
          state.bundleSlug     = INITIAL.bundleSlug;
          state.selectedTeas   = INITIAL.selectedTeas;
          state.selectedSamples = INITIAL.selectedSamples;
          state.personalization = INITIAL.personalization;
          state.lastTouchedAt  = 0;
        }
      },
    }
  )
);

// Trim Product to just the fields the wizard renders (id, name, image,
// price, slug, category, origin). Avoids storing 79 full Product blobs in
// localStorage — most have description, ingredients, brewing instructions,
// etc., that the wizard never uses.
function trimTea(p: Product): Product {
  return {
    id:        p.id,
    name:      p.name,
    image:     p.image,
    price:     p.price,
    slug:      p.slug,
    category:  p.category,
    origin:    p.origin,
    isOrganic: p.isOrganic,
    caffeine:  p.caffeine,
    // Turn 6: stock dropped. Carry the inventory-projected fields
    // instead so any "is this tea still available" check inside the
    // wizard (or at checkout) reads the live availability signal
    // without needing the full Product re-fetched.
    available:         p.available,
    availabilityLabel: p.availabilityLabel,
  } as Product;
}
