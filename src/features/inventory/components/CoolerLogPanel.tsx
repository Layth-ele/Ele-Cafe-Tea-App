/**
 * CoolerLogPanel.tsx — Equipment tab: daily food-safety checks
 * (Vancouver Coastal Health).
 *
 *   1. Today — one card per piece of equipment: coolers show their AM and
 *      PM checks side by side; the high-temperature dishwasher shows its
 *      single daily check (final rinse + sanitizer).
 *   2. Log a check — only while something is still to log today. A failed
 *      check (cooler above 40°F, dishwasher below 180°F or sanitizer not
 *      checked) requires a corrective-action note.
 *   3. History — date range, CSV (full audit) + PDF (simple daily sheet),
 *      and "Add correction" (a new entry linked to the original; nothing
 *      is ever edited — firestore.rules make the log append-only).
 *   4. Admin only — add, rename or retire equipment.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileDown, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  COOLER_MAX_F, DISHWASHER_MIN_F, allChecksDone, coolerLogCsv, currentPeriod, isOutOfRange, missingCount,
  todaySlots, vancouverDate, vancouverHour,
  type Cooler, type CoolerLogEntry, type CoolerPeriod, type EquipmentKind, type SlotStatus,
} from '@/features/inventory/lib/coolerLog';
import {
  logCoolerCorrection, logCoolerReading, saveCooler, setCoolerActive, useCoolerLogs, useCoolers,
} from '@/features/inventory/hooks/useCoolerLog';

interface CoolerLogPanelProps {
  readOnly:    boolean;
  isAdmin:     boolean;
  /** Name stamped on entries (employee name, or admin email). */
  loggedBy:    string;
  /** Auth uid of the writer (employee session or admin). */
  loggedByUid: string | null;
}

const daysAgo = (n: number) => vancouverDate(new Date(Date.now() - n * 86_400_000));
const periodLabel = (p: CoolerPeriod) => (p === 'DAY' ? 'Today' : p);
const fmtTime = (d: Date) => d.toLocaleTimeString('en-CA', { timeZone: 'America/Vancouver', hour: 'numeric', minute: '2-digit' });

function errorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  if (code.endsWith('permission-denied')) return 'Not saved — this check may already be logged, or your session ended. Refresh and try again.';
  return 'Could not save. Check your connection and try again.';
}

export function CoolerLogPanel({ readOnly, isAdmin, loggedBy, loggedByUid }: CoolerLogPanelProps) {
  const { coolers, loading: coolersLoading, error: coolersError } = useCoolers();
  const today = vancouverDate();
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(today);
  // Today's entries are always loaded for the status cards, whatever the history range.
  const todayLog = useCoolerLogs(today, today);
  const history = useCoolerLogs(from <= to ? from : to, from <= to ? to : from);

  const active = coolers.filter((c) => c.isActive);
  const days = useMemo(() => todaySlots(coolers, todayLog.entries, today, vancouverHour()), [coolers, todayLog.entries, today]);
  const missing = missingCount(days);
  const allDone = allChecksDone(days);

  const canWrite = !readOnly && !!loggedByUid;

  // ── Log form ──────────────────────────────────────────────────────────────
  const [pick, setPick] = useState<{ id: string; period: CoolerPeriod } | null>(null);
  const [temp, setTemp] = useState('');
  const [sanitizer, setSanitizer] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [correcting, setCorrecting] = useState<CoolerLogEntry | null>(null);

  // Until the employee picks, the form starts on the next open check
  // (overdue first) and moves on to the next one after each save.
  const openSlots = days.flatMap((d) => d.slots.filter((s) => !s.entry).map((s) => ({ equipment: d.equipment, slot: s })));
  const nextOpen = openSlots.find((o) => o.slot.missing) ?? openSlots.find((o) => o.slot.period === currentPeriod()) ?? openSlots[0];

  const target: Cooler | undefined = correcting
    ? coolers.find((c) => c.id === correcting.coolerId)
    : active.find((c) => c.id === pick?.id) ?? nextOpen?.equipment;
  const kind: EquipmentKind = target?.kind ?? 'cooler';
  let period: CoolerPeriod;
  if (correcting) period = correcting.period;
  else if (kind === 'dishwasher') period = 'DAY';
  else if (pick && pick.id === target?.id && pick.period !== 'DAY') period = pick.period;
  else if (nextOpen && nextOpen.equipment.id === target?.id) period = nextOpen.slot.period;
  else period = currentPeriod();

  const tempNum = temp.trim() === '' ? NaN : Number(temp);
  const tempValid = Number.isFinite(tempNum) && tempNum >= -40 && tempNum <= 212;
  const failed = tempValid && isOutOfRange(kind, tempNum, sanitizer);
  const noteRequired = failed || !!correcting;
  const noteOk = !noteRequired || note.trim().length >= 5;
  const slotTaken = !correcting && !!target
    && days.some((d) => d.equipment.id === target.id && d.slots.some((s) => s.period === period && s.entry));
  const showForm = canWrite && active.length > 0 && (!!correcting || !allDone);

  function resetForm() {
    setTemp(''); setNote(''); setSanitizer(false); setCorrecting(null); setPick(null);
  }

  function startCorrection(e: CoolerLogEntry) {
    setCorrecting(e);
    setTemp(String(e.tempF));
    setSanitizer(e.sanitizerOk === true);
    setNote('');
    requestAnimationFrame(() => document.getElementById('clp-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function pickSlot(c: Cooler, s: SlotStatus) {
    setCorrecting(null);
    setPick({ id: c.id, period: s.period });
    setSanitizer(false);
    requestAnimationFrame(() => document.getElementById('clp-temp')?.focus());
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!canWrite || !target || !tempValid || !noteOk || slotTaken || saving || !loggedByUid) return;
    setSaving(true);
    try {
      const base = {
        cooler: target, date: today, period, tempF: tempNum, note, loggedBy, loggedByUid,
        ...(kind === 'dishwasher' ? { sanitizerOk: sanitizer } : {}),
      };
      if (correcting) {
        await logCoolerCorrection(correcting, base);
        toast.success('Correction added. The original entry is kept.');
      } else {
        await logCoolerReading(base);
        toast.success(`${target.name} ${periodLabel(period) === 'Today' ? 'daily' : period} check logged: ${tempNum}°F.`);
      }
      resetForm();
    } catch (err) {
      console.error('[CoolerLogPanel] save failed', err);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const blob = new Blob([coolerLogCsv(history.entries)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `equipment-log_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    try {
      const { generateCoolerLogPdf } = await import('@/features/inventory/lib/coolerLogPdf');
      generateCoolerLogPdf(history.entries, coolers, from, to, loggedBy);
    } catch (err) {
      console.error('[CoolerLogPanel] PDF failed', err);
      toast.error('Could not create the PDF. Try the CSV export.');
    }
  }

  if (!isAdmin && !loggedByUid) {
    return (
      <div className="iit-empty">
        <p>The equipment log needs a fresh sign-in. Sign out, sign back in and enter your code again.</p>
      </div>
    );
  }
  if (coolersLoading) return <div className="iit-loading" aria-live="polite">Loading equipment…</div>;
  if (coolersError) return <div className="iit-empty"><p>{coolersError}</p></div>;

  const historyRows = [...history.entries].sort((a, b) =>
    b.date.localeCompare(a.date) || a.coolerName.localeCompare(b.coolerName) || a.period.localeCompare(b.period) || a.createdAt.getTime() - b.createdAt.getTime());

  return (
    <div className="clp">
      {/* ── 1. Today ───────────────────────────────────────────────── */}
      <section className="clp-card" aria-labelledby="clp-today">
        <div className="clp-card-head">
          <h2 id="clp-today" className="clp-h">Today’s checks</h2>
          <p className="clp-sub">
            {new Date().toLocaleDateString('en-CA', { timeZone: 'America/Vancouver', weekday: 'long', month: 'long', day: 'numeric' })}
            {' · '}
            {missing > 0
              ? <strong className="clp-missing-count">{missing} check{missing === 1 ? '' : 's'} not done</strong>
              : allDone ? 'All checks done' : 'All due checks done'}
          </p>
        </div>
        {active.length === 0 ? (
          <p className="clp-empty">No equipment set up yet.{isAdmin ? ' Add it below.' : ' Ask a manager to add it.'}</p>
        ) : (
          <ul className="clp-equip">
            {days.map(({ equipment: c, slots }) => (
              <li key={c.id} className="clp-eq">
                <div className="clp-eq-head">
                  <span className="clp-eq-name">{c.name}</span>
                  {c.kind === 'dishwasher' && <span className="clp-eq-tag">Once a day</span>}
                </div>
                <div className="clp-eq-slots" data-count={slots.length}>
                  {slots.map((s) => {
                    const state = s.entry ? (s.entry.outOfRange ? 'bad' : 'ok') : s.missing ? 'missing' : 'later';
                    const body = (
                      <>
                        <span className="clp-slot-period">{periodLabel(s.period)}</span>
                        <span className="clp-slot-val">
                          {state === 'ok' && <CheckCircle2 size={16} aria-hidden="true" />}
                          {(state === 'bad' || state === 'missing') && <AlertTriangle size={16} aria-hidden="true" />}
                          {s.entry ? `${s.entry.tempF}°F` : s.missing ? 'Not done' : 'After 12 PM'}
                        </span>
                        <span className="clp-slot-by">
                          {s.entry
                            ? `${s.entry.sanitizerOk !== undefined ? (s.entry.sanitizerOk ? 'Sanitizer ✓ · ' : 'No sanitizer · ') : ''}${s.entry.loggedBy}`
                            : canWrite ? 'Tap to log' : ' '}
                        </span>
                      </>
                    );
                    return canWrite && !s.entry ? (
                      <button key={s.period} type="button" className="clp-slot" data-state={state}
                        onClick={() => pickSlot(c, s)} aria-label={`Log ${c.name} ${periodLabel(s.period)} check`}>
                        {body}
                      </button>
                    ) : (
                      <div key={s.period} className="clp-slot" data-state={state}>{body}</div>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 2. Log a check (hidden once everything for today is logged) ── */}
      {canWrite && allDone && !correcting && (
        <section className="clp-card clp-done" aria-live="polite">
          <CheckCircle2 size={22} aria-hidden="true" />
          <div>
            <p className="clp-done-title">All checks are logged for today.</p>
            <p className="clp-sub">To fix a reading, use “Add correction” in the history below.</p>
          </div>
        </section>
      )}
      {showForm && target && (
        <section className="clp-card" id="clp-form" aria-labelledby="clp-log">
          <div className="clp-card-head">
            <h2 id="clp-log" className="clp-h">{correcting ? 'Add a correction' : 'Log a check'}</h2>
            {correcting && (
              <p className="clp-sub">
                Correcting {correcting.coolerName} · {periodLabel(correcting.period)} on {correcting.date} ({correcting.tempF}°F).
                The original entry stays in the log.{' '}
                <button type="button" className="clp-link" onClick={resetForm}>Cancel</button>
              </p>
            )}
          </div>
          <form className="clp-form" onSubmit={(e) => void submit(e)} noValidate>
            {!correcting && (
              <>
                <fieldset className="clp-field">
                  <legend className="clp-label">Equipment</legend>
                  <div className="clp-seg clp-seg--grid">
                    {active.map((c) => (
                      <label key={c.id} className="clp-seg-opt">
                        <input type="radio" name="clp-equipment" value={c.id} checked={target.id === c.id}
                          onChange={() => { setPick({ id: c.id, period: c.kind === 'dishwasher' ? 'DAY' : currentPeriod() }); setSanitizer(false); }} />
                        <span>{c.name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {kind === 'cooler' && (
                  <fieldset className="clp-field">
                    <legend className="clp-label">Check</legend>
                    <div className="clp-seg">
                      {(['AM', 'PM'] as const).map((p) => (
                        <label key={p} className="clp-seg-opt">
                          <input type="radio" name="clp-period" value={p} checked={period === p} onChange={() => setPick({ id: target.id, period: p })} />
                          <span>{p}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              </>
            )}
            <div className="clp-field">
              <label className="clp-label" htmlFor="clp-temp">
                {kind === 'dishwasher' ? 'Final rinse temperature (°F)' : 'Temperature (°F)'}
              </label>
              <input
                id="clp-temp" className="clp-input clp-temp" type="number" inputMode="decimal" step="0.1" min={-40} max={212}
                value={temp} onChange={(e) => setTemp(e.target.value)} required
                aria-invalid={temp !== '' && !tempValid} aria-describedby="clp-temp-hint"
              />
              <p id="clp-temp-hint" className="clp-hint" data-tone={failed ? 'bad' : undefined} aria-live="polite">
                {kind === 'dishwasher'
                  ? (tempValid && tempNum < DISHWASHER_MIN_F ? `Below ${DISHWASHER_MIN_F}°F — fails. Describe the corrective action below.` : `Pass: ${DISHWASHER_MIN_F}°F or higher, with sanitizer checked.`)
                  : (failed ? `Above ${COOLER_MAX_F}°F — out of range. Describe the corrective action below.` : `Pass: ${COOLER_MAX_F}°F or below.`)}
              </p>
            </div>
            {kind === 'dishwasher' && (
              <label className="clp-check" htmlFor="clp-sanitizer">
                <input id="clp-sanitizer" type="checkbox" checked={sanitizer} onChange={(e) => setSanitizer(e.target.checked)} />
                <span>
                  <strong>Sanitizer checked</strong>
                  <small>{sanitizer ? 'Sanitizer level confirmed.' : 'Leave unticked if it wasn’t OK — a note is then required.'}</small>
                </span>
              </label>
            )}
            <div className="clp-field">
              <label className="clp-label" htmlFor="clp-note">
                {correcting ? 'Reason for correction (required)' : failed ? 'Corrective action (required)' : 'Note (optional)'}
              </label>
              <textarea
                id="clp-note" className="clp-input clp-note" rows={2} maxLength={500}
                value={note} onChange={(e) => setNote(e.target.value)} required={noteRequired}
                aria-invalid={noteRequired && note !== '' && !noteOk}
                placeholder={failed ? (kind === 'dishwasher' ? 'e.g. Topped up sanitizer, re-ran the cycle, rinse reached 184°F' : 'e.g. Door was left open — closed it, moved dairy, rechecked at 38°F') : ''}
              />
            </div>
            {slotTaken && <p className="clp-hint" data-tone="bad">This check is already logged. To fix it, use “Add correction” in the history below.</p>}
            <button type="submit" className="clp-submit" disabled={!tempValid || !noteOk || slotTaken || saving}>
              {saving ? 'Saving…' : correcting ? 'Save correction' : `Save ${target.name} · ${periodLabel(period)}`}
            </button>
          </form>
        </section>
      )}

      {/* ── 3. History ─────────────────────────────────────────────── */}
      <section className="clp-card" aria-labelledby="clp-history">
        <div className="clp-card-head clp-card-head--row">
          <h2 id="clp-history" className="clp-h">History</h2>
          <div className="clp-export">
            <button type="button" className="clp-btn" onClick={exportCsv} disabled={history.loading}><Download size={14} aria-hidden="true" /> CSV</button>
            <button type="button" className="clp-btn" onClick={() => void exportPdf()} disabled={history.loading}><FileDown size={14} aria-hidden="true" /> PDF</button>
          </div>
        </div>
        <div className="clp-range">
          <label className="clp-field">
            <span className="clp-label">From</span>
            <input className="clp-input" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          </label>
          <label className="clp-field">
            <span className="clp-label">To</span>
            <input className="clp-input" type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </label>
        </div>
        {history.error ? <p className="clp-empty">{history.error}</p>
          : history.loading ? <p className="clp-empty" aria-live="polite">Loading…</p>
          : historyRows.length === 0 ? <p className="clp-empty">No entries in this period.</p>
          : (
            <div className="clp-table-wrap">
              <table className="clp-table">
                <thead>
                  <tr><th scope="col">Date</th><th scope="col">Equipment</th><th scope="col">Check</th><th scope="col">Reading</th><th scope="col">Note</th><th scope="col">Logged by</th>{canWrite && <th scope="col"><span className="sr-only">Actions</span></th>}</tr>
                </thead>
                <tbody>
                  {historyRows.map((e) => (
                    <tr key={e.id} data-out={e.outOfRange || undefined} data-kind={e.kind}>
                      <td data-label="Date" className="clp-td-date">{e.date}</td>
                      <td data-label="Equipment" className="clp-td-eq">{e.coolerName}</td>
                      <td data-label="Check" className="clp-td-check">{e.period === 'DAY' ? 'Daily' : e.period}</td>
                      <td data-label="Reading" className="clp-td-read">
                        <span className="clp-temp-val" data-pass={!e.outOfRange}>{e.tempF}°F</span>
                        {e.sanitizerOk !== undefined && <span className="clp-sani">{e.sanitizerOk ? 'Sanitizer ✓' : 'No sanitizer'}</span>}
                        {e.kind === 'correction' && <span className="clp-flag clp-flag--corr">Correction</span>}
                      </td>
                      <td data-label="Note" className="clp-td-note" data-empty={!e.note || undefined}>{e.note ?? '—'}</td>
                      <td data-label="Logged by" className="clp-td-by">
                        {e.loggedBy}
                        <span className="clp-time">{fmtTime(e.createdAt)}</span>
                      </td>
                      {canWrite && (
                        <td className="clp-actions">
                          <button type="button" className="clp-link" onClick={() => startCorrection(e)}>Add correction</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>

      {/* ── 4. Admin: equipment ───────────────────────────────────── */}
      {isAdmin && <EquipmentManager equipment={coolers} />}
    </div>
  );
}

function EquipmentManager({ equipment }: { equipment: Cooler[] }) {
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<EquipmentKind>('cooler');
  const [busy, setBusy] = useState(false);

  async function add(ev: React.FormEvent) {
    ev.preventDefault();
    const name = newName.trim();
    if (name.length < 2 || busy) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'equipment';
    const id = equipment.some((c) => c.id === slug) ? `${slug}-${Date.now().toString(36)}` : slug;
    setBusy(true);
    try {
      await saveCooler(id, name, Math.max(0, ...equipment.map((c) => c.sortOrder)) + 1, newKind);
      setNewName('');
      toast.success(`${name} added.`);
    } catch (err) {
      console.error(err);
      toast.error('Could not add the equipment.');
    } finally { setBusy(false); }
  }

  async function rename(c: Cooler, name: string) {
    if (name.trim().length < 2 || name.trim() === c.name) return;
    try { await saveCooler(c.id, name, c.sortOrder); toast.success('Renamed.'); }
    catch (err) { console.error(err); toast.error('Could not rename.'); }
  }

  return (
    <section className="clp-card" aria-labelledby="clp-equipment">
      <div className="clp-card-head">
        <h2 id="clp-equipment" className="clp-h">Equipment</h2>
        <p className="clp-sub">Coolers are checked AM and PM (pass ≤ {COOLER_MAX_F}°F); dishwashers once a day (≥ {DISHWASHER_MIN_F}°F + sanitizer). Retired equipment stops appearing in daily checks; its history stays.</p>
      </div>
      <ul className="clp-coolers">
        {equipment.map((c) => (
          <li key={c.id} className="clp-cooler" data-inactive={!c.isActive || undefined}>
            <input className="clp-input" defaultValue={c.name} aria-label={`Name for ${c.name}`} maxLength={60}
              onBlur={(e) => void rename(c, e.target.value)} />
            <span className="clp-eq-tag">{c.kind === 'dishwasher' ? 'Dishwasher' : 'Cooler'}</span>
            <button type="button" className="clp-btn" onClick={() => void setCoolerActive(c.id, !c.isActive).catch(() => toast.error('Could not update.'))}>
              {c.isActive ? 'Retire' : 'Restore'}
            </button>
          </li>
        ))}
      </ul>
      <form className="clp-cooler clp-cooler--add" onSubmit={(e) => void add(e)}>
        <input className="clp-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New equipment name" aria-label="New equipment name" maxLength={60} />
        <select className="clp-input clp-kind" value={newKind} onChange={(e) => setNewKind(e.target.value as EquipmentKind)} aria-label="Type">
          <option value="cooler">Cooler (AM + PM)</option>
          <option value="dishwasher">Dishwasher (daily)</option>
        </select>
        <button type="submit" className="clp-btn" disabled={newName.trim().length < 2 || busy}><Plus size={14} aria-hidden="true" /> Add</button>
      </form>
    </section>
  );
}
