export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface BusinessHoursDay {
  day: WeekdayKey;
  closed: boolean;
  open: string;
  close: string;
}

export const WEEKDAY_ORDER: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const WEEKDAY_FULL: Record<WeekdayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export const DEFAULT_BUSINESS_HOURS: BusinessHoursDay[] = [
  { day: 'mon', closed: false, open: '08:00', close: '21:00' },
  { day: 'tue', closed: false, open: '08:00', close: '21:00' },
  { day: 'wed', closed: false, open: '08:00', close: '21:00' },
  { day: 'thu', closed: false, open: '08:00', close: '21:00' },
  { day: 'fri', closed: false, open: '08:00', close: '21:00' },
  { day: 'sat', closed: false, open: '09:00', close: '21:00' },
  { day: 'sun', closed: false, open: '12:00', close: '21:00' },
];

const WEEKDAY_FULL_FR: Record<WeekdayKey, string> = {
  mon: 'Lundi', tue: 'Mardi', wed: 'Mercredi', thu: 'Jeudi', fri: 'Vendredi', sat: 'Samedi', sun: 'Dimanche',
};

function formatHm(hm: string, lang: 'en' | 'fr' = 'en'): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!m) return hm;
  const h = Number(m[1]);
  const min = Number(m[2]);
  // French (Canada) uses the 24-hour clock: "8 h", "21 h 30".
  if (lang === 'fr') return min === 0 ? `${h} h` : `${h} h ${String(min).padStart(2, '0')}`;
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return min === 0 ? `${h12} ${ampm}` : `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
}

function sameHours(a: BusinessHoursDay, b: BusinessHoursDay): boolean {
  return a.closed === b.closed && a.open === b.open && a.close === b.close;
}

export function normaliseBusinessHours(input?: BusinessHoursDay[] | null): BusinessHoursDay[] {
  const map = new Map<WeekdayKey, BusinessHoursDay>();
  for (const row of input ?? []) {
    if (!row || !WEEKDAY_ORDER.includes(row.day)) continue;
    map.set(row.day, {
      day: row.day,
      closed: !!row.closed,
      open: typeof row.open === 'string' ? row.open : '09:00',
      close: typeof row.close === 'string' ? row.close : '17:00',
    });
  }
  return WEEKDAY_ORDER.map(day => map.get(day) ?? { ...DEFAULT_BUSINESS_HOURS.find(d => d.day === day)! });
}

export function formatBusinessHours(hours?: BusinessHoursDay[] | null, lang: 'en' | 'fr' = 'en'): Array<{ label: string; range: string }> {
  const dayName = lang === 'fr' ? WEEKDAY_FULL_FR : WEEKDAY_FULL;
  const rows = normaliseBusinessHours(hours);
  const out: Array<{ label: string; range: string }> = [];
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j + 1 < rows.length && sameHours(rows[i], rows[j + 1])) j += 1;
    const from = rows[i].day;
    const to = rows[j].day;
    const label = i === j ? dayName[from] : `${dayName[from]} – ${dayName[to]}`;
    const range = rows[i].closed ? (lang === 'fr' ? 'Fermé' : 'Closed') : `${formatHm(rows[i].open, lang)} – ${formatHm(rows[i].close, lang)}`;
    out.push({ label, range });
    i = j + 1;
  }
  return out;
}

export function formatBusinessHoursInline(hours?: BusinessHoursDay[] | null, lang: 'en' | 'fr' = 'en'): string {
  return formatBusinessHours(hours, lang).map(r => `${r.label}: ${r.range}`).join(' · ');
}
