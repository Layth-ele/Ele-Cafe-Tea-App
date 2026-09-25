/**
 * useStoreContent — the store's address, phone, email, hours, socials,
 * shipping and points, normalised from Admin → Settings.
 *
 * Every customer-facing mention of these facts (contact card, footer,
 * policy pages, homepage FAQ, LocalBusiness JSON-LD) reads from here, so
 * an edit in Settings shows up everywhere — and matches what renderSeo
 * sends to Google, which uses the same functions/src/lib/storeContent.ts.
 */
import { useMemo } from 'react';
import { useSettingsQuery } from '@/hooks/useSettings';
import { readStoreContent, type StoreContent } from '../../functions/src/lib/storeContent';

export function useStoreContent(): StoreContent {
  const { data: settings } = useSettingsQuery();
  return useMemo(() => readStoreContent(settings as Record<string, unknown> | undefined), [settings]);
}
