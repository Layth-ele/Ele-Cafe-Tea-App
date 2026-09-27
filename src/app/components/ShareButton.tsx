/**
 * ShareButton — single-icon share affordance.
 *
 * On devices that expose the Web Share API (essentially every modern
 * mobile browser plus Safari on macOS), tapping opens the native
 * share sheet — user picks Messages / Mail / WhatsApp / etc.
 *
 * On desktop browsers that don't have navigator.share (Chromium and
 * Firefox on Windows / Linux), we fall back to copying the URL to
 * the clipboard and showing a "Link copied" toast.
 *
 * This is intentionally a single button — distinct from ShareButtons
 * (plural) which renders per-platform icons. Use ShareButton when
 * "share with anyone" is the right affordance; use ShareButtons when
 * the page benefits from per-platform deeplinks (e.g. Instagram-first
 * content like loyalty share cards).
 */

import { Share2 } from 'lucide-react';
import { toast } from 'sonner';

import { useT, tNow } from '@/i18n/useT';
export interface ShareButtonProps {
  title: string;
  url: string;
  text?: string;
  /** Visual variant. 'icon' is a 40×40 round icon button; 'pill' is
   * a labelled outline button. Defaults to 'icon'. */
  variant?: 'icon' | 'pill';
  className?: string;
}

function canUseNativeShare(): boolean {
  if (typeof navigator === 'undefined' || !navigator.share) return false;
  // Web Share API exists on Safari macOS too. We don't gate by mobile
  // detection because the macOS share sheet is genuinely useful (AirDrop,
  // Messages, Mail). The user only sees the share dialog if they tap.
  return true;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to execCommand */
  }
  // Legacy fallback. iOS Safari before 13 needed this; modern browsers
  // never reach this path, but it's tiny and bulletproof.
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function ShareButton({ title, url, text, variant = 'icon', className }: ShareButtonProps) {
  const t = useT();
  async function handleShare() {
    if (canUseNativeShare()) {
      try {
        // Title + link only: some apps glue `text` onto the link, which
        // breaks it when pasted into an address bar.
        void text;
        await navigator.share({ title, url });
        return; // success — native sheet handled the rest
      } catch (err) {
        // User cancelled the share sheet → silent abort (the most common
        // path). Anything else falls through to clipboard copy.
        if ((err as Error)?.name === 'AbortError') return;
        // Permission / not-allowed errors land here too; clipboard
        // fallback is still a reasonable outcome.
      }
    }
    const ok = await copyToClipboard(url);
    if (ok) toast.success(tNow('Link copied to clipboard'), { duration: 3000 });
    else toast.error(tNow('Couldn’t copy link'));
  }

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={handleShare}
        className={`btn btn-outline btn-sm share-btn-pill${className ? ' ' + className : ''}`}
        aria-label={t('Share {title}', { title })}
      >
        <Share2 size={14} aria-hidden="true" />
        <span>{t('Share')}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`share-btn-icon${className ? ' ' + className : ''}`}
      aria-label={t('Share {title}', { title })}
      title={t('Share')}
    >
      <Share2 size={16} aria-hidden="true" />
    </button>
  );
}
