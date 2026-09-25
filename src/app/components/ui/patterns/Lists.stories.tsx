/**
 * List / Table pattern stories — Phase 2.3
 *
 * Three list-display modes, picked per use case:
 *
 *   - Pagination       — finite, navigable. Admin tables, search
 *                        results, archives. URL-driven (?page=2).
 *   - Infinite scroll  — discovery feeds, products grid. Loads more
 *                        as the user reaches the sentinel. Save scroll
 *                        position on back-navigation.
 *   - Virtualization   — > 1,000 rows. Only the visible window is in
 *                        the DOM. Use react-virtual or react-window.
 *
 * Real callsites use these patterns inline with their data — the
 * stories shown here are minimal contracts for the visual surface.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';

const meta = {
  title: 'Patterns/Lists & Tables',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Three list-display modes — pagination (finite + URL-driven), ' +
          'infinite scroll (discovery feed), virtualization (>1,000 rows). ' +
          'Each story illustrates the structural choice; real callsites ' +
          'wire their data into the same shapes.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Helpers ────────────────────────────────────────────────────────
const ROWS = Array.from({ length: 25 }, (_, i) => ({
  id:     `id-${i + 1}`,
  name:   ['Royal Green', 'Earl Grey', 'Jasmine Pearl', 'Sencha', 'Pu-erh'][i % 5] + ` ${i + 1}`,
  price:  Number((Math.random() * 20 + 5).toFixed(2)),
  stock:  Math.floor(Math.random() * 50),
}));

// ── Stories ───────────────────────────────────────────────────────

export const Paginated: Story = {
  name: '1 — Pagination (finite)',
  render: () => {
    function PaginatedDemo() {
      const [page, setPage] = useState(1);
      const perPage = 5;
      const total = ROWS.length;
      const totalPages = Math.ceil(total / perPage);
      const start = (page - 1) * perPage;
      const slice = ROWS.slice(start, start + perPage);

      return (
        <div style={{ maxWidth: 560 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: 10 }}>Name</th>
                <th style={{ padding: 10 }}>Price</th>
                <th style={{ padding: 10 }}>Stock</th>
              </tr>
            </thead>
            <tbody>
              {slice.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 10 }}>{r.name}</td>
                  <td style={{ padding: 10 }}>${r.price.toFixed(2)}</td>
                  <td style={{ padding: 10 }}>{r.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, fontSize: 13 }}>
            <p style={{ color: 'var(--muted)' }}>
              Showing {start + 1}–{Math.min(start + perPage, total)} of {total}
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn-outline btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                ← Previous
              </button>
              <span style={{ padding: '6px 12px', fontWeight: 600 }}>{page} / {totalPages}</span>
              <button type="button" className="btn btn-outline btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                Next →
              </button>
            </div>
          </div>
        </div>
      );
    }
    return <PaginatedDemo />;
  },
};

export const InfiniteScroll: Story = {
  name: '2 — Infinite scroll',
  render: () => {
    function InfiniteDemo() {
      const [visible, setVisible] = useState(8);
      const allLoaded = visible >= ROWS.length;
      return (
        <div style={{ maxWidth: 560 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {ROWS.slice(0, visible).map(r => (
              <div key={r.id} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.name}</div>
                <div style={{ color: 'var(--muted)' }}>${r.price.toFixed(2)} · {r.stock} in stock</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            {allLoaded ? (
              <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>You've reached the end.</p>
            ) : (
              <button type="button" className="btn btn-outline" onClick={() => setVisible(v => v + 8)}>
                Load more
              </button>
            )}
          </div>
        </div>
      );
    }
    return <InfiniteDemo />;
  },
};

export const Virtualized: Story = {
  name: '3 — Virtualized (>1,000 rows)',
  render: () => {
    function VirtualizedDemo() {
      // Visualised: render a fixed-height scroll container with a tall
      // inner sentinel that represents 10,000 rows worth of height. Only
      // the visible window is "rendered" — the rest is conceptual. In
      // production, plug react-virtual or react-window in here.
      const TOTAL = 10000;
      const ROW_H = 36;
      const containerH = 300;
      const [scrollTop, setScrollTop] = useState(0);
      const startIdx = Math.floor(scrollTop / ROW_H);
      const endIdx = Math.min(TOTAL, startIdx + Math.ceil(containerH / ROW_H) + 2);

      return (
        <div style={{ maxWidth: 560 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
            {TOTAL.toLocaleString()} rows; only the visible window renders to the DOM. Scroll the box →
          </p>
          <div
            onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
            style={{
              height: containerH,
              overflow: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 6,
              position: 'relative',
            }}
          >
            {/* Tall spacer */}
            <div style={{ height: TOTAL * ROW_H, position: 'relative' }}>
              {Array.from({ length: endIdx - startIdx }, (_, i) => {
                const idx = startIdx + i;
                return (
                  <div
                    key={idx}
                    style={{
                      position: 'absolute',
                      top: idx * ROW_H,
                      left: 0,
                      right: 0,
                      height: ROW_H,
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 12px',
                      fontSize: 13,
                      borderBottom: '1px solid var(--border)',
                      background: idx % 2 ? 'var(--surface)' : 'transparent',
                    }}
                  >
                    Row #{idx + 1}
                  </div>
                );
              })}
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
            DOM nodes: {endIdx - startIdx} (vs {TOTAL.toLocaleString()} if all were rendered)
          </p>
        </div>
      );
    }
    return <VirtualizedDemo />;
  },
};
