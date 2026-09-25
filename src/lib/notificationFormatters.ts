export type NotificationGroupKey = 'today' | 'yesterday' | 'this-week' | 'older';

export const NOTIFICATION_GROUP_LABEL: Record<NotificationGroupKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  'this-week': 'This week',
  older: 'Older',
};

export function fmtRelative(d: Date | null | undefined, nowMs = Date.now(), lang: 'en' | 'fr' = 'en'): string {
  if (!d) return '';
  const delta = Math.max(0, nowMs - d.getTime());
  const fr = lang === 'fr';
  if (delta < 60_000) return fr ? 'À l’instant' : 'Just now';
  if (delta < 3_600_000) { const n = Math.floor(delta / 60_000); return fr ? `il y a ${n} min` : `${n}m ago`; }
  if (delta < 86_400_000) { const n = Math.floor(delta / 3_600_000); return fr ? `il y a ${n} h` : `${n}h ago`; }
  const n = Math.floor(delta / 86_400_000);
  return fr ? `il y a ${n} j` : `${n}d ago`;
}

export function fmtFull(d: Date | null | undefined, lang: 'en' | 'fr' = 'en'): string {
  if (!d) return '';
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function groupKeyFor(d: Date | null | undefined, nowMs = Date.now()): NotificationGroupKey {
  if (!d) return 'older';
  const delta = Math.max(0, nowMs - d.getTime());
  if (delta < 86_400_000) return 'today';
  if (delta < 172_800_000) return 'yesterday';
  if (delta < 604_800_000) return 'this-week';
  return 'older';
}
