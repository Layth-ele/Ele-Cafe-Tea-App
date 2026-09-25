/**
 * NotificationPreferencesSection — Phase 11.5.
 *
 * Drops into AccountPage. Renders a list of Toggle rows that read/
 * write the user's notification preferences subdoc at
 * /users/{uid}/preferences/notifications.
 *
 * Optimistic save pattern: when the user flips a toggle, the local
 * state updates immediately so the UI is snappy. A 500ms debounce
 * timer then writes the merged doc to Firestore. If the write fails
 * (offline, permission), we revert the local state and toast an
 * error.
 *
 * The Cloud Functions that send the actual notifications
 * (orderApprovedEmail, orderShippedEmail, promo blasts, low-stock
 * alerts) MUST read this doc before dispatching. See
 * PHASE_11_CHANGES.md §"Notification preferences end-to-end" for
 * the function-side contract.
 */
import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Toggle } from './ui/toggle';
import {
  parseNotificationPreferences,
  type NotificationPreferences,
} from '@/schemas/userPreferences.schema';

import { useT, tNow, k } from '@/i18n/useT';
const ROWS: Array<{
  key: keyof NotificationPreferences;
  label: string;
  description: string;
  /** True for transactional / safety-related notifications. The
   *  AccountPage warns when the user disables a transactional one. */
  isTransactional: boolean;
}> = [
  {
    key: 'orderUpdates',
    label: k('Order updates'),
    description: k('Receive emails about your order status, payment confirmations, and shipping.'),
    isTransactional: true,
  },
  {
    key: 'lowStock',
    label: k('Wishlist back-in-stock'),
    description: k('Alert me when a tea on my wishlist is back in stock. Teas you tap “Notify me” on always get one alert.'),
    isTransactional: false,
  },
  {
    key: 'promotions',
    label: k('Promotions'),
    description: k('Sales, promo codes, and seasonal offers.'),
    isTransactional: false,
  },
  {
    key: 'newArrivals',
    label: k('New arrivals'),
    description: k('Get an email when we add a new tea.'),
    isTransactional: false,
  },
  {
    key: 'reminders',
    label: k('Cart reminders'),
    description: k('A nudge if you leave items in your cart for more than a day.'),
    isTransactional: false,
  },
];

const SAVE_DEBOUNCE_MS = 500;

export function NotificationPreferencesSection() {
  const t = useT();
  const { currentUser } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const lastSavedRef = useRef<NotificationPreferences | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial fetch.
  useEffect(() => {
    if (!currentUser?.uid) { setPrefs(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', currentUser.uid, 'preferences', 'notifications'));
        if (cancelled) return;
        const parsed = parseNotificationPreferences(snap.exists() ? snap.data() : {});
        setPrefs(parsed);
        lastSavedRef.current = parsed;
      } catch (err) {
        if (cancelled) return;
        console.warn('[NotificationPreferencesSection] initial load failed:', err);
        const defaults = parseNotificationPreferences({});
        setPrefs(defaults);
        lastSavedRef.current = defaults;
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser?.uid]);

  // Debounced save.
  const queueSave = (next: NotificationPreferences) => {
    if (!currentUser?.uid) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await setDoc(
          doc(db, 'users', currentUser.uid, 'preferences', 'notifications'),
          { ...next, updatedAt: serverTimestamp() },
          { merge: true },
        );
        lastSavedRef.current = next;
      } catch (err) {
        console.warn('[NotificationPreferencesSection] save failed:', err);
        // Revert on failure.
        if (lastSavedRef.current) setPrefs(lastSavedRef.current);
        toast.error(tNow('Could not save preferences — try again'));
      } finally {
        setSaving(false);
      }
    }, SAVE_DEBOUNCE_MS);
  };

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  if (!prefs) {
    return (
      <section className="notif-prefs" aria-labelledby="notif-prefs-h">
        <h2 id="notif-prefs-h" className="notif-prefs-h">{t('Notifications')}</h2>
        <p className="notif-prefs-loading">{t('Loading your preferences…')}</p>
      </section>
    );
  }

  const handleToggle = (key: keyof NotificationPreferences, isTransactional: boolean) => (next: boolean) => {
    const update = { ...prefs, [key]: next };
    setPrefs(update);
    if (isTransactional && next === false) {
      // Soft warning — let them through but make sure they know.
      toast(tNow('Transactional emails are how we tell you about your order. You can re-enable this any time.'), { duration: 5000 });
    }
    queueSave(update);
  };

  return (
    <section className="notif-prefs" aria-labelledby="notif-prefs-h">
      <h2 id="notif-prefs-h" className="notif-prefs-h">
        {t('Notifications')}
        {saving && <span className="notif-prefs-saving" aria-live="polite">{t('Saving…')}</span>}
      </h2>
      <p className="notif-prefs-intro">
        {t('Control which emails and phone notifications we send you. Updates always appear in your in-app notifications. You can change these any time.')}
      </p>
      <ul className="notif-prefs-list" role="list">
        {ROWS.map((row) => {
          const labelId = `notif-${row.key}-label`;
          const descId  = `notif-${row.key}-desc`;
          return (
            <li key={row.key} className="notif-prefs-row">
              <div className="notif-prefs-text">
                <span id={labelId} className="notif-prefs-row-label">{t(row.label)}</span>
                <span id={descId}  className="notif-prefs-row-desc">{t(row.description)}</span>
              </div>
              <Toggle
                checked={Boolean(prefs[row.key])}
                onCheckedChange={handleToggle(row.key, row.isTransactional)}
                aria-labelledby={labelId}
                aria-describedby={descId}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
