/**
 * Step5PersonalInfo.tsx — Personal info form (Step 5 of 6).
 *
 * Roadmap §6-step modal flow. Split from the old Step 3, which crammed
 * occasion + names + message into one screen. This step is just the
 * three personal-info fields:
 *   1. Recipient name (required)
 *   2. Sender name (required, defaults to user's display name when
 *      available)
 *   3. Gift message (textarea, 200-char limit, live counter)
 *
 * Plus a live MessagePreview below the textarea so the user sees
 * exactly how the printed card will read.
 *
 * The required gate (recipient + sender both non-empty) is enforced
 * by GiftBuilderModal `canContinue`. Step 4 (occasion) is optional and
 * happens before this step; Step 6 (review) reads from the store
 * directly.
 *
 * Delivery date picker is still deferred (SPEC line 405).
 */

import React, { useEffect } from 'react';
import { useGiftBuilderStore } from '@/store/giftBuilderStore';
import { useAuthGuard } from '@/guards/useAuthGuard';
import { MessagePreview } from '@/app/components/gift-builder/components/MessagePreview';
import { Field as FormField } from '@/app/components/ui/Field';

import { useT } from '@/i18n/useT';
const MESSAGE_MAX = 200;

export function Step5PersonalInfo() {
  const t = useT();
  const personalization    = useGiftBuilderStore(s => s.personalization);
  const setPersonalization = useGiftBuilderStore(s => s.setPersonalization);

  const { user } = useAuthGuard();

  // Default sender name from the logged-in user, one-shot. Fires only
  // when this step mounts AND the sender is still empty — we never
  // overwrite a value the user has typed/edited. Same pattern as the
  // pre-split Step3Personalize so signed-in users keep getting the
  // pre-fill behaviour they had before the split.
  useEffect(() => {
    if (!personalization.senderName && user?.displayName) {
      setPersonalization({ senderName: user.displayName });
    }
  }, [personalization.senderName, setPersonalization, user?.displayName]);

  const messageLen = personalization.message.length;
  const overLimit  = messageLen > MESSAGE_MAX;

  return (
    <div className="gb-step3-stack">
      <p className="gb-step3-intro">
        {t('Almost done. Tell us who this gift is for — the recipient sees your message printed on a card inside.')}
      </p>

      <FormField name="recipientName" required>
        <FormField.Label>{t('Recipient name')}</FormField.Label>
        <FormField.Input
          autoComplete="off"
          value={personalization.recipientName}
          onChange={e => setPersonalization({ recipientName: e.target.value })}
          placeholder={t('Jamie Smith')}
        />
      </FormField>

      <FormField name="senderName" required>
        <FormField.Label>{t('Sender name')}</FormField.Label>
        <FormField.Input
          autoComplete="name"
          value={personalization.senderName}
          onChange={e => setPersonalization({ senderName: e.target.value })}
          placeholder={t('Your name')}
        />
      </FormField>

      <div>
        <Label required={false}>{t('Gift message')}</Label>
        <textarea
          value={personalization.message}
          onChange={e => {
            // Hard cap at MESSAGE_MAX — keep store clean even if a paste overshoots.
            const v = e.target.value.slice(0, MESSAGE_MAX);
            setPersonalization({ message: v });
          }}
          placeholder={t('A short, heartfelt note (max {n} characters)', { n: MESSAGE_MAX })}
          aria-label={t('Gift message')}
          rows={4}
          className="gb-step3-message"
          data-over-limit={overLimit ? 'true' : 'false'}
        />
        <div
          className="gb-step3-counter"
          data-near-limit={messageLen > MESSAGE_MAX * 0.9 ? 'true' : 'false'}
        >
          {messageLen} / {MESSAGE_MAX}
        </div>
      </div>

      <div>
        <Label required={false}>{t('Preview')}</Label>
        <MessagePreview
          message={personalization.message}
          recipientName={personalization.recipientName}
          senderName={personalization.senderName}
        />
      </div>
    </div>
  );
}

// Eyebrow label primitive shared with the textarea + preview blocks.
// Kept inline (not extracted to ui/) because it's only used here and in
// the deleted Step3Personalize's split-form descendants.
function Label({ children, required }: { children: React.ReactNode; required: boolean }) {
  return (
    <label className="gb-step3-label">
      {children}
      {required && <span className="gb-step3-label-req">*</span>}
    </label>
  );
}
