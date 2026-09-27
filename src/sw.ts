/// <reference lib="webworker" />
/// <reference types="vite/client" />

/**
 * sw.ts — Ele Café custom Service Worker
 *
 * Built by VitePWA's `injectManifest` strategy (not generateSW). This gives
 * us one SW that owns BOTH concerns:
 *
 *   1. Workbox offline caching (precache + runtime strategies)
 *   2. Firebase Cloud Messaging background push notifications
 *
 * Previously the project used generateSW (no custom SW file). That meant
 * push notifications silently died when the app was closed — the only
 * mechanism was Firestore's onSnapshot listener, which requires an open tab.
 *
 * Enterprise push requires the SW to:
 *   a) Receive FCM messages when the app is backgrounded / closed
 *   b) Call self.registration.showNotification() to surface the OS toast
 *   c) Handle notificationclick to navigate to the right in-app URL
 *   d) Update the app badge (navigator.setAppBadge) on push receipt
 *
 * The __WB_MANIFEST token is replaced by VitePWA at build time with the
 * hashed precache manifest (list of all JS/CSS/HTML/image assets).
 *
 * SKIP_WAITING protocol (matches registerType: 'prompt'):
 *   SwUpdateBanner calls updateServiceWorker(true) → vite-plugin-pwa sends
 *   { type: 'SKIP_WAITING' } → this SW's message handler calls skipWaiting()
 *   → SW activates → page reloads fresh. Without this handler the "Update
 *   now" button in SwUpdateBanner would silently do nothing.
 */

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

declare const self: ServiceWorkerGlobalScope;

// ── Workbox: precache all build assets ───────────────────────────────────────
// __WB_MANIFEST is replaced by VitePWA with the hashed asset list.
// The ?? [] fallback prevents errors if the token isn't injected (e.g.
// in unit tests or manual SW inspection tools).
precacheAndRoute(self.__WB_MANIFEST ?? []);
cleanupOutdatedCaches();

// Claim clients immediately on the FIRST install so pages don't need
// a reload to be controlled by the SW. Subsequent updates use the
// SKIP_WAITING flow (see message handler below) to avoid claiming
// mid-session.
clientsClaim();

// ── Navigation: NetworkFirst for SPA routes ──────────────────────────────────
// Deep links, QR codes, and share targets all need the SPA shell.
// NetworkFirst with a 3s timeout ensures fresh HTML on fast connections
// and falls back to cached HTML on slow/offline.
const NAV_DENYLIST = [
  /^\/assets\//,
  /^\/__\//,
  /^\/api\//,
  /^\/_health\//,
  /^\/sitemap\.xml$/,
  /^\/robots\.txt$/,
  /^\/sw\.js$/,
  /^\/workbox-/,
  /^\/manifest\.webmanifest$/,
  /\.(?:js|css|map|json|woff2?|png|jpg|jpeg|svg|ico|webp)$/,
];

registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'nav-html',
      networkTimeoutSeconds: 3,
      plugins: [
        new CacheableResponsePlugin({ statuses: [200] }),
        new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 24 * 60 * 60 }),
      ],
    }),
    { denylist: NAV_DENYLIST },
  ),
);

// ── Firebase Storage images — CacheFirst, 30 days ───────────────────────────
registerRoute(
  ({ url }) => url.hostname === 'firebasestorage.googleapis.com',
  new CacheFirst({
    cacheName: 'firebase-images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
);

// ── Unsplash placeholder images — CacheFirst, 7 days ────────────────────────
registerRoute(
  ({ url }) => url.hostname === 'images.unsplash.com',
  new CacheFirst({
    cacheName: 'unsplash-images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  }),
);

// ── Self-hosted fonts — CacheFirst, 1 year ──────────────────────────────────
registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: 'fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 })],
  }),
);

// ── Firestore read-only catalog (teas / categories / settings) — SWR ────────
// Anchored to the REST v1 documents path to avoid caching writes or
// auth-sensitive reads. Only the three public collections are matched.
registerRoute(
  ({ url }) =>
    url.hostname === 'firestore.googleapis.com' &&
    /\/v1\/projects\/[^/]+\/databases\/[^/]+\/documents\/(teas|categories|settings)[/?]/.test(
      url.pathname + url.search,
    ),
  new StaleWhileRevalidate({
    cacheName: 'firestore-readonly',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 5 * 60 }),
    ],
  }),
);

// ── Firebase Cloud Messaging: background push ────────────────────────────────
// Initialise Firebase using the env vars baked in by Vite at build time.
// The SW is built through VitePWA's injectManifest pipeline, so
// import.meta.env works here exactly as it does in the main app.
//
// Fail-soft: if the config is missing (e.g. CI placeholder build) or
// the messaging SDK throws, we log and continue — offline caching still
// works, push just won't be available.
const FCM_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

try {
  if (FCM_CONFIG.apiKey && FCM_CONFIG.projectId && FCM_CONFIG.appId) {
    // Re-use an existing Firebase app if the SW was refreshed (dev HMR).
    const firebaseApp =
      getApps().length > 0 ? getApps()[0] : initializeApp(FCM_CONFIG as FirebaseOptions);

    const messaging = getMessaging(firebaseApp);

    // Called when a push arrives while the app is CLOSED or BACKGROUNDED.
    // When the app is in the foreground, the client-side `onMessage`
    // handler in usePushNotifications.ts takes over (and deduplicates
    // with the Firestore bell — no double-toast).
    onBackgroundMessage(messaging, (payload) => {
      const data = (payload.data ?? {}) as Record<string, string>;

      // Our Cloud Functions send a `notification` payload, which the FCM
      // SDK already displays (with the server's icon/tag/link) and handles
      // clicks for. Showing our own as well produced duplicates, so we
      // only display data-only messages here.
      if (!payload.notification) {
        // `tag` deduplicates: a second push with the same tag replaces
        // the previous one instead of stacking.
        // `actions` (Android buttons) is valid in service workers but missing
        // from TypeScript's DOM lib, hence the widened options type.
        const options: NotificationOptions & { actions?: { action: string; title: string }[] } = {
          body: data.body || 'You have a new notification.',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: data.notifId || `ele-${Date.now()}`,
          data: {
            url: data.url ?? '/',
            notifId: data.notifId ?? '',
            type: data.type ?? '',
          },
          actions: [
            { action: 'open', title: 'View' },
            { action: 'dismiss', title: 'Dismiss' },
          ],
        };
        void self.registration.showNotification(data.title || 'Ele Café', options);
      }

      // Update the app badge only when the push carries an unread count.
      // (Previously a missing count parsed as 0 and cleared the badge on
      // every push.) The app re-syncs the badge whenever it's opened.
      // Returned so the FCM SDK awaits it inside the push event — iOS can
      // suspend the worker before an un-awaited badge update lands.
      const badge = parseInt(data.unreadCount ?? '', 10);
      if (!Number.isNaN(badge) && 'setAppBadge' in self.navigator) {
        const nav = self.navigator as WorkerNavigator & {
          setAppBadge: (n?: number) => Promise<void>;
          clearAppBadge: () => Promise<void>;
        };
        return (badge > 0 ? nav.setAppBadge(badge) : nav.clearAppBadge()).catch(() => {});
      }
    });
  }
} catch (err) {
  // Non-fatal: caching still works; push is unavailable for this session.
  console.warn('[SW] FCM init skipped (push disabled):', String(err).slice(0, 200));
}

// ── Notification click handler ───────────────────────────────────────────────
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  // User explicitly dismissed — don't navigate.
  if (event.action === 'dismiss') return;

  const data = event.notification.data as { url?: string; FCM_MSG?: unknown } | undefined;
  // Notifications displayed by the FCM SDK carry FCM_MSG and are opened by
  // the SDK's own click handler (fcmOptions.link) — don't navigate twice.
  if (data?.FCM_MSG) return;
  const url = data?.url ?? '/';
  const fullUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Bring an existing Ele Café tab into focus and navigate it.
      for (const client of windowClients as WindowClient[]) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.navigate(fullUrl).then(() => client.focus());
        }
      }
      // No open tab — open a new one.
      return self.clients.openWindow(fullUrl);
    }),
  );
});

// ── Message handler: SW lifecycle + badge sync ───────────────────────────────
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const msg = event.data as Record<string, unknown> | null;
  if (!msg) return;

  // SKIP_WAITING: sent by SwUpdateBanner via updateServiceWorker(true).
  // Without this handler the "Update now" button is a no-op.
  if (msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // SET_BADGE: sent by NotificationContext when the in-app unread count
  // changes. Keeps the badge in sync with what the bell shows.
  if (msg.type === 'SET_BADGE') {
    const count = Number(msg.count ?? 0);
    if ('setAppBadge' in self.navigator) {
      const nav = self.navigator as WorkerNavigator & {
        setAppBadge: (n?: number) => Promise<void>;
        clearAppBadge: () => Promise<void>;
      };
      if (count > 0) nav.setAppBadge(count).catch(() => {});
      else nav.clearAppBadge().catch(() => {});
    }
  }
});
