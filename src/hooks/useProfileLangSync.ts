/**
 * useProfileLangSync — saves the site language on the signed-in
 * customer's profile (users/{uid}.lang) so emails sent later by the
 * server (e.g. back-in-stock) go out in the language they browse in.
 * Writes only when it changes; failures are silent (English fallback).
 */
import { useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguageStore } from '@/store/languageStore';
import { isInventoryEmail } from '@/lib/inventoryAccount';

const KEY = 'ele:profileLang';

export function useProfileLangSync(): void {
  const { currentUser } = useAuth();
  const lang = useLanguageStore((s) => s.language);
  const uid = currentUser?.uid;
  const staff = isInventoryEmail(currentUser?.email);

  useEffect(() => {
    if (!uid || staff) return;
    const mark = `${uid}:${lang}`;
    try { if (localStorage.getItem(KEY) === mark) return; } catch { /* storage blocked */ }
    updateDoc(doc(db, 'users', uid), { lang })
      .then(() => { try { localStorage.setItem(KEY, mark); } catch { /* ignore */ } })
      .catch(() => { /* profile not created yet — retried next load */ });
  }, [uid, lang, staff]);
}
