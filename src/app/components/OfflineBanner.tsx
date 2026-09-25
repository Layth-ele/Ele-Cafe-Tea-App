/**
 * OfflineBanner.tsx — Phase 5 offline state surface
 *
 * A persistent top-of-page banner shown when the browser reports
 * navigator.onLine === false. Slides down on offline, slides up on
 * reconnect, brief "back online" confirmation before disappearing.
 *
 * Placement: rendered at the top of <AppShell />, above the Navbar,
 * so it's the first thing the user sees and it pushes the rest of
 * the app down (rather than overlaying it — overlays are easy to
 * dismiss accidentally).
 *
 * Accessibility:
 *   - role="status" + aria-live="polite" so screen readers announce
 *     the state change without interrupting the user's current task.
 *   - The visible text doesn't repeat — once "Back online" has been
 *     announced, the banner unmounts.
 *
 * What this is NOT:
 *   - A retry queue. The optimistic-mutation utility handles
 *     retries; this is just visual feedback.
 *   - A modal. It doesn't block the user; they can keep navigating.
 *     Many actions still work offline (cached data, local-state
 *     forms) — we don't pretend the app is broken.
 */
import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useOnline } from '@/hooks/useOnline';

import { useT } from '@/i18n/useT';
export function OfflineBanner() {
  const tr = useT();
  const online = useOnline();
  // Track the "transitioning back online" state so we can show
  // "Back online" briefly before the banner unmounts.
  const [showReconnect, setShowReconnect] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online && !wasOffline.current) {
      wasOffline.current = true;
    } else if (online && wasOffline.current) {
      // Just came back online — show the "back online" confirmation
      // for 2.5s, then unmount.
      setShowReconnect(true);
      const t = setTimeout(() => {
        setShowReconnect(false);
        wasOffline.current = false;
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [online]);

  if (online && !showReconnect) return null;

  return (
    <div
      className="ofb-banner"
      data-state={online ? 'reconnected' : 'offline'}
      role="status"
      aria-live="polite"
    >
      {online ? (
        <>
          <Wifi size={14} className="ofb-icon" aria-hidden="true" />
          <span className="ofb-text">{tr('Back online')}</span>
        </>
      ) : (
        <>
          <WifiOff size={14} className="ofb-icon" aria-hidden="true" />
          <span className="ofb-text">
            {tr('You\'re offline. Some actions won\'t work until you reconnect.')}
          </span>
        </>
      )}
    </div>
  );
}
