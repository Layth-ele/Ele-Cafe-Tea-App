/**
 * AdminVisitsAnalytics — customer website visit dashboard.
 *
 * Reads /pageViews and surfaces:
 *   • Total page views in range
 *   • Unique visitors (deduped by visitorId)
 *   • Signed-in vs anonymous breakdown
 *   • Top pages (ranked by views, with unique visitor count)
 *   • Top referrers (where traffic comes from)
 *
 * Filter: same date presets as verification analytics (today,
 * 3d, week, 2w, month, 3m, custom range).
 *
 * Dedup logic:
 *   • "Unique visitors" = distinct visitorId values (anonymous IDs
 *     rotate per session, so this counts session-distinct visitors).
 *   • "Total views" = raw doc count.
 *   • Per-page "Unique" column = visitorId × path distinctness.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
  limit,
} from 'firebase/firestore';
import { Calendar, Eye, Globe, Link2, UserCheck, Users } from 'lucide-react';
import { db } from '@/lib/firebase';
import { SeoHead } from '@/app/components/SeoHead';

import { AdminPageHeader } from '@/app/components/admin/AdminPageHeader';
interface ViewRow {
  id: string;
  path: string;
  visitorId: string;
  isAuthed: boolean;
  userId: string;
  referrer: string;
  userAgent: string;
  createdAt: Date | null;
}

type Preset = 'today' | 'last3' | 'last7' | 'last14' | 'last30' | 'last90' | 'custom';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'last3', label: 'Last 3 days' },
  { value: 'last7', label: 'Last week' },
  { value: 'last14', label: 'Last 2 weeks' },
  { value: 'last30', label: 'Last month' },
  { value: 'last90', label: 'Last 3 months' },
  { value: 'custom', label: 'Custom range' },
];

// Cap the listener — busy stores accumulating thousands of views
// per day stay cheap. The dashboard surfaces a "older views truncated"
// notice when this fires.
const MAX_DOCS = 10000;

function presetToRange(
  p: Preset,
  customStart?: Date,
  customEnd?: Date,
): { start: Date; end: Date } {
  // Custom range path — both ends come from the user's date inputs.
  if (p === 'custom' && customStart) {
    const s = new Date(customStart); // clone — never mutate the arg
    s.setHours(0, 0, 0, 0);
    const e = customEnd ? new Date(customEnd) : new Date();
    e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }
  // Preset path — end is ALWAYS "right now, end of day", regardless of
  // whatever lingering value the custom date inputs happen to hold.
  // Old version did `customEnd ?? new Date()` which let the custom-end
  // input leak into preset ranges — switching back from custom to
  // "Last 7 days" would silently anchor the end to the typed custom
  // date and make today's visits invisible. Also setHours-mutated the
  // arg in place. Mirrors the fix in AdminVerificationAnalytics.
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  switch (p) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'last3':
      start.setDate(start.getDate() - 3);
      start.setHours(0, 0, 0, 0);
      break;
    case 'last7':
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
    case 'last14':
      start.setDate(start.getDate() - 14);
      start.setHours(0, 0, 0, 0);
      break;
    case 'last30':
      start.setMonth(start.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'last90':
      start.setMonth(start.getMonth() - 3);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
  }
  return { start, end };
}

function toLocalDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function coerceDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (
    typeof v === 'object' &&
    v !== null &&
    'toDate' in (v as object) &&
    typeof (v as { toDate?: unknown }).toDate === 'function'
  ) {
    return (v as Timestamp).toDate();
  }
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const p = new Date(v);
    return isNaN(p.getTime()) ? null : p;
  }
  return null;
}

/**
 * Normalise a referrer string into a "where did this visit come from"
 * label suitable for grouping. Strips path/query/hash — keeps only
 * the hostname so multiple deep links from google.com group together.
 */
function normaliseReferrer(ref: string, ownOrigin: string): string {
  if (!ref) return '(direct)';
  try {
    const u = new URL(ref);
    if (u.origin === ownOrigin) return '(internal)';
    // Strip leading "www." for nicer grouping.
    return u.hostname.replace(/^www\./, '');
  } catch (err) {
    console.warn('[AdminVisitsAnalytics] Failed to normalise referrer:', err);
    return ref.slice(0, 80);
  }
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  accent?: 'gold' | 'green' | 'red' | 'blue' | 'purple';
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
        {sub && <p className="aa-stat-sub">{sub}</p>}
      </div>
    </div>
  );
}

export default function AdminVisitsAnalytics() {
  const [views, setViews] = useState<ViewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [preset, setPreset] = useState<Preset>('last7');
  const [customStartStr, setCustomStartStr] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toLocalDateInput(d);
  });
  const [customEndStr, setCustomEndStr] = useState<string>(() => toLocalDateInput(new Date()));

  const range = useMemo(() => {
    const cs = customStartStr ? new Date(customStartStr + 'T00:00:00') : undefined;
    const ce = customEndStr ? new Date(customEndStr + 'T00:00:00') : undefined;
    return presetToRange(preset, cs, ce);
  }, [preset, customStartStr, customEndStr]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const q = query(
      collection(db, 'pageViews'),
      where('createdAt', '>=', Timestamp.fromDate(range.start)),
      orderBy('createdAt', 'desc'),
      limit(MAX_DOCS),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: ViewRow[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            path: String(data.path ?? ''),
            visitorId: String(data.visitorId ?? ''),
            isAuthed: data.isAuthed === true,
            userId: String(data.userId ?? ''),
            referrer: String(data.referrer ?? ''),
            userAgent: String(data.userAgent ?? ''),
            createdAt: coerceDate(data.createdAt),
          };
        });
        setViews(rows);
        setLoading(false);
      },
      (err) => {
        console.error('[AdminVisitsAnalytics] listener error:', err);
        setError(
          err.code === 'failed-precondition'
            ? 'Missing Firestore index — deploy firestore.indexes.json.'
            : `Error loading views: ${err.message ?? err.code ?? 'unknown'}`,
        );
        setLoading(false);
      },
    );
    return () => {
      try {
        unsub();
      } catch (err) {
        console.error('[AdminVisitsAnalytics] cleanup error:', err);
      }
    };
  }, [range.start]);

  const filteredViews = useMemo(
    () => views.filter((v) => v.createdAt && v.createdAt <= range.end),
    [views, range.end],
  );

  const ownOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  const metrics = useMemo(() => {
    const uniqueVisitors = new Set<string>();
    const authedVisitors = new Set<string>();
    const anonVisitors = new Set<string>();
    let totalViews = 0;
    let authedViews = 0;
    for (const v of filteredViews) {
      totalViews += 1;
      if (v.visitorId) {
        uniqueVisitors.add(v.visitorId);
        if (v.isAuthed) authedVisitors.add(v.visitorId);
        else anonVisitors.add(v.visitorId);
      }
      if (v.isAuthed) authedViews += 1;
    }
    return {
      totalViews,
      uniqueVisitors: uniqueVisitors.size,
      authedVisitors: authedVisitors.size,
      anonVisitors: anonVisitors.size,
      authedViews,
      anonViews: totalViews - authedViews,
    };
  }, [filteredViews]);

  // Top pages: group by path, count views + unique visitors per path.
  const topPages = useMemo(() => {
    type Row = { path: string; views: number; unique: Set<string> };
    const map = new Map<string, Row>();
    for (const v of filteredViews) {
      if (!v.path) continue;
      let r = map.get(v.path);
      if (!r) {
        r = { path: v.path, views: 0, unique: new Set() };
        map.set(v.path, r);
      }
      r.views += 1;
      if (v.visitorId) r.unique.add(v.visitorId);
    }
    return [...map.values()]
      .map((r) => ({ path: r.path, views: r.views, unique: r.unique.size }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 25);
  }, [filteredViews]);

  // Top referrers: group by hostname.
  const topReferrers = useMemo(() => {
    type Row = { source: string; visits: number; unique: Set<string> };
    const map = new Map<string, Row>();
    for (const v of filteredViews) {
      const key = normaliseReferrer(v.referrer, ownOrigin);
      let r = map.get(key);
      if (!r) {
        r = { source: key, visits: 0, unique: new Set() };
        map.set(key, r);
      }
      r.visits += 1;
      if (v.visitorId) r.unique.add(v.visitorId);
    }
    return [...map.values()]
      .map((r) => ({ source: r.source, visits: r.visits, unique: r.unique.size }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 15);
  }, [filteredViews, ownOrigin]);

  return (
    <div className="aa-page">
      <SeoHead
        title="Visits Analytics — Admin"
        description="Customer website visit dashboard."
        noIndex
      />

      <AdminPageHeader
        eyebrow="Customer visits"
        title="Visits"
        description="Customer page views, signed in or not. “Unique visitors” counts browser sessions. Your own, staff and admin browsing isn’t included — any device that signs in as info@, layth.ele@, inventory@ or an admin is left out (from Sep 27, 2026)."
      />

      {/* Filter bar */}
      <div className="aa-filter-bar">
        <Calendar size={16} className="aa-filter-icon" />
        <span className="aa-filter-label">Range:</span>
        <div className="aa-filter-presets">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              className="aa-filter-preset"
              data-active={preset === p.value ? 'true' : 'false'}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="aa-filter-custom">
            <input
              type="date"
              value={customStartStr}
              onChange={(e) => setCustomStartStr(e.target.value)}
              aria-label="Custom range start date"
              className="aa-filter-date"
            />
            <span className="aa-filter-to">to</span>
            <input
              type="date"
              value={customEndStr}
              onChange={(e) => setCustomEndStr(e.target.value)}
              aria-label="Custom range end date"
              className="aa-filter-date"
            />
          </div>
        )}
        <span className="aa-filter-summary">
          {range.start.toLocaleDateString()} – {range.end.toLocaleDateString()}
        </span>
      </div>

      {error && <div className="aa-error-banner">{error}</div>}

      {/* Stat cards */}
      <div className="aa-stat-grid">
        <StatCard
          icon={<Eye size={20} />}
          label="Total page views"
          value={loading ? '—' : metrics.totalViews}
          sub={
            loading
              ? undefined
              : views.length === MAX_DOCS
                ? 'showing latest 10K'
                : 'all views in range'
          }
          accent="blue"
        />
        <StatCard
          icon={<Users size={20} />}
          label="Unique visitors"
          value={loading ? '—' : metrics.uniqueVisitors}
          sub={loading ? undefined : 'session-distinct'}
          accent="gold"
        />
        <StatCard
          icon={<UserCheck size={20} />}
          label="Signed-in visitors"
          value={loading ? '—' : metrics.authedVisitors}
          sub={loading ? undefined : `${metrics.authedViews} views`}
          accent="green"
        />
        <StatCard
          icon={<Globe size={20} />}
          label="Anonymous visitors"
          value={loading ? '—' : metrics.anonVisitors}
          sub={loading ? undefined : `${metrics.anonViews} views`}
          accent="purple"
        />
      </div>

      <div className="av-2col">
        {/* Top pages */}
        <div className="aa-section aa-section-flush">
          <div className="aa-section-head">
            <Eye size={16} className="aa-section-icon" />
            <h2 className="aa-section-title">Top pages</h2>
            <span className="aa-section-count">by views</span>
          </div>

          {loading ? (
            <p className="aa-section-msg">Loading…</p>
          ) : topPages.length === 0 ? (
            <p className="aa-section-msg">No views in this range yet.</p>
          ) : (
            <div className="aa-table-wrap">
              <table className="aa-table">
                <thead>
                  <tr className="aa-tr">
                    <th className="aa-th aa-th-left">Path</th>
                    <th className="aa-th aa-th-right">Views</th>
                    <th className="aa-th aa-th-right">Unique</th>
                  </tr>
                </thead>
                <tbody>
                  {topPages.map((row) => (
                    <tr key={row.path} className="aa-tr">
                      <td className="aa-td aa-td-id av-td-path" title={row.path}>
                        {row.path}
                      </td>
                      <td className="aa-td aa-td-num">{row.views.toLocaleString()}</td>
                      <td className="aa-td aa-td-num aa-td-meta">{row.unique.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top referrers */}
        <div className="aa-section aa-section-flush">
          <div className="aa-section-head">
            <Link2 size={16} className="aa-section-icon" />
            <h2 className="aa-section-title">Top traffic sources</h2>
          </div>

          {loading ? (
            <p className="aa-section-msg">Loading…</p>
          ) : topReferrers.length === 0 ? (
            <p className="aa-section-msg">No referrer data yet.</p>
          ) : (
            <div className="aa-table-wrap">
              <table className="aa-table">
                <thead>
                  <tr className="aa-tr">
                    <th className="aa-th aa-th-left">Source</th>
                    <th className="aa-th aa-th-right">Visits</th>
                    <th className="aa-th aa-th-right">Unique</th>
                  </tr>
                </thead>
                <tbody>
                  {topReferrers.map((row) => (
                    <tr key={row.source} className="aa-tr">
                      <td className="aa-td aa-td-id">{row.source}</td>
                      <td className="aa-td aa-td-num">{row.visits.toLocaleString()}</td>
                      <td className="aa-td aa-td-num aa-td-meta">{row.unique.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
