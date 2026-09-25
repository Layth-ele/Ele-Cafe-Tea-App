/**
 * Back-in-stock email requests ("Notify me" on a sold-out tea).
 *
 * A request is the user's wishlist doc for that tea with `notify: true`:
 *   /users/{uid}/wishlist/{slug}
 * The onInventoryWrite Cloud Function finds these with a collectionGroup
 * query when the tea goes from out_of_stock to available, emails each
 * user once, then sets notify back to false.
 *
 * Written directly (not through useWishlistSync's debounced mirror) so
 * the UI only confirms once the request is actually saved server-side.
 */
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { WishlistItem } from '@/store/wishlistStore';

export async function requestBackInStock(uid: string, item: WishlistItem): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'wishlist', item.slug),
    {
      slug:              item.slug,
      name:              item.name,
      category:          item.category,
      image:             item.image,
      priceAtSave:       item.priceAtSave,
      addedAtMs:         item.addedAt,
      notify:            true,
      notifyRequestedAt: serverTimestamp(),
      updatedAt:         serverTimestamp(),
    },
    { merge: true },
  );
}

export async function cancelBackInStock(uid: string, slug: string): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'wishlist', slug),
    { notify: false, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
