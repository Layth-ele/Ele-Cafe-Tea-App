import { useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useSettingsQuery } from '@/hooks/useSettings';
import { tNow } from '@/i18n/useT';

/**
 * Gift Builder links stay visible everywhere (menu, footer, home page,
 * search). While Admin → Settings → Gift Builder is off, a click shows
 * a "coming soon" toast instead of opening /gifts. Admins still go
 * through so they can preview the page.
 *
 * Usage: `const giftsClick = useGiftsComingSoon();` then
 * `<Link to="/gifts" onClick={giftsClick}>` — or call `giftsClick()`
 * before navigating in code; it returns true when it blocked the visit.
 */
export function useGiftsComingSoon() {
  const { data: settings } = useSettingsQuery();
  const { isAdmin } = useAuth();
  const comingSoon = settings?.giftBuilderEnabled !== true && !isAdmin;
  return useCallback(
    (e?: { preventDefault: () => void }): boolean => {
      if (!comingSoon) return false;
      e?.preventDefault();
      toast(tNow('Gift Builder — coming soon'), {
        id: 'gifts-coming-soon',
        description: tNow(
          'We’re putting the finishing touches on our tea gift boxes. Check back soon!',
        ),
      });
      return true;
    },
    [comingSoon],
  );
}
