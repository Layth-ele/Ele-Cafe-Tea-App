/**
 * AdminVerificationAnalytics — verification flow dashboard.
 *
 * Tracks four event types from /verificationEvents:
 *   • modal_shown     — verification modal opened
 *   • resend_clicked  — user clicked resend
 *   • verified        — verification check returned true
 *   • action_blocked  — gated action intercepted (order/review)
 *
 * Headline metrics (deduped by userId):
 *   • Unique users who saw the modal
 *   • Unique users who clicked Resend (+ raw click total)
 *   • Unique users who verified
 *   • Unique users who hit a blocked action (+ raw block total)
 *
 * Filter:
 *   • Today / 3 days / week / 2 weeks / month / 3 months / custom range
 *
 * Per-user table sorted by resend clicks DESC: surfaces "stuck" users
 * who clicked resend repeatedly (likely needs admin to manually mark
 * email_verified=true in Firebase Console).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  collection, onSnapshot, query, where, orderBy, Timestamp, limit,
} from 'firebase/firestore';
import { Calendar, CheckCircle2, Clock, Mail, RefreshCw, ShieldAlert, Users } from 'lucide-react';
import { db } from '@/lib/firebase';
import { SeoHead } from '@/app/components/SeoHead';

import { AdminPageHeader } from '@/app/components/admin/AdminPageHeader';
type EventName = 'modal_shown' | 'resend_clicked' | 'verified' | 'action_blocked';

interface EventRow {
  id:         string;
  userId:     string;
  event:      EventName;
  reason:     string;
  isVerified: boolean;
  userAgent:  string;
  pageUrl:    string;
  createdAt:  Date | null;
}

type Preset = 'today' | 'last3' | 'last7' | 'last14' | 'last30' | 'last90' | 'custom';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today',  label: 'Today'         },
  { value: 'last3',  label: 'Last 3 days'   },
  { value: 'last7',  label: 'Last week'     },
  { value: 'last14', label: 'Last 2 weeks'  },
  { value: 'last30', label: 'Last month'    },
  { value: 'last90', label: 'Last 3 months' },
  { value: 'custom', label: 'Custom range'  },
];

const MAX_DOCS = 5000;

function presetToRange(p: Preset, customStart?: Date, customEnd?: Date): { start: Date; end: Date } {
  // Custom range path — both ends come from the user's date inputs.
  if (p === 'custom' && customStart) {
    const s = new Date(customStart);  // clone — never mutate the arg
    s.setHours(0, 0, 0, 0);
    const e = customEnd ? new Date(customEnd) : new Date();
    e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }
  // Preset path — end is ALWAYS "right now, end of day", regardless of
  // whatever lingering value the custom date inputs happen to hold.
  // The previous version did `const end = customEnd ?? new Date()`,
  // which silently anchored "Last 7 days" to whatever date the admin
  // last typed into the custom-end field — making today's events
  // invisible after a single hop through custom mode. The function
  // also setHours()-mutated customEnd in place, so the leaked value
  // was actually a mutated alias of the caller's Date.
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  switch (p) {
    case 'today':  start.setHours(0, 0, 0, 0); break;
    case 'last3':  start.setDate(start.getDate() - 3);  start.setHours(0, 0, 0, 0); break;
    case 'last7':  start.setDate(start.getDate() - 7);  start.setHours(0, 0, 0, 0); break;
    case 'last14': start.setDate(start.getDate() - 14); start.setHours(0, 0, 0, 0); break;
    case 'last30': start.setMonth(start.getMonth() - 1); start.setHours(0, 0, 0, 0); break;
    case 'last90': start.setMonth(start.getMonth() - 3); start.setHours(0, 0, 0, 0); break;
    default:       start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0);
  }
  return { start, end };
}

function toLocalDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function coerceDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object' && v !== null && 'toDate' in (v as object) && typeof (v as { toDate?: unknown }).toDate === 'function') {
    return (v as Timestamp).toDate();
  }
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const parsed = new Date(v);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function StatCard({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  accent?: 'gold' | 'green' | 'red' | 'blue';
}) {
  return (
    <div className="aa-stat-card">
      <div className="aa-stat-icon" data-accent={accent ?? 'midnight'}>
        {icon}
      </div>
      <div className="aa-stat-body">
        <p className="aa-stat-label">{label}</p>
        <p className="aa-stat-value">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {sub && (
          <p className="aa-stat-sub">
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

export default function AdminVerificationAnalytics() {
  const [events,  setEvents]  = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [preset, setPreset] = useState<Preset>('last7');
  const [customStartStr, setCustomStartStr] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return toLocalDateInput(d);
  });
  const [customEndStr, setCustomEndStr] = useState<string>(() => toLocalDateInput(new Date()));

  const range = useMemo(() => {
    const cs = customStartStr ? new Date(customStartStr + 'T00:00:00') : undefined;
    const ce = customEndStr   ? new Date(customEndStr   + 'T00:00:00') : undefined;
    return presetToRange(preset, cs, ce);
  }, [preset, customStartStr, customEndStr]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const q = query(
      collection(db, 'verificationEvents'),
      where('createdAt', '>=', Timestamp.fromDate(range.start)),
      orderBy('createdAt', 'desc'),
      limit(MAX_DOCS),
    );
    const unsub = onSnapshot(
      q,
      snap => {
        const rows: EventRow[] = snap.docs.map(d => {
          const data = d.data() as Record<string, unknown>;
          return {
            id:         d.id,
            userId:     String(data.userId ?? ''),
            event:      String(data.event ?? 'modal_shown') as EventName,
            reason:     String(data.reason ?? ''),
            isVerified: data.isVerified === true,
            userAgent:  String(data.userAgent ?? ''),
            pageUrl:    String(data.pageUrl ?? ''),
            createdAt:  coerceDate(data.createdAt),
          };
        });
        setEvents(rows);
        setLoading(false);
      },
      err => {
        console.error('[AdminVerificationAnalytics] listener error:', err);
        setError(
          err.code === 'failed-precondition'
            ? 'Missing Firestore index — deploy firestore.indexes.json.'
            : `Error loading events: ${err.message ?? err.code ?? 'unknown'}`,
        );
        setLoading(false);
      },
    );
    return () => {
      try {
        unsub();
      } catch (err) {
        console.error('[AdminVerificationAnalytics] cleanup error:', err);
      }
    };
  }, [range.start]);

  const filteredEvents = useMemo(() => {
    return events.filter(e => e.createdAt && e.createdAt <= range.end);
  }, [events, range.end]);

  const metrics = useMemo(() => {
    const usersByEvent: Record<EventName, Set<string>> = {
      modal_shown: new Set(), resend_clicked: new Set(),
      verified: new Set(), action_blocked: new Set(),
    };
    const totalsByEvent: Record<EventName, number> = {
      modal_shown: 0, resend_clicked: 0, verified: 0, action_blocked: 0,
    };
    for (const e of filteredEvents) {
      if (e.userId) usersByEvent[e.event].add(e.userId);
      totalsByEvent[e.event] += 1;
    }
    return { usersByEvent, totalsByEvent };
  }, [filteredEvents]);

  const perUserRows = useMemo(() => {
    type Row = {
      userId: string; modal: number; resend: number;
      verified: number; blocked: number; lastSeen: Date | null;
    };
    const map = new Map<string, Row>();
    for (const e of filteredEvents) {
      if (!e.userId) continue;
      let r = map.get(e.userId);
      if (!r) {
        r = { userId: e.userId, modal: 0, resend: 0, verified: 0, blocked: 0, lastSeen: null };
        map.set(e.userId, r);
      }
      if (e.event === 'modal_shown')    r.modal    += 1;
      if (e.event === 'resend_clicked') r.resend   += 1;
      if (e.event === 'verified')       r.verified += 1;
      if (e.event === 'action_blocked') r.blocked  += 1;
      if (e.createdAt && (!r.lastSeen || e.createdAt > r.lastSeen)) {
        r.lastSeen = e.createdAt;
      }
    }
    return [...map.values()]
      .sort((a, b) => b.resend - a.resend || b.blocked - a.blocked)
      .slice(0, 50);
  }, [filteredEvents]);

  return (
    <div className="aa-page">
      <SeoHead title="Verification Analytics — Admin" description="Email verification flow dashboard." noIndex />

      <AdminPageHeader
        eyebrow="Email verification"
        title="Verification"
        description="How customers move through email verification — prompts shown, resends, successful verifications and blocked actions (counted once per customer)."
      />

      {/* Filter bar */}
      <div className="aa-filter-bar">
        <Calendar size={16} className="aa-filter-icon" />
        <span className="aa-filter-label">Range:</span>
        <div className="aa-filter-presets">
          {PRESETS.map(p => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              className="aa-filter-preset"
              data-active={preset === p.value ? 'true' : 'false'}
            >{p.label}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="aa-filter-custom">
            <input type="date" value={customStartStr} onChange={e => setCustomStartStr(e.target.value)}
                   aria-label="Custom range start date"
                   className="aa-filter-date" />
            <span className="aa-filter-to">to</span>
            <input type="date" value={customEndStr} onChange={e => setCustomEndStr(e.target.value)}
                   aria-label="Custom range end date"
                   className="aa-filter-date" />
          </div>
        )}
        <span className="aa-filter-summary">
          {range.start.toLocaleDateString()} – {range.end.toLocaleDateString()}
        </span>
      </div>

      {error && (
        <div className="aa-error-banner">{error}</div>
      )}

      <div className="aa-stat-grid">
        <StatCard icon={<Mail size={20} />} label="Modal opens (unique)"
          value={loading ? '—' : metrics.usersByEvent.modal_shown.size}
          sub={loading ? undefined : `${metrics.totalsByEvent.modal_shown} total`}
          accent="blue" />
        <StatCard icon={<RefreshCw size={20} />} label="Resend clicks (unique)"
          value={loading ? '—' : metrics.usersByEvent.resend_clicked.size}
          sub={loading ? undefined : `${metrics.totalsByEvent.resend_clicked} total clicks`}
          accent="gold" />
        <StatCard icon={<CheckCircle2 size={20} />} label="Verified (unique)"
          value={loading ? '—' : metrics.usersByEvent.verified.size}
          sub={loading ? undefined : 'success count'} accent="green" />
        <StatCard icon={<ShieldAlert size={20} />} label="Actions blocked (unique)"
          value={loading ? '—' : metrics.usersByEvent.action_blocked.size}
          sub={loading ? undefined : `${metrics.totalsByEvent.action_blocked} total blocks`}
          accent="red" />
      </div>

      {/* Top users table */}
      <div className="aa-section">
        <div className="aa-section-head">
          <Users size={16} className="aa-section-icon" />
          <h2 className="aa-section-title">
            Top users by activity
          </h2>
          <span className="aa-section-count">
            {perUserRows.length} user{perUserRows.length === 1 ? '' : 's'} in range
          </span>
        </div>

        {loading ? (
          <p className="aa-section-msg">Loading…</p>
        ) : perUserRows.length === 0 ? (
          <p className="aa-section-msg">
            No verification events in this range yet.
          </p>
        ) : (
          <div className="aa-table-wrap">
            <table className="aa-table">
              <thead>
                <tr className="aa-tr">
                  <th className="aa-th aa-th-left">User ID</th>
                  <th className="aa-th aa-th-right">Modal</th>
                  <th className="aa-th aa-th-right">Resend</th>
                  <th className="aa-th aa-th-right">Verified</th>
                  <th className="aa-th aa-th-right">Blocked</th>
                  <th className="aa-th aa-th-left">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {perUserRows.map(row => (
                  <tr key={row.userId} className="aa-tr">
                    <td className="aa-td aa-td-id" title={row.userId}>
                      {row.userId.slice(0, 8)}…{row.userId.slice(-4)}
                    </td>
                    <td className="aa-td aa-td-num">{row.modal}</td>
                    <td className="aa-td aa-td-num" data-emphasize={row.resend > 2 ? 'gold' : 'none'}>{row.resend}</td>
                    <td className="aa-td aa-td-num" data-emphasize={row.verified > 0 ? 'success' : 'none'}>{row.verified}</td>
                    <td className="aa-td aa-td-num" data-emphasize={row.blocked > 0 ? 'danger' : 'none'}>{row.blocked}</td>
                    <td className="aa-td aa-td-meta">
                      {row.lastSeen ? row.lastSeen.toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent events feed */}
      <div className="aa-section aa-section-flush">
        <div className="aa-section-head">
          <Clock size={16} className="aa-section-icon" />
          <h2 className="aa-section-title">
            Recent events
          </h2>
          <span className="aa-section-count">
            {filteredEvents.length} event{filteredEvents.length === 1 ? '' : 's'}
            {events.length === MAX_DOCS && ' (older events truncated)'}
          </span>
        </div>

        {loading ? (
          <p className="aa-section-msg">Loading…</p>
        ) : filteredEvents.length === 0 ? (
          <p className="aa-section-msg">
            No events in this range yet.
          </p>
        ) : (
          <div className="aa-event-list">
            {filteredEvents.slice(0, 200).map(e => (
              <div key={e.id} className="aa-event-row">
                <span
                  className="aa-event-tag"
                  data-event={e.event}
                >{e.event.replace('_', ' ')}</span>
                <span className="aa-event-uid"
                      title={`${e.userId}${e.reason ? ` · ${e.reason}` : ''}`}>
                  {e.userId.slice(0, 8)}…{e.reason ? ` · ${e.reason}` : ''}
                </span>
                <span className="aa-event-status" data-verified={e.isVerified ? 'true' : 'false'}>
                  {e.isVerified ? 'verified' : 'unverified'}
                </span>
                <span className="aa-event-time">
                  {e.createdAt ? e.createdAt.toLocaleString() : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
