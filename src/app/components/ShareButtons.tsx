/**
 * ShareButtons — reusable share strip used across the site.
 *
 * Four buttons, in this order: Instagram, TikTok, WhatsApp, Copy link.
 *
 * What's NOT possible (be honest about this):
 *   • Instagram does not expose any web API to pre-fill story content,
 *     post captions, or DMs. Their `instagram://` deeplink schemes are
 *     undocumented and reject most parameters. Period.
 *   • TikTok is the same — `tiktok://` schemes are unreliable and
 *     reject pre-filled content. The web upload URL takes no params.
 *
 * What this component actually does for IG/TikTok:
 *   1. Copy the URL to clipboard
 *   2. Try to open the app (instagram://, tiktok://, with desktop
 *      web fallbacks)
 *   3. Show a toast: "Link copied — paste in Instagram"
 *
 * That's the realistic UX. Anything fancier is a lie that ships
 * broken in production.
 *
 * On mobile, we also try the native Web Share API (navigator.share)
 * BEFORE falling back to per-platform handling — it pops the iOS/
 * Android share sheet which lists IG, TikTok, and every other
 * installed app. That's the right answer when available. We only
 * use it on the IG/TikTok buttons specifically (not the WhatsApp/
 * Copy buttons, which have working direct paths).
 */
import { Copy, Music2 } from 'lucide-react';
import { toast } from 'sonner';

import { tNow, useT } from '@/i18n/useT';
interface ShareButtonsProps {
  /** Title used in share text and as the share-sheet "title". */
  title: string;
  /** Full canonical URL to share. */
  url:   string;
  /** Optional shortform body for the share text. Defaults to "{title} — {url}". */
  text?: string;
  /** Visual size — small (40px) for inline strips, medium (46px) for hero strips. */
  size?: 'sm' | 'md';
}

/** Detect if the device likely has the native share sheet (mobile). */
function canUseNativeShare(): boolean {
  if (typeof navigator === 'undefined' || !navigator.share) return false;
  // Best-effort mobile detection — Web Share API exists in desktop
  // Safari but the share sheet there is awkward; we want it on
  // touch devices where it's the obviously-best UX.
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.warn('[ShareButtons] clipboard write failed:', err);
    return false;
  }
}

export function ShareButtons({ title, url, text, size = 'md' }: ShareButtonsProps) {
  const t = useT();
  const shareText = text ?? `${title} — ${url}`;
  const px = size === 'sm' ? 40 : 46;
  const iconSize = size === 'sm' ? 14 : 16;

  // ── Instagram ────────────────────────────────────────────────────────
  // Mobile: try native share sheet first (lets user pick IG story / DM /
  // anywhere). If unavailable or declined, copy link + open app.
  // Desktop: copy link + open instagram.com in a new tab.
  async function handleInstagram() {
    if (canUseNativeShare()) {
      try {
        await navigator.share({ title, text: shareText, url });
        return;
      } catch (err) {
        // User cancelled → exit silently. Other errors → fall through
        // to copy-and-launch fallback.
        if ((err as Error)?.name === 'AbortError') return;
        console.warn('[ShareButtons] native share failed (Instagram)', err);
      }
    }
    const copied = await copyToClipboard(url);
    if (copied) {
      toast.success(tNow('Link copied — paste in Instagram'), { duration: 4000 });
    } else {
      toast.error(tNow('Could not copy link'));
      return;
    }
    // Try the app deeplink. iOS will prompt to open IG; Android same.
    // Desktop falls through to instagram.com after a short delay.
    const t0 = Date.now();
    window.location.href = 'instagram://story-camera';
    setTimeout(() => {
      // If we're still in the page after 600 ms, the deeplink didn't
      // resolve (no IG installed, or desktop). Open web instead.
      if (document.visibilityState === 'visible' && Date.now() - t0 < 1500) {
        window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
      }
    }, 600);
  }

  // ── TikTok ───────────────────────────────────────────────────────────
  // Same constraints as Instagram. Mobile: native share. Desktop: copy
  // link + open tiktok.com upload page.
  async function handleTikTok() {
    if (canUseNativeShare()) {
      try {
        await navigator.share({ title, text: shareText, url });
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        console.warn('[ShareButtons] native share failed (TikTok)', err);
      }
    }
    const copied = await copyToClipboard(url);
    if (copied) {
      toast.success(tNow('Link copied — paste in TikTok'), { duration: 4000 });
    } else {
      toast.error(tNow('Could not copy link'));
      return;
    }
    const t0 = Date.now();
    window.location.href = 'snssdk1233://';   // TikTok app scheme
    setTimeout(() => {
      if (document.visibilityState === 'visible' && Date.now() - t0 < 1500) {
        window.open('https://www.tiktok.com/upload', '_blank', 'noopener,noreferrer');
      }
    }, 600);
  }

  // ── WhatsApp ─────────────────────────────────────────────────────────
  // wa.me works everywhere. On mobile it opens the WhatsApp app with
  // the chat picker; on desktop it opens web.whatsapp.com or the
  // installed desktop app.
  function handleWhatsApp() {
    const href = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  // ── Copy link ────────────────────────────────────────────────────────
  async function handleCopy() {
    const copied = await copyToClipboard(url);
    if (copied) {
      toast.success(tNow('Link copied!'));
    } else {
      toast.error('Could not copy. URL: ' + url);
    }
  }

  const buttons: Array<{
    label: string;
    bg:    string;
    icon:  React.ReactNode;
    onClick: () => void;
  }> = [
    {
      label:   t('Share to Instagram'),
      bg:      'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
      onClick: handleInstagram,
      icon: (
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="white" aria-hidden="true">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      ),
    },
    {
      label:   t('Share to TikTok'),
      bg:      '#010101',
      onClick: handleTikTok,
      icon: (
        // TikTok logo — official treatment uses cyan + magenta offsets
        // but a single-tone white version reads cleaner on a black
        // button at this size.
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="white" aria-hidden="true">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.1z"/>
        </svg>
      ),
    },
    {
      label:   t('Share to WhatsApp'),
      bg:      '#25D366',
      onClick: handleWhatsApp,
      icon: (
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="white" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
        </svg>
      ),
    },
    {
      label:   t('Copy link'),
      bg:      'var(--midnight)',
      onClick: handleCopy,
      icon:    <Copy size={iconSize} color="white" aria-hidden />,
    },
  ];

  // Suppress lint warning for unused Music2 import we keep around in
  // case we want to swap to a different TikTok icon style later.
  void Music2;

  return (
    <div className="share-btns-row">
      {buttons.map(({ label, bg, icon, onClick }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          aria-label={label}
          title={label}
          className="share-btn"
          // Two values are dynamic per-button: pixel size (configurable
          // via the `px` prop) and brand color. Both flow in as CSS
          // custom properties so the .share-btn class can read them.
          // The class owns everything else — border, cursor, layout,
          // transitions, and the :hover lift effect.
          /* eslint-disable-next-line react/forbid-dom-props -- per-button dynamic size + color, not statically expressible */
          style={{ '--share-btn-size': `${px}px`, '--share-btn-bg': bg } as React.CSSProperties}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
