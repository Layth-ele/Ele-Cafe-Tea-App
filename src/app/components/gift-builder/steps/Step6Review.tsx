/**
 * Step6Review.tsx — Final review screen (Step 6 of 6).
 *
 * Roadmap §6-step modal flow. Renamed from Step4Review. Two-column
 * layout: order summary on the left (60%), cost breakdown on the right
 * (40%). Stacks on mobile.
 *
 * Each section has an "Edit" link that jumps back to the relevant step,
 * preserving all selections (the store doesn't clear when stepping
 * back — see giftBuilderStore.goToStep). The step targets mirror the
 * 6-step wizard one-to-one — one section per step:
 *   Bundle        → 1
 *   Teas          → 2
 *   Samples       → 3   (section hidden when bundle.sampleCount === 0)
 *   Occasion      → 4
 *   For (recipient + sender) → 5
 *   Card message  → 5
 *
 * Inline-style fix: the thumbnail size used to be
 * `style={{ width: thumbSize }}` on LazyImage, with two call sites
 * passing 36 (samples) and 44 (teas). Replaced with utility classes
 * `s4-thumb-sm` / `s4-thumb-lg` that ride alongside the existing
 * `s4-list-thumb` className. No more inline width.
 *
 * Save-for-later button is deferred per spec line 401. "Add to Cart"
 * leads into the existing checkout flow: cartStore.addBundle() →
 * cart drawer opens → user clicks Checkout → CheckoutPage.
 */

import React from 'react';
import { Pencil } from 'lucide-react';
import { useGiftBuilderStore } from '@/store/giftBuilderStore';
import { useSettings } from '@/hooks/useSettings';
import { findBundle, OCCASIONS } from '@/app/components/gift-builder/data/bundles';
import { CostBreakdown } from '@/app/components/gift-builder/components/CostBreakdown';
import { MessagePreview } from '@/app/components/gift-builder/components/MessagePreview';
import { LazyImage } from '@/app/components/LazyImage';

import { useT } from '@/i18n/useT';
export function Step6Review() {
  const tr = useT();
  const bundleSlug      = useGiftBuilderStore(s => s.bundleSlug);
  const selectedTeas    = useGiftBuilderStore(s => s.selectedTeas);
  const selectedSamples = useGiftBuilderStore(s => s.selectedSamples);
  const personalization = useGiftBuilderStore(s => s.personalization);
  const goToStep        = useGiftBuilderStore(s => s.goToStep);

  const settings = useSettings();
  const bundle   = bundleSlug ? findBundle(bundleSlug) : null;

  if (!bundle) {
    return (
      <p className="s4-fallback">
        {tr('No bundle selected. Go back to Step 1.')}
      </p>
    );
  }

  const occasionMeta = OCCASIONS.find(o => o.id === personalization.occasion);
  const occasionLabel =
    personalization.occasion === 'other' && personalization.customOccasion
      ? personalization.customOccasion
      : (occasionMeta?.label ? tr(occasionMeta.label) : '—');

  return (
    <div className="gb-step6-layout">
      {/* ── Left: order details ─────────────────────────────────────────── */}
      <div className="s4-left">
        <Section title={tr('Bundle')} onEdit={() => goToStep(1)}>
          <div className="s4-bundle-row">
            <div className="s4-bundle-thumb">
              ✦
            </div>
            <div>
              <div className="s4-bundle-name">
                {tr(bundle.name)}
              </div>
              <div className="s4-bundle-includes">
                {bundle.includes.map((l) => tr(l)).join(' · ')}
              </div>
            </div>
          </div>
        </Section>

        {/* Teas — Edit jumps to Step 2 (teas-only step). */}
        <Section title={tr('Selected teas ({count})', { count: selectedTeas.length })} onEdit={() => goToStep(2)}>
          {selectedTeas.length === 0 ? (
            <Empty>{tr('No teas selected.')}</Empty>
          ) : (
            <ItemList
              items={selectedTeas.map(t => ({
                id:    t.id ?? t.slug ?? t.name ?? '',
                name:  t.name ?? '—',
                image: t.image ?? '',
                sub:   t.origin ? `from ${t.origin}` : undefined,
              }))}
              thumbClass="s4-thumb-lg"
            />
          )}
        </Section>

        {/* Samples — Edit jumps to Step 3 (samples-only step). Hidden
            entirely when the bundle has no samples (Taster). */}
        {bundle.sampleCount > 0 && (
          <Section title={tr('Free samples ({count})', { count: selectedSamples.length })} onEdit={() => goToStep(3)}>
            {selectedSamples.length === 0 ? (
              <Empty>{tr('No samples selected.')}</Empty>
            ) : (
              <ItemList
                items={selectedSamples.map(t => ({
                  id:    t.id ?? t.slug ?? t.name ?? '',
                  name:  t.name ?? '—',
                  image: t.image ?? '',
                  sub:   t.origin ? `from ${t.origin}` : undefined,
                }))}
                thumbClass="s4-thumb-sm"
              />
            )}
          </Section>
        )}

        {/* Occasion — its own section so Edit jumps straight to Step 4
            where the picker lives. Previously this was crammed into a
            combined "For" section whose Edit landed on Step 5; the user
            then had to click Back to actually change the occasion. */}
        <Section title={tr('Occasion')} onEdit={() => goToStep(4)}>
          {personalization.occasion ? (
            <span className="s4-occasion">
              {occasionMeta?.icon && <span>{occasionMeta.icon}</span>}
              {occasionLabel}
            </span>
          ) : (
            <Empty>{tr('No occasion — gifted just because.')}</Empty>
          )}
        </Section>

        {/* Recipient + Sender — Edit jumps to Step 5 where the visible
            fields live. Occasion is a separate section above. */}
        <Section title={tr('For')} onEdit={() => goToStep(5)}>
          <div className="s4-for-grid">
            <SummaryRow label={tr('Recipient')} value={personalization.recipientName || <Empty inline>—</Empty>} />
            <SummaryRow label={tr('Sender')}    value={personalization.senderName    || <Empty inline>—</Empty>} />
          </div>
        </Section>

        <Section title={tr('Card message')} onEdit={() => goToStep(5)}>
          <MessagePreview
            message={personalization.message}
            recipientName={personalization.recipientName}
            senderName={personalization.senderName}
          />
        </Section>
      </div>

      {/* ── Right: cost breakdown ─────────────────────────────────────────── */}
      <div className="gb-step6-cost">
        <CostBreakdown
          bundleName={bundle.name}
          bundlePrice={bundle.price}
          freeShippingThreshold={settings.freeShippingThreshold}
          flatShippingFee={Number(settings.defaultShippingFee) || 12.99}
          bundleGstApplicable={false}
          // Bundles are a curated premium offering — shipping is always
          // included as part of the gift experience, regardless of the
          // bundle's price relative to the free-shipping threshold.
          alwaysFreeShipping={true}
        />
      </div>
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────
function Section({ title, onEdit, children }: {
  title: string; onEdit: () => void; children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="s4-section">
      <div className="s4-section-head">
        <span className="s4-section-title">
          {title}
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="s4-section-edit"
        >
          <Pencil size={11} />
          {t('Edit')}
        </button>
      </div>
      {children}
    </div>
  );
}

interface ListItem { id: string; name: string; image: string; sub?: string }
function ItemList({ items, thumbClass }: {
  items: ListItem[];
  /** `s4-thumb-lg` (44px) for paid teas, `s4-thumb-sm` (36px) for samples.
   *  The two sizes are deliberate hierarchy: paid teas are the headline,
   *  samples ride along. */
  thumbClass: 's4-thumb-sm' | 's4-thumb-lg';
}) {
  return (
    <ul className="s4-list">
      {items.map((it, idx) => (
        <li key={it.id || `${it.name}-${idx}`} className="s4-list-row">
          <LazyImage
            src={it.image}
            alt={it.name}
            aspectRatio="1/1"
            borderRadius="var(--radius-sm)"
            className={`s4-list-thumb ${thumbClass}`}
          />
          <div className="s4-list-info">
            <div className="s4-list-name">
              {it.name}
            </div>
            {it.sub && (
              <div className="s4-list-sub">{it.sub}</div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <span className="s4-summary-label">
        {label}
      </span>
      <span className="s4-summary-value">{value}</span>
    </>
  );
}

function Empty({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  if (inline) {
    return <span className="s4-empty-inline">{children}</span>;
  }
  return (
    <p className="s4-empty-block">
      {children}
    </p>
  );
}
