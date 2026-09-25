/**
 * coolerLogPdf.ts — the equipment log as a simple daily sheet for a
 * health inspector: one row per piece of equipment per day, readings in
 * GREEN when they pass and RED when they don't. Corrections are applied
 * (the corrected value is shown, marked "corrected"); the full audit
 * trail with every original entry is the CSV export.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  COOLER_MAX_F, DISHWASHER_MIN_F, dailyLogRows, type Cooler, type CoolerLogEntry, type CoolerPeriod,
} from '@/features/inventory/lib/coolerLog';

const GREEN: [number, number, number] = [22, 110, 64];
const RED: [number, number, number] = [178, 34, 34];
const INK: [number, number, number] = [27, 37, 51];
const MUTED: [number, number, number] = [110, 120, 132];

function cell(e: CoolerLogEntry | undefined): string {
  if (!e) return '—';
  // Built-in PDF fonts have no ✓/✗ glyphs — spell it out.
  const sani = e.sanitizerOk === undefined ? '' : e.sanitizerOk ? ' · sanitizer OK' : ' · sanitizer NOT OK';
  return `${e.tempF}°F${sani}${e.kind === 'correction' ? '  (corrected)' : ''}`;
}

export function generateCoolerLogPdf(
  entries: readonly CoolerLogEntry[], equipment: readonly Cooler[], from: string, to: string, generatedBy: string,
): string {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const w = doc.internal.pageSize.getWidth();
  const rows = dailyLogRows(entries, equipment);

  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...INK).text('Ele Café — Equipment Temperature Log', 40, 48);
  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(...MUTED)
    .text(`${from} to ${to}`, 40, 68)
    .text(`Coolers: pass at ${COOLER_MAX_F}°F or below (AM + PM)   ·   High-temp dishwasher: pass at ${DISHWASHER_MIN_F}°F or above with sanitizer checked (daily)`, 40, 86);
  doc.setFontSize(11).setTextColor(...GREEN).text('Green = pass', 40, 104);
  doc.setTextColor(...RED).text('Red = fail (see note)', 130, 104);

  const periods: CoolerPeriod[] = ['AM', 'PM', 'DAY'];
  const body = rows.map((r) => {
    const by = [...new Set(periods.map((p) => r.readings[p]?.loggedBy).filter(Boolean))].join(', ');
    const notes = periods.map((p) => r.readings[p]?.note).filter(Boolean).join(' · ');
    return r.kind === 'dishwasher'
      ? [r.date, r.equipment, { content: cell(r.readings.DAY), colSpan: 2 }, by, notes]
      : [r.date, r.equipment, cell(r.readings.AM), cell(r.readings.PM), by, notes];
  });

  autoTable(doc, {
    startY: 118,
    head: [['Date', 'Equipment', 'AM', 'PM', 'Checked by', 'Notes']],
    body: body.length ? body : [[{ content: 'No entries in this period.', colSpan: 6 }]],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 11, cellPadding: 7, textColor: INK, lineColor: [220, 223, 216], lineWidth: 0.5, valign: 'middle' },
    headStyles: { fillColor: [27, 41, 64], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 11 },
    alternateRowStyles: { fillColor: [247, 248, 245] },
    columnStyles: {
      0: { cellWidth: 82 },
      1: { cellWidth: 170, fontStyle: 'bold' },
      2: { cellWidth: 108, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 108, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 100 },
      5: { cellWidth: 'auto', textColor: MUTED, fontSize: 10 },
    },
    didParseCell: (data) => {
      if (data.section !== 'body' || (data.column.index !== 2 && data.column.index !== 3)) return;
      const r = rows[data.row.index];
      if (!r) return;
      const e = r.kind === 'dishwasher' ? r.readings.DAY : r.readings[data.column.index === 2 ? 'AM' : 'PM'];
      if (e) data.cell.styles.textColor = e.outOfRange ? RED : GREEN;
      else data.cell.styles.textColor = MUTED;
    },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(9).setTextColor(...MUTED)
        .text(`Generated ${new Date().toLocaleString('en-CA', { timeZone: 'America/Vancouver' })} by ${generatedBy} · Entries cannot be edited; corrections are recorded separately.`, 40, h - 22)
        .text(`Page ${doc.getNumberOfPages()}`, w - 80, h - 22);
    },
  });

  const filename = `equipment-log_${from}_to_${to}.pdf`;
  doc.save(filename);
  return filename;
}
