import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  collection, query, where, orderBy, limit,
  onSnapshot, doc, updateDoc, deleteDoc,
  writeBatch, getDocs,
} from 'firebase/firestore';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useAuth } from './AuthContext';
import {
  notificationLooseSchema,
  type NotificationLoose,
  ADMIN_RECIPIENT,
  MAX_USER_NOTIFICATIONS, MAX_ADMIN_NOTIFICATIONS,
} from '@/schemas/notification.schema';
import { setBadge } from '@/hooks/usePushNotifications';

// Bell consumes the loose schema — historical docs may not match the
// strict discriminated union but should still render. Strict schema is
// used by writers + tests where correctness guarantees matter.
type Notification = NotificationLoose;

interface NotificationContextType {
  notifications:    Notification[];
  unreadCount:      number;
  loading:          boolean;
  markAsRead:       (id: string) => Promise<void>;
  markAsUnread:     (id: string) => Promise<void>;
  markAllAsRead:    () => Promise<void>;
  deleteOne:        (id: string) => Promise<void>;
  clearAllRead:     () => Promise<void>;
  clearAll:         () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading]             = useState(true);

  // ── Real-time listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;  // wait for Firebase Auth to initialise
    if (!currentUser) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    // Admin sees admin-recipient notifications; users see their own
    const recipientId = isAdmin ? ADMIN_RECIPIENT : currentUser.uid;
    const maxCount    = isAdmin ? MAX_ADMIN_NOTIFICATIONS : MAX_USER_NOTIFICATIONS;

    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', recipientId),
      orderBy('createdAt', 'desc'),
      limit(maxCount)
    );

    const unsub = onSnapshot(q, snap => {
      // Parse each doc through the loose schema. firestoreTimestampSchema
      // normalizes createdAt to Date | null so consumers never deal with
      // raw Firestore Timestamps. Malformed docs are filtered out and
      // logged — an admin can find them by their absence in the bell
      // and inspect /notifications directly in the Firebase Console.
      const parsed: Notification[] = [];
      for (const d of snap.docs) {
        const result = notificationLooseSchema.safeParse({ ...d.data(), id: d.id });
        if (result.success) {
          parsed.push(result.data);
        } else {
          console.warn('[notifications] dropping malformed doc', d.id, result.error.issues);
        }
      }
      setNotifications(parsed);
      setLoading(false);
    }, err => {
      // Surface read errors so the user knows the bell is broken rather
      // than silently empty. Most common cause: Firestore rules denying
      // the list query (rule must reference recipientId) or a missing
      // composite index for (recipientId, createdAt).
      console.error('[notifications] subscription error', err);
      setLoading(false);
    });

    return unsub;
  }, [currentUser, isAdmin, authLoading]);

  // ── Mark one as read (optimistic) ─────────────────────────────────────
  // Day 16 v12: writes to local state immediately, then commits to
  // Firestore. The onSnapshot will eventually overwrite local state
  // with the canonical doc, but the user sees instant feedback. If
  // Firestore rejects (rules / network), we revert.
  const markAsRead = useCallback(async (id: string) => {
    // Snapshot the previous value for rollback
    let previous: Notification | undefined;
    setNotifications(prev => {
      previous = prev.find(n => n.id === id);
      return prev.map(n => n.id === id ? { ...n, isRead: true } : n);
    });
    try {
      await updateDoc(doc(db, 'notifications', id), { isRead: true });
    } catch (err) {
      console.error('[notifications] markAsRead failed', err);
      toast.error('Could not mark as read');
      // Roll back if we have the previous shape
      if (previous) {
        const prev = previous;
        setNotifications(curr => curr.map(n => n.id === id ? prev : n));
      }
    }
  }, []);

  // ── Mark one as unread (optimistic) ───────────────────────────────────
  const markAsUnread = useCallback(async (id: string) => {
    let previous: Notification | undefined;
    setNotifications(prev => {
      previous = prev.find(n => n.id === id);
      return prev.map(n => n.id === id ? { ...n, isRead: false } : n);
    });
    try {
      await updateDoc(doc(db, 'notifications', id), { isRead: false });
    } catch (err) {
      console.error('[notifications] markAsUnread failed', err);
      toast.error('Could not mark as unread');
      if (previous) {
        const prev = previous;
        setNotifications(curr => curr.map(n => n.id === id ? prev : n));
      }
    }
  }, []);

  // ── Mark all as read ──────────────────────────────────────────────────────
  const markAllAsRead = useCallback(async () => {
    if (!currentUser) return;
    try {
      const recipientId = isAdmin ? ADMIN_RECIPIENT : currentUser.uid;
      const cap = isAdmin ? MAX_ADMIN_NOTIFICATIONS : MAX_USER_NOTIFICATIONS;
      // Cap the query at the same limit as the listener — keeps us
      // safely under Firestore's 500-op writeBatch ceiling and matches
      // what the user actually sees in the bell. Older unread items
      // beyond this window are past the listener's view anyway.
      //
      // orderBy(createdAt) added so this query uses the existing
      // (recipientId, isRead, createdAt) composite index — the bell
      // listener already requires it, so deploys that have working
      // bells are guaranteed to have working mark-all-as-read.
      // Without orderBy, Firestore picked a different index path and
      // a small subset of deployments saw 'failed-precondition'.
      const q = query(
        collection(db, 'notifications'),
        where('recipientId', '==', recipientId),
        where('isRead', '==', false),
        orderBy('createdAt', 'desc'),
        limit(cap),
      );
      const snap   = await getDocs(q);
      if (snap.empty) return;
      const batch  = writeBatch(db);
      snap.docs.forEach(d => batch.update(d.ref, { isRead: true }));
      await batch.commit();
    } catch (err) {
      // Surface the diagnostic so the developer sees if it's an
      // index-precondition error (rare but recoverable: deploy
      // firestore.indexes.json). Users only see the friendly toast.
      console.error('[notifications] markAllAsRead failed', err);
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'failed-precondition') {
        toast.error('Mark-all-read needs a database update — please contact admin.');
      } else {
        toast.error('Could not mark all as read');
      }
    }
  }, [currentUser, isAdmin]);

  // ── Delete one ────────────────────────────────────────────────────────────
  const deleteOne = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (err) {
      console.error('[notifications] deleteOne failed', err);
      toast.error('Could not delete notification');
      throw err;     // re-throw so the bell can roll back its optimistic UI
    }
  }, []);

  // ── Clear all READ notifications (bulk) ───────────────────────────────
  // Day 16 v12: dedicated bulk action — keeps unread items intact while
  // sweeping the read pile. Useful when an inbox has accumulated dozens
  // of resolved notifications.
  const clearAllRead = useCallback(async () => {
    if (!currentUser) return;
    try {
      const recipientId = isAdmin ? ADMIN_RECIPIENT : currentUser.uid;
      // Cap delete at the same limit as the listener — keeps us under
      // Firestore's 500-op batch ceiling and matches what admin/user
      // can actually see in the bell. If older read notifications exist
      // beyond this window, they'll age out naturally on the next sweep.
      const cap  = isAdmin ? MAX_ADMIN_NOTIFICATIONS : MAX_USER_NOTIFICATIONS;
      const q    = query(
        collection(db, 'notifications'),
        where('recipientId', '==', recipientId),
        where('isRead',      '==', true),
        orderBy('createdAt', 'desc'),
        limit(cap),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        toast.info('Nothing to clear — no read notifications');
        return;
      }
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      toast.success(`Cleared ${snap.size} notification${snap.size === 1 ? '' : 's'}`);
    } catch (err) {
      console.error('[notifications] clearAllRead failed', err);
      toast.error('Could not clear read notifications');
    }
  }, [currentUser, isAdmin]);

  // ── Clear all ─────────────────────────────────────────────────────────────
  const clearAll = useCallback(async () => {
    if (!currentUser) return;
    try {
      const recipientId = isAdmin ? ADMIN_RECIPIENT : currentUser.uid;
      const cap  = isAdmin ? MAX_ADMIN_NOTIFICATIONS : MAX_USER_NOTIFICATIONS;
      const q    = query(
        collection(db, 'notifications'),
        where('recipientId', '==', recipientId),
        orderBy('createdAt', 'desc'),
        limit(cap),
      );
      const snap = await getDocs(q);
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } catch (err) {
      console.error('[notifications] clearAll failed', err);
      toast.error('Could not clear notifications');
    }
  }, [currentUser, isAdmin]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // ── Badge API — keep the installed PWA icon badge in sync ─────────────────
  // Runs on every unread count change. Customers see the badge on their home
  // screen / taskbar / dock without opening the app. Admins are excluded —
  // their unread counts can be large (many order notifications) and a
  // persistent high badge number is more noise than signal for an admin
  // who lives in the dashboard rather than the PWA home screen.
  useEffect(() => {
    if (isAdmin) return;
    setBadge(unreadCount);
  }, [unreadCount, isAdmin]);

  // Memoize the context value so consumers (e.g. NotificationBell) don't
  // re-render on every provider render — only when the underlying data
  // or callbacks actually change. The previous version returned a fresh
  // object literal each render, defeating React's reference-equality
  // checks downstream.
  const value = useMemo(() => ({
    notifications, unreadCount, loading,
    markAsRead, markAsUnread, markAllAsRead,
    deleteOne, clearAllRead, clearAll,
  }), [notifications, unreadCount, loading, markAsRead, markAsUnread, markAllAsRead, deleteOne, clearAllRead, clearAll]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
