import type { Meta, StoryObj } from '@storybook/react';
import { LazyImage } from './LazyImage';

/**
 * Performance-first image component. The story canvas is a useful
 * place to verify aspect-ratio reservation works (no layout shift)
 * and the blurhash placeholder renders correctly.
 *
 * What you should observe in each story:
 *   • The container reserves space BEFORE the image loads (no jump).
 *   • Off-screen variants stay placeholdered until they scroll in.
 *   • A blurhash placeholder decodes near-instantly to a recognizable
 *     blur, then the real image fades in on top.
 *   • Errored / missing src falls back to a TeaPlaceholder.
 *
 * Note: the unsplash images below are illustrative only — production
 * code uses the responsive helpers from `lib/imageVariants` to get
 * AVIF / WebP / fallback at multiple widths. Stories use plain URLs
 * for simplicity.
 */
const meta = {
  title:     'UI Primitives/LazyImage',
  component: LazyImage,
  parameters: { layout: 'padded' },
  argTypes:  {
    aspectRatio: {
      control: 'select',
      options: ['1/1', '4/3', '3/4', '16/9', '21/9'],
    },
    objectFit: {
      control: 'select',
      options: ['cover', 'contain', 'fill'],
    },
    priority:    { control: 'boolean' },
    borderRadius:{ control: 'text' },
  },
  args: {
    src:          'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&q=80',
    alt:          'Cup of black tea on a wooden surface',
    aspectRatio:  '1/1',
    objectFit:    'cover',
    priority:     false,
    borderRadius: '12px',
  },
} satisfies Meta<typeof LazyImage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <div style={{ width: 320 }}>
      <LazyImage {...args} />
    </div>
  ),
};

/** All four aspect ratios side-by-side. Verifies layout reservation
 *  is correct for every shape — none should "jump" when the image
 *  loads. */
export const AspectRatios: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, maxWidth: 1100 }}>
      {[
        { ar: '1/1',  label: 'Square 1:1'    },
        { ar: '4/3',  label: 'Landscape 4:3' },
        { ar: '3/4',  label: 'Portrait 3:4'  },
        { ar: '16/9', label: 'Wide 16:9'     },
      ].map(({ ar, label }) => (
        <div key={ar}>
          <LazyImage
            src="https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&q=80"
            alt={label}
            aspectRatio={ar}
            borderRadius="10px"
          />
          <small style={{ marginTop: 6, display: 'block', color: 'var(--muted)' }}>{label}</small>
        </div>
      ))}
    </div>
  ),
};

/** With priority=true — disables lazy load + sets fetchpriority=high.
 *  Use ONLY for above-the-fold images (hero, first product card on
 *  /products). Wrong choice = wasted critical-path bytes; right
 *  choice = faster LCP. */
export const Priority: Story = {
  args: {
    priority: true,
  },
  render: (args) => (
    <div style={{ width: 360 }}>
      <LazyImage {...args} />
      <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
        priority=true — fetchpriority="high", loading="eager", decoding="sync".
      </p>
    </div>
  ),
};

/** Errored / missing src — falls through to TeaPlaceholder so the
 *  layout never breaks even when the upload pipeline hasn't run. */
export const ErrorFallback: Story = {
  args: {
    src: 'https://example.invalid/this-will-404.jpg',
    alt: 'Missing image',
  },
  render: (args) => (
    <div style={{ width: 320 }}>
      <LazyImage {...args} />
      <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
        404 / unreachable URL → TeaPlaceholder fallback.
      </p>
    </div>
  ),
};

/** Object-fit variants — `cover` (default), `contain`, `fill`. */
export const ObjectFit: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 900 }}>
      {(['cover', 'contain', 'fill'] as const).map((fit) => (
        <div key={fit}>
          <LazyImage
            src="https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&q=80"
            alt={`object-fit: ${fit}`}
            aspectRatio="1/1"
            objectFit={fit}
            borderRadius="10px"
          />
          <small style={{ marginTop: 6, display: 'block', color: 'var(--muted)' }}>
            objectFit=&quot;{fit}&quot;
          </small>
        </div>
      ))}
    </div>
  ),
};

/** A 6-card grid as it'd appear on `/products`. The first card's
 *  priority=true; the rest are lazy. Demonstrates the realistic
 *  customer scenario. */
export const ProductsGrid: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 900 }}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i}>
          <LazyImage
            src="https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&q=80"
            alt={`Tea card ${i + 1}`}
            aspectRatio="1/1"
            borderRadius="12px"
            priority={i === 0}
          />
          <h4 style={{ margin: '8px 0 2px', fontSize: 14 }}>Tea card {i + 1}</h4>
          <small style={{ color: 'var(--muted)' }}>
            {i === 0 ? 'priority=true (LCP)' : 'lazy'}
          </small>
        </div>
      ))}
    </div>
  ),
};
