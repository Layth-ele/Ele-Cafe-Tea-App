/**
 * inventoryPdf.ts — Generate downloadable PDF reports of inventory.
 *
 * Three report flavors:
 *   - Full inventory
 *   - Low-stock only (1-3 level)
 *   - Out-of-stock only (0 level)
 *
 * The page is laid out with a brand header (café name + date),
 * then a table from jspdf-autotable, then a small footer ("Generated
 * by admin@<email>"). Filename includes the report type and a
 * yyyy-MM-dd timestamp so reports are easy to file.
 *
 * Why client-side generation:
 *   The inventory list is already loaded in the admin's browser via
 *   useInventoryList. Generating server-side would require a Cloud
 *   Function with the admin SDK + redundant data fetch. Client-side
 *   is faster, doesn't cost function-invocation budget, and the PDF
 *   downloads immediately.
 *
 * Future enhancements (not Turn 6):
 *   - Logo image at top (requires storing a base64'd asset)
 *   - Per-category subtotals
 *   - Inline color highlighting for low / oos rows in the full report
 *
 * Dependencies (add to package.json before deploying):
 *   "jspdf": "^2.5.1",
 *   "jspdf-autotable": "^3.8.0",
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { InventoryRow } from '@/features/inventory/hooks/useInventoryList';

export type ReportKind = 'full' | 'low_stock' | 'out_of_stock';

const TITLES: Record<ReportKind, string> = {
  full:         'Inventory Report — All Teas',
  low_stock:    'Inventory Report — Low Stock',
  out_of_stock: 'Inventory Report — Out of Stock',
};

const FILENAME_SLUGS: Record<ReportKind, string> = {
  full:         'full',
  low_stock:    'low-stock',
  out_of_stock: 'out-of-stock',
};

/** Generates the PDF and triggers a download. Returns the filename
 *  in case the caller wants to toast it. */
export function generateInventoryPdf(
  rows: InventoryRow[],
  kind: ReportKind,
  generatedByEmail?: string,
): string {
  // Filter the rows by report type. Keep the input sorted by current
  // level ascending so the most-urgent items appear first.
  const filtered = filterByKind(rows, kind);

  // ── Document setup ───────────────────────────────────────────────
  // A4 portrait, units in points (1pt = 1/72 inch). jspdf default
  // values are fine; we pin them explicitly for review predictability.
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });

  // ── Header ───────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Ele Café', 40, 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(TITLES[kind], 40, 70);

  doc.setFontSize(9);
  doc.setTextColor(120);
  const generatedAt = formatTimestamp(new Date());
  doc.text(`Generated ${generatedAt}`, 40, 86);
  if (generatedByEmail) {
    doc.text(`By: ${generatedByEmail}`, 40, 99);
  }
  doc.setTextColor(0);

  // ── Empty state ──────────────────────────────────────────────────
  // If there are no rows that match, render a friendly explanation
  // instead of an empty table — autotable would show just the headers
  // which looks broken.
  if (filtered.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(80);
    const emptyMsg =
      kind === 'low_stock'    ? 'No teas are in the low-stock band right now.' :
      kind === 'out_of_stock' ? 'No teas are out of stock right now.' :
                                'Inventory is empty.';
    doc.text(emptyMsg, 40, 140);
    doc.setTextColor(0);
  } else {
    // ── Table ──────────────────────────────────────────────────────
    autoTable(doc, {
      startY: 120,
      head: [['Tea', 'Category', 'Level', 'Status', 'Last updated', 'By']],
      body: filtered.map((r) => [
        r.name,
        r.category ?? '—',
        String(r.level),
        formatStatus(r.status),
        formatTimestamp(r.updatedAt),
        r.updatedBy || '—',
      ]),
      styles: {
        font:    'helvetica',
        fontSize: 9,
        cellPadding: 6,
        lineColor: [220, 220, 220],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: [42, 56, 73],     // matches --midnight (#2A3849)
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 245, 240], // matches --surface-2 cream
      },
      columnStyles: {
        2: { halign: 'right', cellWidth: 50 },   // Level
        3: { cellWidth: 80 },                    // Status
        4: { cellWidth: 100 },                   // Last updated
        5: { cellWidth: 90 },                    // By
      },
      didParseCell: (data) => {
        // Color-code the Status cell (column index 3) by value. Body
        // cells only — header keeps the navy from headStyles.
        if (data.section !== 'body' || data.column.index !== 3) return;
        const raw = filtered[data.row.index]?.status;
        if (raw === 'out_of_stock') {
          data.cell.styles.textColor = [160, 43, 34]; // danger red
          data.cell.styles.fontStyle = 'bold';
        } else if (raw === 'low_stock') {
          data.cell.styles.textColor = [156, 108, 18]; // amber-orange
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
  }

  // ── Save ─────────────────────────────────────────────────────────
  const ymd = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const filename = `ele-cafe-inventory-${FILENAME_SLUGS[kind]}-${ymd}.pdf`;
  doc.save(filename);
  return filename;
}

/** Filter + sort the rows for a given report kind. Exported for
 *  testability and so a future preview UI can show what would be in
 *  the PDF without re-running the generator. */
export function filterByKind(rows: InventoryRow[], kind: ReportKind): InventoryRow[] {
  const matched =
    kind === 'low_stock'    ? rows.filter((r) => r.status === 'low_stock') :
    kind === 'out_of_stock' ? rows.filter((r) => r.status === 'out_of_stock') :
                              rows;
  // Most urgent first: by level ascending, then by name for stable
  // sort tie-breaker. Most-stocked items end up at the bottom of the
  // full report; out-of-stock at the top.
  return [...matched].sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return a.name.localeCompare(b.name);
  });
}

/** Human-friendly status text for the table cell. */
function formatStatus(status: string): string {
  if (status === 'in_stock')     return 'In stock';
  if (status === 'low_stock')    return 'Low stock';
  if (status === 'out_of_stock') return 'Out of stock';
  return status;
}

/** Format date as "May 18, 2026 3:24 PM" — explicit so it's not
 *  locale-dependent at PDF-generation time (the PDF goes to whoever
 *  the admin emails it to; locale shouldn't flip mid-report). */
function formatTimestamp(d: Date): string {
  try {
    const t = d.valueOf();
    if (!Number.isFinite(t) || t === 0) return '—';
    return d.toLocaleString('en-US', {
      year:   'numeric',
      month:  'short',
      day:    'numeric',
      hour:   'numeric',
      minute: '2-digit',
    });
  } catch (err) {
    console.warn('[inventoryPdf] Failed to format timestamp:', err);
    return '—';
  }
}
