
import { useT } from '@/i18n/useT';/**
 * MessagePreview.tsx — Live preview of the gift card message.
 *
 * Day 16. Renders the message in brand typography (Cormorant Garamond
 * italic on cream, midnight ink) so the customer can see how it'll
 * look on the printed card.
 *
 * Falls back to a placeholder line ("Your message will appear here…")
 * when the textarea is empty. Sender / recipient lines are added if
 * those fields are filled — gives the preview real shape even when
 * the message body is short.
 */


interface MessagePreviewProps {
  message:        string;
  recipientName:  string;
  senderName:     string;
}

export function MessagePreview({
  message, recipientName, senderName,
}: MessagePreviewProps) {
  const t = useT();
  const hasContent = message.trim() || recipientName || senderName;

  return (
    <div
      role="region"
      aria-label={t('Gift card message preview')}
      className="msg-preview"
    >
      {/* Tiny corner label so users know this is a preview */}
      <span className="msg-preview-tag">{t('Card preview')}</span>

      <div className="msg-preview-body">
        {recipientName && (
          <div>{t('Dear {name},', { name: recipientName })}</div>
        )}

        <div className={`msg-preview-text ${message.trim() ? '' : 'is-placeholder'}`}>
          {message.trim() || (
            !hasContent
              ? t('Your message will appear here as you type.')
              : '…'
          )}
        </div>

        {senderName && (
          <div className="msg-preview-signature">
            — {senderName}
          </div>
        )}
      </div>
    </div>
  );
}
