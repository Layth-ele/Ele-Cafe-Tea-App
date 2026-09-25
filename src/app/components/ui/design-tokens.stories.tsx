import type { Meta, StoryObj } from '@storybook/react';

/**
 * Design tokens — the canonical reference. Every value here lives in
 * `src/styles/tokens.css` (single source of truth, enforced by
 * stylelint).
 *
 * Pages below visualize each tier added in Phase 1 of the UI/UX
 * roadmap:
 *   - Colors          — the primary palette
 *   - Type scale      — fluid sizes via clamp()
 *   - Elevations      — shadow tiers
 *   - State surfaces  — success / warning / danger / info / neutral
 *   - Motion          — durations, easings, distances
 *   - Density         — comfortable vs dense via [data-density]
 *   - Data viz        — sequential / divergent / qualitative palettes
 *
 * Use the theme switcher in the toolbar to verify each tier flips
 * correctly between light and dark modes.
 */
const meta = {
  title:    'Design Tokens',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ── Helpers ─────────────────────────────────────────────────────── */

function Swatch({ token, label }: { token: string; label?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 130 }}>
      <div
        style={{
          height: 56,
          background: `var(${token})`,
          border: '1px solid var(--border)',
          borderRadius: 8,
        }}
        aria-hidden
      />
      <code style={{ fontSize: 11, color: 'var(--text-2)' }}>{token}</code>
      {label ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</span> : null}
    </div>
  );
}

function ShadowSwatch({ token, label }: { token: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 200 }}>
      <div
        style={{
          height: 80,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: `var(${token})`,
        }}
        aria-hidden
      />
      <div>
        <strong style={{ fontSize: 12 }}>{label}</strong>
        <br />
        <code style={{ fontSize: 11, color: 'var(--text-2)' }}>{token}</code>
      </div>
    </div>
  );
}

/* ── Stories ─────────────────────────────────────────────────────── */

export const Colors: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section>
        <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, marginBottom: 12 }}>
          Surface
        </h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Swatch token="--bg"        label="page bg" />
          <Swatch token="--surface"   label="card / popover" />
          <Swatch token="--surface-2" label="muted bg" />
          <Swatch token="--surface-3" />
          <Swatch token="--surface-4" />
        </div>
      </section>

      <section>
        <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, marginBottom: 12 }}>
          Text
        </h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Swatch token="--text"   label="body" />
          <Swatch token="--text-2" />
          <Swatch token="--text-3" />
          <Swatch token="--muted" />
          <Swatch token="--muted-2" />
        </div>
      </section>

      <section>
        <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, marginBottom: 12 }}>
          Brand — gold
        </h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Swatch token="--gold-text" label="text on light" />
          <Swatch token="--gold"      label="solid gold" />
        </div>
      </section>

      <section>
        <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, marginBottom: 12 }}>
          Status (existing)
        </h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Swatch token="--success" label="success" />
          <Swatch token="--warning" label="warning" />
          <Swatch token="--danger"  label="danger" />
          <Swatch token="--info"    label="info" />
        </div>
      </section>
    </div>
  ),
};

export const TypeScale: Story = {
  render: () => {
    const scale: Array<{ token: string; label: string }> = [
      { token: '--type-xs',   label: 'xs   — caption' },
      { token: '--type-sm',   label: 'sm   — small UI text' },
      { token: '--type-base', label: 'base — body' },
      { token: '--type-lg',   label: 'lg   — lead body' },
      { token: '--type-xl',   label: 'xl   — small heading' },
      { token: '--type-2xl',  label: '2xl  — section heading' },
      { token: '--type-3xl',  label: '3xl  — page heading' },
      { token: '--type-4xl',  label: '4xl  — display' },
      { token: '--type-5xl',  label: '5xl  — hero' },
    ];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 540 }}>
          Each size is a <code>clamp(min, preferred, max)</code> — preferred uses{' '}
          <code>vw</code> so type scales smoothly between viewport widths. Resize
          the Storybook canvas to see the fluidity.
        </p>
        {scale.map(({ token, label }) => (
          <div key={token} style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <code style={{ width: 90, fontSize: 12, color: 'var(--muted)' }}>{token}</code>
            <span style={{ fontSize: `var(${token})`, fontFamily: 'var(--font-serif)', fontWeight: 300 }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    );
  },
};

export const Elevations: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      <ShadowSwatch token="--elev-1"     label="Elevation 1 — at rest"  />
      <ShadowSwatch token="--elev-2"     label="Elevation 2 — hover"    />
      <ShadowSwatch token="--elev-3"     label="Elevation 3 — popover"  />
      <ShadowSwatch token="--elev-4"     label="Elevation 4 — modal"    />
      <ShadowSwatch token="--elev-inset" label="Inset — pressed"        />
    </div>
  ),
};

export const StateSurfaces: Story = {
  render: () => {
    const states = ['success', 'warning', 'danger', 'info', 'neutral'] as const;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          Each state has 4 vars: <code>bg</code>, <code>fg</code>, <code>border</code>, <code>solid</code>.
        </p>
        {states.map((s) => (
          <div
            key={s}
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr 1fr',
              alignItems: 'stretch',
              gap: 12,
            }}
          >
            <div style={{ alignSelf: 'center', textTransform: 'capitalize' }}>
              <strong>{s}</strong>
            </div>

            {/* Subtle pill — bg + fg + border */}
            <div
              style={{
                padding: '10px 14px',
                background: `var(--state-${s}-bg)`,
                color:      `var(--state-${s}-fg)`,
                border:     `1px solid var(--state-${s}-border)`,
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              Subtle pill — bg + fg + border
            </div>

            {/* Solid CTA */}
            <div
              style={{
                padding: '10px 14px',
                background: `var(--state-${s}-solid)`,
                color: '#fff',
                borderRadius: 8,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              Solid — for CTA / toast
            </div>
          </div>
        ))}
      </div>
    );
  },
};

export const Motion: Story = {
  render: () => {
    const durations = [
      { token: '--dur-instant', label: 'instant — 80ms' },
      { token: '--dur-fast',    label: 'fast — 150ms' },
      { token: '--dur-normal',  label: 'normal — 220ms' },
      { token: '--dur-slow',    label: 'slow — 380ms' },
      { token: '--dur-xslow',   label: 'xslow — 480ms' },
    ];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          Hover each box — it scales using the labelled duration token + the
          standard ease. With <code>prefers-reduced-motion: reduce</code>, every
          duration collapses to 1ms automatically (Phase 1 reduced-motion override).
        </p>
        {durations.map(({ token, label }) => (
          <div key={token} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <code style={{ width: 130, fontSize: 12, color: 'var(--muted)' }}>{token}</code>
            <div
              style={{
                width: 120,
                height: 56,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                cursor: 'pointer',
                transition: `transform var(${token}) var(--ease-standard), box-shadow var(${token}) var(--ease-standard)`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.06)'; e.currentTarget.style.boxShadow = 'var(--elev-3)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              hover me
            </div>
            <span style={{ fontSize: 13 }}>{label}</span>
          </div>
        ))}
      </div>
    );
  },
};

export const Density: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>
        Apply <code>data-density="dense"</code> at any subtree root to compact
        the entire subtree. Used by <code>AdminLayout</code> to make tables and
        forms tighter without per-component overrides.
      </p>

      {(['comfortable', undefined, 'dense'] as const).map((density) => {
        const wrapperProps = density === undefined ? {} : { 'data-density': density };
        const label = density ?? 'default';
        return (
          <div key={label}>
            <h4 style={{ marginBottom: 8 }}>{label}</h4>
            <div
              {...wrapperProps}
              style={{
                padding: 'var(--pad-y) var(--pad-x)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--surface)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
                {['Row 1', 'Row 2', 'Row 3'].map((r) => (
                  <div
                    key={r}
                    style={{
                      height: 'var(--row-h)',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 var(--pad-x)',
                      background: 'var(--surface-2)',
                      borderRadius: 6,
                    }}
                  >
                    {r}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  ),
};

export const DataVizPalettes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>
      <section>
        <h3 style={{ marginBottom: 8 }}>Sequential</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
          Single hue, light → dark. For ordinal magnitude (engagement intensity, stock level).
        </p>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} style={{ flex: 1, height: 48, background: `var(--viz-seq-${i})`, borderRadius: 4 }} />
          ))}
        </div>
      </section>

      <section>
        <h3 style={{ marginBottom: 8 }}>Divergent</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
          Two hues meeting at neutral midpoint. For above/below baseline (revenue vs target).
        </p>
        <div style={{ display: 'flex', gap: 4 }}>
          {['neg-3', 'neg-2', 'neg-1', 'mid', 'pos-1', 'pos-2', 'pos-3'].map((k) => (
            <div key={k} style={{ flex: 1, height: 48, background: `var(--viz-div-${k})`, borderRadius: 4 }} />
          ))}
        </div>
      </section>

      <section>
        <h3 style={{ marginBottom: 8 }}>Qualitative</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
          8 distinguishable hues for categorical data (tea categories, status badges).
        </p>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} style={{ flex: 1, height: 48, background: `var(--viz-qual-${i})`, borderRadius: 4 }} />
          ))}
        </div>
      </section>
    </div>
  ),
};
